import json
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class SignalingManager:
    """WebRTC signaling relay for camera-to-viewer peer connections."""

    def __init__(self):
        # camera_id -> WebSocket (one per camera station)
        self.cameras: dict[str, WebSocket] = {}
        # camera_id -> list of viewer WebSockets
        self.viewers: dict[str, list[WebSocket]] = {}
        # Removed cameras that should reject reconnection
        self.removed_cameras: set[str] = set()

    def get_camera_ids(self) -> list[str]:
        """Return list of currently connected camera IDs."""
        return list(self.cameras.keys())

    async def handle_camera_signal(self, ws: WebSocket):
        """Handle signaling WebSocket from a camera station."""
        await ws.accept()
        camera_id = None
        try:
            while True:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "camera-register":
                    camera_id = msg["camera_id"]
                    if camera_id in self.removed_cameras:
                        await ws.close(code=1000, reason="Camera removed by admin")
                        return
                    self.cameras[camera_id] = ws
                    self.removed_cameras.discard(camera_id)
                    if camera_id not in self.viewers:
                        self.viewers[camera_id] = []
                    print(f"Camera registered for signaling: {camera_id}")

                elif msg_type == "answer" and camera_id:
                    # Camera sends SDP answer back to a specific viewer
                    viewer_id = msg.get("viewer_id")
                    viewers = self.viewers.get(camera_id, [])
                    if viewer_id is not None and 0 <= viewer_id < len(viewers):
                        try:
                            await viewers[viewer_id].send_text(json.dumps({
                                "type": "answer",
                                "camera_id": camera_id,
                                "data": msg["data"]
                            }))
                        except Exception:
                            pass

                elif msg_type == "ice-candidate" and camera_id:
                    # Camera sends ICE candidate to a specific viewer
                    viewer_id = msg.get("viewer_id")
                    viewers = self.viewers.get(camera_id, [])
                    if viewer_id is not None and 0 <= viewer_id < len(viewers):
                        try:
                            await viewers[viewer_id].send_text(json.dumps({
                                "type": "ice-candidate",
                                "camera_id": camera_id,
                                "data": msg["data"]
                            }))
                        except Exception:
                            pass

        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"Camera signaling error: {e}")
        finally:
            if camera_id:
                self.cameras.pop(camera_id, None)
                print(f"Camera disconnected from signaling: {camera_id}")

    async def handle_viewer_signal(self, ws: WebSocket):
        """Handle signaling WebSocket from a dashboard viewer."""
        await ws.accept()
        # Track which cameras this viewer subscribed to and their viewer_id per camera
        subscriptions: dict[str, int] = {}  # camera_id -> viewer_index
        try:
            while True:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "subscribe":
                    camera_id = msg["camera_id"]
                    if camera_id not in self.viewers:
                        self.viewers[camera_id] = []
                    viewer_id = len(self.viewers[camera_id])
                    self.viewers[camera_id].append(ws)
                    subscriptions[camera_id] = viewer_id

                    # Notify viewer of their viewer_id
                    await ws.send_text(json.dumps({
                        "type": "subscribed",
                        "camera_id": camera_id,
                        "viewer_id": viewer_id
                    }))

                elif msg_type == "offer":
                    # Viewer sends SDP offer to a camera
                    camera_id = msg["camera_id"]
                    viewer_id = subscriptions.get(camera_id)
                    cam_ws = self.cameras.get(camera_id)
                    if cam_ws and viewer_id is not None:
                        try:
                            await cam_ws.send_text(json.dumps({
                                "type": "offer",
                                "viewer_id": viewer_id,
                                "data": msg["data"]
                            }))
                        except Exception:
                            pass

                elif msg_type == "ice-candidate":
                    # Viewer sends ICE candidate to a camera
                    camera_id = msg["camera_id"]
                    viewer_id = subscriptions.get(camera_id)
                    cam_ws = self.cameras.get(camera_id)
                    if cam_ws and viewer_id is not None:
                        try:
                            await cam_ws.send_text(json.dumps({
                                "type": "ice-candidate",
                                "viewer_id": viewer_id,
                                "data": msg["data"]
                            }))
                        except Exception:
                            pass

        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"Viewer signaling error: {e}")
        finally:
            # Remove viewer from all subscriptions
            for camera_id, viewer_idx in subscriptions.items():
                viewers = self.viewers.get(camera_id, [])
                if viewer_idx < len(viewers) and viewers[viewer_idx] is ws:
                    viewers[viewer_idx] = None  # type: ignore — mark as disconnected, don't shift indices

    async def drop_camera(self, camera_id: str):
        """Remove a camera and close its signaling connection."""
        self.removed_cameras.add(camera_id)
        ws = self.cameras.pop(camera_id, None)
        if ws:
            try:
                await ws.close(code=1000, reason="Camera removed by admin")
            except Exception:
                pass

        # Notify all viewers watching this camera
        for viewer_ws in self.viewers.pop(camera_id, []):
            if viewer_ws:
                try:
                    await viewer_ws.send_text(json.dumps({
                        "type": "camera-removed",
                        "camera_id": camera_id
                    }))
                except Exception:
                    pass


signaling_manager = SignalingManager()
