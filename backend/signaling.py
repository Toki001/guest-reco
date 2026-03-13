import json
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class StreamManager:
    """MJPEG frame relay + camera lifecycle management.

    Cameras send base64 JPEG frames over WebSocket.
    Server relays frames to all connected viewers.
    Simple, reliable, no WebRTC complexity.
    """

    def __init__(self):
        self.latest_frames: dict[str, str] = {}  # camera_id -> base64 jpeg
        self.viewers: list[WebSocket] = []
        self.camera_streams: dict[str, WebSocket] = {}  # camera_id -> ws
        self.removed_cameras: set[str] = set()

    async def handle_camera_stream(self, ws: WebSocket):
        """Handle incoming MJPEG frames from a camera station."""
        await ws.accept()
        camera_id = None
        try:
            while True:
                data = await ws.receive_text()
                msg = json.loads(data)
                cid = msg.get("camera_id")
                if not cid:
                    continue

                # Track camera
                if cid not in self.camera_streams:
                    self.camera_streams[cid] = ws
                    self.removed_cameras.discard(cid)
                    camera_id = cid

                # Reject removed cameras
                if cid in self.removed_cameras:
                    await ws.close(code=1000, reason="Camera removed by admin")
                    break

                # Store and relay frame
                frame = msg.get("frame")
                if frame:
                    self.latest_frames[cid] = frame
                    await self._relay_frame(cid, frame)

        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"Stream error: {e}")
        finally:
            if camera_id:
                self.camera_streams.pop(camera_id, None)

    async def handle_camera_view(self, ws: WebSocket):
        """Handle a dashboard viewer connection."""
        await ws.accept()
        self.viewers.append(ws)

        # Send all current frames on connect
        for cid, frame in self.latest_frames.items():
            try:
                await ws.send_json({"camera_id": cid, "frame": frame})
            except Exception:
                pass

        try:
            while True:
                await ws.receive_text()  # keep alive
        except WebSocketDisconnect:
            pass
        finally:
            if ws in self.viewers:
                self.viewers.remove(ws)

    async def _relay_frame(self, camera_id: str, frame: str):
        """Relay a frame to all connected viewers."""
        msg = {"camera_id": camera_id, "frame": frame}
        disconnected = []
        for viewer in self.viewers:
            try:
                await viewer.send_json(msg)
            except Exception:
                disconnected.append(viewer)
        for v in disconnected:
            if v in self.viewers:
                self.viewers.remove(v)

    async def drop_camera(self, camera_id: str):
        """Remove a camera and close its stream."""
        self.latest_frames.pop(camera_id, None)
        self.removed_cameras.add(camera_id)

        ws = self.camera_streams.pop(camera_id, None)
        if ws:
            try:
                await ws.close(code=1000, reason="Camera removed by admin")
            except Exception:
                pass

        # Notify viewers
        disconnected = []
        for viewer in self.viewers:
            try:
                await viewer.send_json({"camera_id": camera_id, "removed": True})
            except Exception:
                disconnected.append(viewer)
        for v in disconnected:
            if v in self.viewers:
                self.viewers.remove(v)


signaling_manager = StreamManager()
