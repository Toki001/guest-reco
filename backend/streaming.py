import json
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class StreamManager:
    """Manages camera frame ingestion and relay to viewers."""

    def __init__(self):
        self.latest_frames: dict[str, str] = {}  # camera_id -> base64 jpeg
        self.viewers: list[WebSocket] = []
        self.camera_streams: dict[str, WebSocket] = {}  # camera_id -> ws
        self.removed_cameras: set[str] = set()  # cameras pending disconnect

    async def add_viewer(self, ws: WebSocket):
        await ws.accept()
        self.viewers.append(ws)
        # Send all current frames on connect
        for camera_id, frame in self.latest_frames.items():
            try:
                await ws.send_json({"camera_id": camera_id, "frame": frame})
            except Exception:
                pass

    def remove_viewer(self, ws: WebSocket):
        if ws in self.viewers:
            self.viewers.remove(ws)

    async def ingest_frame(self, camera_id: str, frame: str):
        """Store latest frame and relay to all viewers."""
        # Reject frames from removed cameras
        if camera_id in self.removed_cameras:
            return
        self.latest_frames[camera_id] = frame
        msg = {"camera_id": camera_id, "frame": frame}
        disconnected = []
        for viewer in self.viewers:
            try:
                await viewer.send_json(msg)
            except Exception:
                disconnected.append(viewer)
        for v in disconnected:
            self.remove_viewer(v)

    async def drop_camera(self, camera_id: str):
        """Remove a camera's frame buffer and forcefully close its stream."""
        self.latest_frames.pop(camera_id, None)
        self.removed_cameras.add(camera_id)

        # Close the camera's stream WebSocket
        ws = self.camera_streams.pop(camera_id, None)
        if ws:
            try:
                await ws.close(code=1000, reason="Camera removed by admin")
            except Exception:
                pass

        # Notify viewers to remove the camera card
        disconnected = []
        for viewer in self.viewers:
            try:
                await viewer.send_json({"camera_id": camera_id, "removed": True})
            except Exception:
                disconnected.append(viewer)
        for v in disconnected:
            self.remove_viewer(v)

    async def handle_camera_stream(self, ws: WebSocket):
        """Handle incoming frames from a camera station."""
        await ws.accept()
        try:
            while True:
                data = await ws.receive_text()
                msg = json.loads(data)
                cid = msg["camera_id"]

                # Track this WebSocket by camera_id
                if cid not in self.camera_streams:
                    self.camera_streams[cid] = ws
                    self.removed_cameras.discard(cid)  # allow re-registration

                # Reject if removed
                if cid in self.removed_cameras:
                    await ws.close(code=1000, reason="Camera removed by admin")
                    break

                await self.ingest_frame(cid, msg["frame"])
        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"Stream error: {e}")
        finally:
            # Clean up: remove this ws from camera_streams
            to_remove = [cid for cid, w in self.camera_streams.items() if w is ws]
            for cid in to_remove:
                self.camera_streams.pop(cid, None)

    async def handle_camera_view(self, ws: WebSocket):
        """Handle a dashboard viewer connection."""
        await self.add_viewer(ws)
        try:
            while True:
                await ws.receive_text()  # keep alive
        except WebSocketDisconnect:
            self.remove_viewer(ws)


stream_manager = StreamManager()
