import json
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class SignalingManager:
    """WebRTC signaling relay with queuing for timing resilience."""

    def __init__(self):
        self.cameras: dict[str, WebSocket] = {}
        self.viewers: dict[str, list[WebSocket | None]] = {}
        self.removed_cameras: set[str] = set()
        # Queued offers waiting for cameras to connect
        self.pending_offers: dict[str, list[dict]] = {}  # camera_id -> [offer_msgs]

    async def handle_camera_signal(self, ws: WebSocket):
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
                    print(f"[Signaling] Camera registered: {camera_id}")

                    # Deliver any queued offers
                    pending = self.pending_offers.pop(camera_id, [])
                    for offer_msg in pending:
                        try:
                            await ws.send_text(json.dumps(offer_msg))
                            print(f"[Signaling] Delivered queued offer to {camera_id} (viewer_id={offer_msg.get('viewer_id')})")
                        except Exception:
                            pass

                elif msg_type == "answer" and camera_id:
                    viewer_id = msg.get("viewer_id")
                    viewers = self.viewers.get(camera_id, [])
                    if viewer_id is not None and 0 <= viewer_id < len(viewers):
                        viewer_ws = viewers[viewer_id]
                        if viewer_ws:
                            try:
                                await viewer_ws.send_text(json.dumps({
                                    "type": "answer",
                                    "camera_id": camera_id,
                                    "data": msg["data"]
                                }))
                            except Exception:
                                pass

                elif msg_type == "ice-candidate" and camera_id:
                    viewer_id = msg.get("viewer_id")
                    viewers = self.viewers.get(camera_id, [])
                    if viewer_id is not None and 0 <= viewer_id < len(viewers):
                        viewer_ws = viewers[viewer_id]
                        if viewer_ws:
                            try:
                                await viewer_ws.send_text(json.dumps({
                                    "type": "ice-candidate",
                                    "camera_id": camera_id,
                                    "data": msg["data"]
                                }))
                            except Exception:
                                pass

        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"[Signaling] Camera error: {e}")
        finally:
            if camera_id:
                self.cameras.pop(camera_id, None)
                print(f"[Signaling] Camera disconnected: {camera_id}")

    async def handle_viewer_signal(self, ws: WebSocket):
        await ws.accept()
        subscriptions: dict[str, int] = {}
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

                    await ws.send_text(json.dumps({
                        "type": "subscribed",
                        "camera_id": camera_id,
                        "viewer_id": viewer_id,
                        "camera_connected": camera_id in self.cameras
                    }))

                elif msg_type == "offer":
                    camera_id = msg["camera_id"]
                    viewer_id = subscriptions.get(camera_id)
                    cam_ws = self.cameras.get(camera_id)

                    offer_msg = {
                        "type": "offer",
                        "viewer_id": viewer_id,
                        "data": msg["data"]
                    }

                    if cam_ws and viewer_id is not None:
                        # Camera is connected — deliver immediately
                        try:
                            await cam_ws.send_text(json.dumps(offer_msg))
                        except Exception:
                            pass
                    elif viewer_id is not None:
                        # Camera NOT connected — queue the offer
                        if camera_id not in self.pending_offers:
                            self.pending_offers[camera_id] = []
                        self.pending_offers[camera_id].append(offer_msg)
                        print(f"[Signaling] Queued offer for {camera_id} (camera not connected yet)")

                elif msg_type == "ice-candidate":
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
            print(f"[Signaling] Viewer error: {e}")
        finally:
            for camera_id, viewer_idx in subscriptions.items():
                viewers = self.viewers.get(camera_id, [])
                if viewer_idx < len(viewers) and viewers[viewer_idx] is ws:
                    viewers[viewer_idx] = None

    async def drop_camera(self, camera_id: str):
        self.removed_cameras.add(camera_id)
        self.pending_offers.pop(camera_id, None)
        ws = self.cameras.pop(camera_id, None)
        if ws:
            try:
                await ws.close(code=1000, reason="Camera removed by admin")
            except Exception:
                pass

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
