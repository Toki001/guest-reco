# WebRTC Streaming + Face Recognition Accuracy Refactor

## Overview
Replace WebSocket MJPEG streaming with WebRTC peer-to-peer video, and improve face recognition accuracy with stricter thresholds + double-verify.

## Architecture Change

### Before (WebSocket MJPEG)
```
Camera Station → WS /ws/camera-stream → StreamManager → WS /ws/camera-view → Dashboard Grid
                                              ↑
                                    Base64 JPEG relay (5fps)
```

### After (WebRTC)
```
Camera Station ←──WebRTC PeerConnection──→ Dashboard Grid
                         ↑
              Signaling via /ws/dashboard (SDP + ICE only)
              Backend never touches video frames
```

- **Signaling**: Reuse existing `/ws/dashboard` WebSocket for SDP offer/answer and ICE candidate exchange
- **STUN only**: LAN/offline, no TURN server needed. Use `stun:stun.l.google.com:19302` as fallback if available, but works without internet
- **Multi-viewer**: Each dashboard viewer creates a separate RTCPeerConnection to each camera

## Tasks

### Task 1: Face Recognition Accuracy Improvements
**Files:** `backend/face_engine.py`, `backend/config.py`

1. In `config.py`, change `FACE_DISTANCE_THRESHOLD` default from `0.6` to `0.45`
2. In `face_engine.py`, add double-verify logic to `search_face()`:
   - After finding a match, run `face_recognition.face_encodings(image)` a second time with `num_jitters=2` (more accurate but slower)
   - Compare second encoding against the matched user's stored encoding
   - Only confirm match if second pass also matches same user AND distance < threshold
   - If second pass disagrees, return `None` (treat as unknown → guest)
3. Add confidence floor: if best_distance > 0.45 but < 0.55, still return None (gray zone = unknown)
4. Remove `_face_lock` — no longer needed since batch endpoint already serializes in one thread

**Acceptance:** False positive rate significantly reduced. Two-pass verification catches single-frame flukes.

### Task 2: WebRTC Signaling Backend
**Files:** `backend/app.py`, `backend/streaming.py`

1. Rewrite `streaming.py` → `signaling.py`:
   - Remove `StreamManager` class entirely
   - Create `SignalingManager` class:
     ```python
     class SignalingManager:
         def __init__(self):
             self.cameras: dict[str, WebSocket] = {}  # camera_id -> ws
             self.viewers: dict[str, list[WebSocket]] = {}  # camera_id -> [viewer_ws]

         async def register_camera(self, camera_id, ws)
         async def unregister_camera(self, camera_id)
         async def register_viewer(self, camera_id, ws)
         async def relay_to_camera(self, camera_id, msg, from_viewer)
         async def relay_to_viewer(self, camera_id, msg, to_viewer_index)
     ```
   - Signaling messages: `{type: "offer"|"answer"|"ice-candidate", camera_id, data, viewer_id?}`

2. In `app.py`:
   - Replace `from streaming import stream_manager` with `from signaling import signaling_manager`
   - Replace `/ws/camera-stream` with `/ws/camera-signal`:
     - Camera connects, sends `{type: "camera-register", camera_id}`
     - Relays SDP answers and ICE candidates to viewers
   - Replace `/ws/camera-view` with `/ws/viewer-signal`:
     - Viewer connects, sends `{type: "subscribe", camera_id}` for each camera
     - Relays SDP offers and ICE candidates to cameras
   - Update `remove_camera` endpoint to call `signaling_manager.unregister_camera()` instead of `stream_manager.drop_camera()`
   - Keep `/ws/dashboard` as-is (stats/events only, not signaling) — actually, use separate signaling sockets to keep concerns clean

**Acceptance:** Signaling messages flow between camera and viewer WebSockets. No video data passes through server.

### Task 3: Camera Station WebRTC (Frontend Sender)
**Files:** `frontend/src/components/CameraFeed.tsx`

1. Remove the MJPEG WebSocket streaming setup (lines ~84-106 in current code):
   - Remove `streamWs`, `streamCanvas`, `streamInterval`, `_streamCleanup`
2. Add WebRTC peer connection management:
   - Connect to `/ws/camera-signal?key=<apiKey>` WebSocket
   - Send `{type: "camera-register", camera_id}` on connect
   - When a viewer subscribes (receives `{type: "offer", viewer_id, data}`):
     - Create new `RTCPeerConnection` with STUN config
     - Add local video track from `videoStream`
     - Set remote description from offer
     - Create answer, set local description
     - Send `{type: "answer", viewer_id, data: localDescription}` back
     - Exchange ICE candidates via `{type: "ice-candidate", viewer_id, data}`
   - Track multiple peer connections (one per viewer) in a Map
   - Clean up connections when viewer disconnects or component unmounts

**Acceptance:** Camera station establishes WebRTC connections with viewers. Video streams peer-to-peer.

### Task 4: Camera Grid WebRTC (Frontend Viewer)
**Files:** `frontend/src/pages/CameraGridPage.tsx`

1. Remove WebSocket MJPEG viewer logic:
   - Remove `ws/camera-view` connection
   - Remove base64 frame handling
   - Remove `<img src="data:image/jpeg;base64,...">` rendering
2. Add WebRTC viewer:
   - Connect to `/ws/viewer-signal?token=<jwt>` WebSocket
   - Fetch camera list from `/api/cameras` on mount
   - For each online camera:
     - Create `RTCPeerConnection` with STUN config
     - Create offer, send via signaling
     - On answer received, set remote description
     - Exchange ICE candidates
     - On `track` event, attach `MediaStream` to `<video>` element
   - Replace `<img>` with `<video autoPlay playsInline muted>` per camera card
   - Handle camera add/remove dynamically (new camera → new peer connection, removed → close connection)
   - Keep existing UI (grid layout, fullscreen, remove button, FPS counter)
   - FPS: use `requestVideoFrameCallback` on the video element instead of counting WebSocket messages

**Acceptance:** Dashboard shows live WebRTC video from all cameras. Lower latency, better quality than MJPEG.

### Task 5: Cleanup + Remove Old Streaming Code
**Files:** `backend/streaming.py` (delete), `backend/app.py`, `frontend/src/components/CameraFeed.tsx`

1. Delete `backend/streaming.py`
2. Remove any remaining references to `stream_manager`, `StreamManager`, `/ws/camera-stream`, `/ws/camera-view`
3. TypeScript compile check
4. Backend import verification
5. Commit all changes

**Acceptance:** No dead code. Clean build. WebRTC fully replaces WebSocket streaming.

## Task Dependencies
```
Task 1 (accuracy) ─── independent, can go first
Task 2 (signaling backend) → Task 3 (camera sender) → Task 4 (viewer) → Task 5 (cleanup)
```

Task 1 can run in parallel with Task 2. Tasks 3-4 depend on Task 2. Task 5 is last.

## Key Decisions
- **STUN only** — works on LAN without internet. Config: `{iceServers: [{urls: "stun:stun.l.google.com:19302"}]}` but also works with empty iceServers on same subnet
- **Separate signaling sockets** — `/ws/camera-signal` and `/ws/viewer-signal` keep concerns clean, don't pollute dashboard WS
- **One PeerConnection per camera-viewer pair** — simple mesh, fine for <10 cameras
- **Video element replaces img** — `<video>` gets hardware-decoded WebRTC stream instead of base64 JPEG blitting
