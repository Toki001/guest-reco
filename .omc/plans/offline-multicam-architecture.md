# Plan: SecureSight Offline + Distributed Multi-Camera Architecture

**Branch:** `ralph/offline-multicam-architecture`
**Created:** 2026-03-10
**Revised:** 2026-03-10 (v3 -- critic fixes: Sidebar routing, state clarity, shared config, PRD deviation)

---

## 1. Requirements Summary

SecureSight currently depends on three cloud services: AWS Rekognition (face recognition), Supabase PostgreSQL (database), and Supabase Storage (image hosting). The frontend also loads MediaPipe WASM/models from CDN. This plan replaces ALL cloud dependencies with local alternatives and adds distributed multi-camera support across a school LAN.

**Current Cloud Dependencies:**
- `boto3` + AWS Rekognition for face indexing/searching (`backend/aws.py`)
- `supabase` Python client for DB reads/writes (`backend/database.py`, `backend/app.py`)
- Supabase Storage for avatar/snapshot uploads (`backend/app.py` lines 76-77, 179-180)
- `@supabase/supabase-js` frontend client (`frontend/src/supabaseClient.ts`) -- currently imported but DashboardTab is fully hardcoded/static
- MediaPipe CDN URLs in `CameraFeed.tsx` lines 55-56 (WASM) and line 61 (model)

**Replacements:**
| Cloud Service | Local Replacement |
|---|---|
| AWS Rekognition | `face_recognition` library (dlib, 128-d embeddings) |
| Supabase PostgreSQL | SQLite via `sqlite3` stdlib |
| Supabase Storage | Local filesystem + FastAPI `StaticFiles` mounts |
| MediaPipe CDN | Bundled WASM/model files in `frontend/public/` |
| Supabase Realtime | WebSocket `/ws/dashboard` push from FastAPI |

**Architecture Change (v2):** "Multi-camera" means cameras deployed on **separate devices on a school LAN** (tablets/laptops in different departments), NOT multiple USB cameras on one machine. Each camera station is simply a browser tab loading the React app from the central server.

**Network Architecture:**
```
School LAN (192.168.1.0/24)
    |
    +-- Central Server: 192.168.1.100
    |     - Docker: backend on :5001, frontend on :3000
    |     - Serves the React app to ALL devices
    |     - SQLite DB, face_recognition, WebSocket broadcast
    |
    +-- Camera Station A: tablet in Engineering dept
    |     - Opens http://192.168.1.100:3000/camera/engineering
    |
    +-- Camera Station B: tablet in IT dept
    |     - Opens http://192.168.1.100:3000/camera/it
    |
    +-- Admin PC
          - Opens http://192.168.1.100:3000/dashboard
```

Camera stations are just browsers loading the React app from the central server. No local install needed on camera devices.

**PRD Deviation Notice:** The original PRD user stories US-007 (USB camera enumeration via `navigator.mediaDevices.enumerateDevices()`) and US-008 (multi-camera grid view on a single machine) are **intentionally superseded** by this distributed LAN architecture. Instead of enumerating USB cameras on one host, each camera is a separate browser on a separate LAN device navigating to `/camera/:id`. Instead of a grid view showing multiple feeds simultaneously, the dashboard shows camera online/offline status and receives recognition events via WebSocket. This is a deliberate architectural decision: the school deployment requires cameras in physically separate departments (Engineering, IT, etc.), which cannot be served by USB cables from a single machine.

---

## 2. Dependency Order

```
Step 1: SQLite database layer (includes cameras table)
    |
Step 2: Local filesystem storage  (depends on Step 1 for DB path config)
    |
Step 3: Local face recognition engine  (depends on Step 1 for encoding storage)
    |
Step 4: Update app.py endpoints (async def + asyncio.to_thread)  (depends on Steps 1, 2, 3)
    |
    +-- Step 5: Bundle MediaPipe locally  (independent of backend, can parallel with Step 4)
    |
Step 6: WebSocket dashboard endpoint + camera registration  (depends on Step 4)
    |
Step 7: App mode routing (URL-based /camera/:id vs /dashboard)  (depends on Steps 5, 6)
    |
Step 8: Camera station mode (CameraFeed + heartbeat + server URL)  (depends on Step 7)
    |
Step 9: Dashboard with WebSocket (live camera grid + recognition feed)  (depends on Steps 6, 7)
    |
Step 10: Config cleanup + deployment docs  (depends on all above)
    |
Step 11: Update AGENTS.md  (depends on all above)
```

**Parallelizable:** Step 5 can run in parallel with Steps 1-4 (frontend vs backend).

---

## 3. Detailed Implementation Steps

### Step 1: SQLite Database Layer (US-001)

**Files to modify:**
- `backend/database.py` -- FULL REWRITE

**Files to create:**
- None (database.py is rewritten in-place)

**What changes:**

Replace the entire contents of `backend/database.py`. Remove all `supabase` imports and the `create_client` initialization (lines 1-13). Replace with `sqlite3` stdlib.

**New `database.py` structure:**
```
- import sqlite3, datetime, os
- DB_PATH constant (from config or default "recognition.db")
- init_db() function: enables PRAGMA journal_mode=WAL for concurrent read/write safety, then CREATE TABLE IF NOT EXISTS for:
  - users(id TEXT PRIMARY KEY, name TEXT, face_encoding BLOB, image_path TEXT, role TEXT DEFAULT 'Employee')
  - access_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, status TEXT, confidence REAL, timestamp TEXT, snapshot_path TEXT, camera_id TEXT)
  - cameras(camera_id TEXT PRIMARY KEY, department TEXT, last_heartbeat TEXT, is_online INTEGER DEFAULT 1)
- get_connection() helper that returns sqlite3.Connection with row_factory = sqlite3.Row and check_same_thread=False
- get_user_profile(user_id) -> dict or None: SELECT * FROM users WHERE id = ?
- get_all_users() -> list[dict]: SELECT * FROM users
- insert_user(id, name, face_encoding_bytes, image_path, role) -> None
- log_access_attempt(user_id, status, confidence, snapshot_path=None, camera_id=None) -> None
- get_access_logs(limit=50) -> list[dict]: SELECT with JOIN on users, ORDER BY timestamp DESC
- get_last_status(user_id) -> str or None: for in/out toggle logic
- get_stats() -> dict: counts for total scans, employee matches, guest alerts
- register_camera(camera_id, department) -> None: INSERT OR REPLACE into cameras
- update_camera_heartbeat(camera_id) -> None: UPDATE last_heartbeat
- get_all_cameras() -> list[dict]: SELECT * FROM cameras
- mark_camera_offline(camera_id) -> None: UPDATE is_online = 0
- Keep USER_STATE_CACHE and KNOWN_USERS_CACHE dicts for performance (carry over from current database.py lines 16-17)
- Call init_db() at module load time
```

**Key differences from current code:**
- `upload_image_to_supabase()` removed (replaced by filesystem logic in Step 2)
- `log_access_attempt` now takes `camera_id` parameter
- `face_encoding` stored as BLOB (numpy bytes) instead of `face_id` string
- No more Supabase client initialization
- `init_db()` enables WAL mode (`PRAGMA journal_mode=WAL`) for safe concurrent multi-camera access
- `get_connection()` uses `check_same_thread=False` so connections can be shared across FastAPI worker threads
- **NEW:** `cameras` table for tracking registered camera stations and their online/offline status

**Acceptance criteria:**
- [ ] `import database` succeeds without supabase installed
- [ ] `recognition.db` file created automatically on first import
- [ ] `users`, `access_logs`, and `cameras` tables exist with correct schema
- [ ] All CRUD functions work: insert_user, get_user_profile, log_access_attempt, get_access_logs
- [ ] Camera registration functions work: register_camera, update_camera_heartbeat, get_all_cameras
- [ ] In/out toggle logic preserved via get_last_status + USER_STATE_CACHE
- [ ] SQLite connection uses `check_same_thread=False` in `get_connection()`
- [ ] `init_db()` enables WAL mode: verify with `PRAGMA journal_mode` returning `wal`

**Commit:** `replace Supabase DB with SQLite database layer (includes cameras table)`

---

### Step 2: Local Filesystem Storage (US-002)

**Files to modify:**
- `backend/app.py` -- Add StaticFiles mounts (add near line 24, after CORS middleware)

**Directories to create at runtime:**
- `backend/avatars/`
- `backend/snapshots/`

**What changes in `app.py`:**
- Add `from fastapi.staticfiles import StaticFiles`
- Add `os.makedirs("avatars", exist_ok=True)` and `os.makedirs("snapshots", exist_ok=True)` before app mounts
- Add `app.mount("/avatars", StaticFiles(directory="avatars"), name="avatars")`
- Add `app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")`

**IMPORTANT:** Static mounts must be added AFTER all API route definitions (FastAPI matches routes in order; if `/avatars` mount is before routes, it will shadow `/api/*` routes). Place mounts at the bottom of the file, before the `if __name__` block.

**Helper function to add (in app.py or a utils module):**
```python
def save_image_locally(image_bytes: bytes, directory: str, filename: str) -> str:
    """Save image bytes to local directory, return URL path."""
    filepath = os.path.join(directory, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    return f"/{directory}/{filename}"
```

**Acceptance criteria:**
- [ ] `backend/avatars/` and `backend/snapshots/` directories auto-created on startup
- [ ] `GET /avatars/test.jpg` serves a static file
- [ ] `save_image_locally` writes bytes to disk and returns correct URL path
- [ ] No Supabase storage calls remain

**Commit:** `add local filesystem storage with FastAPI static file serving`

---

### Step 3: Local Face Recognition Engine (US-003)

**Files to create:**
- `backend/face_engine.py` -- NEW FILE

**Files to delete:**
- `backend/aws.py` -- DELETE entirely

**Files to modify:**
- `backend/requirements.txt` -- Remove `boto3`, add `face_recognition`, `numpy`

**New `face_engine.py` structure:**
```
- import face_recognition, numpy as np
- from database import get_all_users (to load known encodings)

FACE_DISTANCE_THRESHOLD from config (default 0.6)

def index_face(image_bytes: bytes) -> bytes | None:
    """Extract 128-d face encoding from image bytes.
    Returns encoding as numpy bytes (via .tobytes()), or None if no face found."""
    - Load image via face_recognition.load_image_file(io.BytesIO(image_bytes))
    - Get encodings via face_recognition.face_encodings(image)
    - Return first encoding.tobytes() or None

def search_face(image_bytes: bytes) -> dict | None:
    """Compare image against all known face encodings in DB.
    Returns:
      - {"user_id": str, "confidence": float} if match found
      - {"no_face": True} if no face detected in image
      - None if face detected but no match in DB
    """
    - Extract encoding from image_bytes (same as index_face)
    - If no encoding found (no face in image), return {"no_face": True}
    - Load all users from DB: get_all_users()
    - For each user, reconstruct numpy array: np.frombuffer(user["face_encoding"], dtype=np.float64)
    - Use face_recognition.face_distance() to compute distances
    - Find minimum distance; if < FACE_DISTANCE_THRESHOLD, return match
    - Convert distance to confidence: confidence = round((1 - distance) * 100, 1)
    - Return None if no match (face was detected but not recognized)
```

**Key design decisions:**
- Encodings stored as raw numpy bytes (128 * 8 = 1024 bytes per face) in SQLite BLOB column
- `face_recognition.load_image_file` accepts file-like objects, so use `io.BytesIO(image_bytes)`
- Confidence = `(1 - face_distance) * 100` gives percentage where 100% = identical
- Threshold 0.6 distance = 40% minimum confidence (this is the standard dlib threshold)

**CRITICAL -- Threading strategy for CPU-bound calls:**
`face_recognition` functions (`face_encodings`, `face_distance`, `load_image_file`) are synchronous and CPU-bound (dlib C++ under the hood). Since Step 4 requires `async def` endpoints (for WebSocket broadcast integration in Step 6), all face_engine calls MUST be wrapped in `asyncio.to_thread()`:

```python
encoding = await asyncio.to_thread(index_face, image_bytes)
result = await asyncio.to_thread(search_face, image_bytes)
```

This offloads CPU-bound dlib work to a thread pool, keeping the event loop free for WebSocket broadcasts and concurrent camera requests.

**Acceptance criteria:**
- [ ] `index_face(image_bytes)` returns 1024 bytes for a valid face image
- [ ] `index_face(image_bytes)` returns None for an image with no face
- [ ] `search_face(image_bytes)` returns matching user_id when face is in DB
- [ ] `search_face(image_bytes)` returns None when face detected but not in DB
- [ ] `search_face(image_bytes)` returns `{"no_face": True}` when image has no detectable face
- [ ] Confidence score is between 0-100
- [ ] `backend/aws.py` is deleted
- [ ] `boto3` removed from requirements.txt
- [ ] `face_recognition` and `numpy` added to requirements.txt
- [ ] `pip install face_recognition` succeeds in a clean environment (verify before proceeding to Step 4; if it fails, troubleshoot dlib/cmake first)

**Commit:** `add local face_recognition engine, remove AWS Rekognition`

---

### Step 4: Update app.py Endpoints for Offline Stack (US-004)

**Files to modify:**
- `backend/app.py` -- MAJOR REWRITE of imports and both endpoint handlers

**What changes:**

**Imports (lines 1-12):** Replace:
```python
from supabase import create_client, Client
from database import upload_image_to_supabase, get_user_profile, log_access_attempt
from aws import search_face, rekognition
```
With:
```python
import asyncio
from database import get_user_profile, log_access_attempt, insert_user, get_last_status, get_access_logs, get_all_users, get_stats, register_camera, update_camera_heartbeat, get_all_cameras
from face_engine import index_face, search_face
```

**Remove:** Line 27 (`supabase: Client = create_client(...)`) -- delete entirely.

**`/api/recognize` endpoint (lines 33-142):** Keep as `async def` (needed for WebSocket broadcast in Step 6). Wrap CPU-bound face_engine calls in `asyncio.to_thread()`:

Return path logic:
1. Read image bytes from uploaded file: `image_bytes = await image.read()`
2. Call `result = await asyncio.to_thread(search_face, image_bytes)`
3. **If `search_face` returns `{"no_face": True}`** (no face detected in image):
   - Return `{"status": "no_face_detected", "message": "No face detected in image"}` with HTTP 200
4. **If `search_face` returns None** (face found but no match in DB):
   - Generate guest_id: `f"GUEST-{uuid.uuid4().hex[:6].upper()}"`
   - Call `encoding_bytes = await asyncio.to_thread(index_face, image_bytes)`
   - If encoding is None, return scan failed
   - Save avatar: `save_image_locally(image_bytes, "avatars", f"{guest_id}.jpg")`
   - Insert user: `insert_user(guest_id, guest_name, encoding_bytes, avatar_path, "Guest")`
   - Log access: `log_access_attempt(guest_id, "in", 100.0, camera_id=camera_id)`
   - Return JSON with guest info
5. **If match found** (returns `{"user_id", "confidence"}`):
   - Get user profile from DB
   - Determine in/out via `get_last_status(user_id)` or USER_STATE_CACHE
   - Log access attempt
   - Return JSON with user info
6. Accept optional `camera_id` Form field (default None for now, used from Step 8 onward)

**Multiple faces:** `search_face` and `index_face` use the FIRST face encoding returned by `face_recognition.face_encodings()`. This is acceptable because CameraFeed's MediaPipe already crops to a single detected face bounding box before sending. Document this assumption in face_engine.py.

**`/api/employees/add` endpoint (lines 146-195):** Keep as `async def`, wrap face calls:
1. `encoding_bytes = await asyncio.to_thread(index_face, image_bytes)`
2. If None returned, raise 400 "No face detected in uploaded image"
3. Save avatar: `save_image_locally(image_bytes, "avatars", f"{employee_id}_{filename}")`
4. Insert user: `insert_user(employee_id, name, encoding_bytes, avatar_path, role)`
5. Return success JSON

**New endpoints to add (for Steps 6 and 9):**
- `GET /api/users` -- return `get_all_users()` (exclude face_encoding blob from response)
- `GET /api/access-logs` -- return `get_access_logs(limit=50)`
- `GET /api/stats` -- return `get_stats()`

**Extract in/out toggle logic:** The current `app.py` (~line 110) has an inline Supabase query to determine the user's last in/out status. This MUST be replaced by calling `get_last_status(user_id)` from `database.py` (defined in Step 1). Do NOT inline a raw SQLite query in app.py -- use the database module function.

**Remove all:** References to `rekognition`, `supabase`, `rekognition.index_faces()`, `supabase.table()`, `supabase.storage`.

**Acceptance criteria:**
- [ ] No imports of `supabase`, `boto3`, `aws` in app.py
- [ ] `/api/recognize` and `/api/employees/add` are `async def` with `asyncio.to_thread()` wrapping CPU-bound calls
- [ ] `POST /api/recognize` with a face image returns match or auto-registers guest
- [ ] `POST /api/recognize` with a no-face image returns `{"status": "no_face_detected"}` (not a 500 error)
- [ ] `POST /api/recognize` with a face not in DB auto-registers as guest (distinct from no-face)
- [ ] `POST /api/employees/add` registers a new employee with local face encoding
- [ ] `POST /api/employees/add` with a no-face image returns HTTP 400
- [ ] `GET /api/users` returns list of users (without face_encoding blobs)
- [ ] `GET /api/access-logs` returns recent access logs
- [ ] `GET /api/stats` returns dashboard statistics
- [ ] Images saved to `backend/avatars/` directory
- [ ] In/out toggle uses `get_last_status()` function (extracted from current inline Supabase query at app.py ~line 110)
- [ ] Backend starts without errors: `uvicorn app:app`
- [ ] Two concurrent `/api/recognize` requests do not block each other (test with 2 curl calls in parallel)

**Commit:** `rewire app.py endpoints to use local face engine and SQLite`

---

### Step 5: Bundle MediaPipe Models Locally (US-005)

**Files to modify:**
- `frontend/src/components/CameraFeed.tsx` -- lines 55-56 and 61 (CDN URLs)

**Directories/files to create:**
- `frontend/public/mediapipe-wasm/` -- copy WASM files from `node_modules/@mediapipe/tasks-vision/wasm/`
- `frontend/public/models/` -- download `blaze_face_short_range.tflite`

**What changes in CameraFeed.tsx:**

Replace line 55-56:
```typescript
const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
);
```
With:
```typescript
const vision = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
```

Replace line 61:
```typescript
modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
```
With:
```typescript
modelAssetPath: "/models/blaze_face_short_range.tflite",
```

**IMPORTANT -- MediaPipe version mismatch:**
`package.json` currently specifies `@mediapipe/tasks-vision: "^0.10.32"` but `CameraFeed.tsx` loads version `0.10.9` from CDN. These versions may have API differences. When bundling from `node_modules`, the WASM files will be version 0.10.32 (or whatever `^0.10.32` resolves to).

**Resolution:**
1. Pin the exact version in `package.json`: `"@mediapipe/tasks-vision": "0.10.32"` (remove the caret `^` to prevent auto-updates)
2. After copying WASM files, run a quick smoke test that `FilesetResolver.forVisionTasks("/mediapipe-wasm")` resolves without errors
3. If face detection breaks with 0.10.32, fall back to pinning `"0.10.9"` and re-copying WASM files

**Setup script or build step needed:**
- Copy WASM files: `cp node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe-wasm/`
- Download model: `curl -o public/models/blaze_face_short_range.tflite https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`
- Add a `postinstall` script in package.json to automate this, OR document it as a one-time setup step

**Acceptance criteria:**
- [ ] `@mediapipe/tasks-vision` version pinned in `package.json` (no caret range)
- [ ] `frontend/public/mediapipe-wasm/` contains WASM files (vision_wasm_internal.wasm, vision_wasm_internal.js, etc.)
- [ ] `frontend/public/models/blaze_face_short_range.tflite` exists
- [ ] CameraFeed.tsx references local paths only (no cdn.jsdelivr.net, no storage.googleapis.com)
- [ ] Face detection initializes without errors using bundled WASM (verify in browser console: no 404s, no version mismatches)
- [ ] Face detection correctly detects a face in the camera feed (functional test, not just load test)
- [ ] `npm run build` succeeds

**Commit:** `bundle MediaPipe WASM and face detection model locally`

---

### Step 6: WebSocket Dashboard Endpoint + Camera Registration API (US-006)

**THIS STEP IS A COMPLETE REWRITE FROM v1.** The old plan used REST polling. The new architecture uses WebSocket push for real-time dashboard updates and adds camera registration/heartbeat endpoints.

**Files to modify:**
- `backend/app.py` -- Add WebSocket endpoint, camera registration, heartbeat, and broadcast logic

**Files to delete:**
- `frontend/src/supabaseClient.ts` -- DELETE entirely

**Files to modify:**
- `frontend/package.json` -- remove `@supabase/supabase-js` from dependencies
- `backend/requirements.txt` -- add `websockets` (FastAPI WebSocket support)

**New backend endpoints and infrastructure:**

**1. WebSocket connection manager (add to app.py or a new `ws_manager.py` module):**
```python
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect
from typing import Set
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, event_type: str, data: dict):
        """Broadcast an event to all connected dashboard clients."""
        message = json.dumps({"type": event_type, "data": data})
        dead = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.add(connection)
        self.active_connections -= dead

manager = ConnectionManager()
```

**2. WebSocket endpoint:**
```python
@app.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; client can send ping/pong
            data = await websocket.receive_text()
            # Optionally handle client messages (e.g., request stats refresh)
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```

**3. Broadcast after recognition (modify `/api/recognize` from Step 4):**
After each successful recognition or guest auto-registration, broadcast:
```python
await manager.broadcast("recognition_result", {
    "user_id": user_id,
    "name": name,
    "type": user_type,
    "confidence": confidence,
    "status": current_status,
    "camera_id": camera_id,
    "timestamp": datetime.datetime.now().isoformat(),
    "image_url": image_url
})
```

Also broadcast updated stats after each recognition:
```python
await manager.broadcast("stats_update", get_stats())
```

**4. Camera registration endpoint:**
```python
@app.post("/api/camera/register")
async def register_camera_endpoint(
    camera_id: str = Form(...),
    department: str = Form("")
):
    register_camera(camera_id, department)
    await manager.broadcast("camera_online", {
        "camera_id": camera_id,
        "department": department
    })
    return {"status": "registered", "camera_id": camera_id}
```

**5. Camera heartbeat endpoint:**
```python
@app.post("/api/camera/heartbeat")
async def camera_heartbeat_endpoint(
    camera_id: str = Form(...)
):
    update_camera_heartbeat(camera_id)
    return {"status": "ok"}
```

**6. Get cameras endpoint:**
```python
@app.get("/api/cameras")
def get_cameras():
    return get_all_cameras()
```

**7. Background task for camera timeout detection:**
```python
import asyncio
from contextlib import asynccontextmanager

async def camera_timeout_checker():
    """Runs every 15s, marks cameras offline if no heartbeat for 30s."""
    while True:
        await asyncio.sleep(15)
        cameras = get_all_cameras()
        now = datetime.datetime.now()
        for cam in cameras:
            if cam["is_online"] and cam["last_heartbeat"]:
                last = datetime.datetime.fromisoformat(cam["last_heartbeat"])
                if (now - last).total_seconds() > 30:
                    mark_camera_offline(cam["camera_id"])
                    await manager.broadcast("camera_offline", {
                        "camera_id": cam["camera_id"]
                    })

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(camera_timeout_checker())
    yield
    task.cancel()

# Update FastAPI app initialization:
app = FastAPI(title="FSUU Edge Recognition API", lifespan=lifespan)
```

**WebSocket event types summary:**

| Event | Trigger | Data |
|-------|---------|------|
| `recognition_result` | After each `/api/recognize` call | user_id, name, type, confidence, status, camera_id, timestamp, image_url |
| `stats_update` | After each recognition | total_scans, employee_matches, guest_alerts |
| `camera_online` | Camera registers via `/api/camera/register` | camera_id, department |
| `camera_offline` | Background timeout checker (30s no heartbeat) | camera_id |
| `pong` | Client sends "ping" | (empty) |

**Why cameras use HTTP POST for recognition, NOT WebSocket:**
- Camera stations send images via `POST /api/recognize` (existing HTTP endpoint, unchanged from current CameraFeed behavior)
- WebSocket is only for dashboard push -- dashboard subscribes to `/ws/dashboard` to receive real-time updates
- This keeps camera-side code simple (just `fetch()` as it already works)
- The backend is the bridge: receives HTTP POST from cameras, processes, then broadcasts via WebSocket to dashboards

**Acceptance criteria:**
- [ ] `frontend/src/supabaseClient.ts` deleted
- [ ] `@supabase/supabase-js` removed from `package.json`
- [ ] `WebSocket /ws/dashboard` endpoint accepts connections
- [ ] Multiple dashboard clients can connect simultaneously
- [ ] After `/api/recognize` is called, all connected dashboard WebSocket clients receive `recognition_result` event
- [ ] After each recognition, `stats_update` event is broadcast
- [ ] `POST /api/camera/register` registers a camera and broadcasts `camera_online`
- [ ] `POST /api/camera/heartbeat` updates last_heartbeat timestamp
- [ ] `GET /api/cameras` returns list of registered cameras with online/offline status
- [ ] Cameras with no heartbeat for 30s are marked offline and `camera_offline` is broadcast
- [ ] Backend starts without errors
- [ ] Test: open 2 WebSocket connections, POST to `/api/recognize`, both receive the event

**Commit:** `add WebSocket dashboard endpoint and camera registration API`

---

### Step 7: App Mode Routing -- URL-Based Camera/Dashboard/Admin (US-007)

**THIS STEP IS A COMPLETE REWRITE FROM v1.** The old plan had USB camera enumeration (`useCameraDevices` hook). The new plan uses URL-based routing to determine if the device is a camera station, dashboard viewer, or admin.

**Files to modify:**
- `frontend/src/App.tsx` -- Add React Router, split into `CameraStationPage` and `MainApp` with nested routes
- `frontend/src/components/Sidebar.tsx` -- Remove camera link, convert navigation to React Router `<Link>` components, derive active state from URL
- `frontend/package.json` -- Add `react-router-dom` dependency

**Files to delete:**
- None (no `useCameraDevices` hook is created -- USB enumeration is not needed)

**What changes:**

The app now operates in three modes determined by URL path:

| URL Path | Mode | What Renders |
|----------|------|-------------|
| `/camera/:cameraId` | Camera Station | Single CameraFeed fullscreen, with camera_id from URL params |
| `/dashboard` | Dashboard | Sidebar + DashboardTab with WebSocket real-time updates |
| `/admin/add-employee` | Admin | Sidebar + AddEmployeeTab |
| `/` | Default | Redirect to `/dashboard` |

**New routing structure in App.tsx:**

```tsx
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';

// Camera station page -- fullscreen, no sidebar, no header
function CameraStationPage() {
  const { cameraId } = useParams<{ cameraId: string }>();
  // Full state management detailed in Step 8
  return (
    <div className="h-screen w-screen">
      <CameraFeed cameraId={cameraId} isScanning={...} onSnap={...} onToggle={...} />
    </div>
  );
}

// Main app with sidebar -- uses nested <Routes> to render content area
function MainApp() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  // NOTE: activeTab state is REMOVED entirely. The active page is determined
  // by the URL via React Router. Sidebar reads useLocation() to highlight
  // the correct link. Content is rendered by nested <Routes> below.

  return (
    <div className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-screen w-full flex flex-col md:flex-row overflow-hidden relative">
      <Sidebar
        isOpen={isSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        toggleMobile={() => setSidebarOpen(!isSidebarOpen)}
        toggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
        // NOTE: activeTab and setActiveTab props are REMOVED
      />

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="px-4 pt-4 md:px-6 md:pt-6 shrink-0">
          <Header toggleSidebar={() => setSidebarOpen(!isSidebarOpen)} isOnline={true} />
        </div>

        <div className="flex-1 p-4 md:p-6 min-h-0 overflow-hidden">
          {/* Nested routes render the content area based on URL */}
          <Routes>
            <Route path="dashboard" element={<DashboardTab />} />
            <Route path="admin/add-employee" element={
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 h-full overflow-y-auto p-6">
                <AddEmployeeTab />
              </div>
            } />
            {/* Catch-all: redirect unknown paths to dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/camera/:cameraId" element={<CameraStationPage />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**How `activeTab` state is replaced by URL-derived state:**
The current App.tsx uses `useState<'dashboard' | 'camera' | 'add_employee'>('dashboard')` and passes `activeTab` + `setActiveTab` to Sidebar. This is completely replaced:
- The `activeTab` and `setActiveTab` state variables are **deleted** from App.tsx / MainApp.
- Content rendering switches from `{activeTab === 'dashboard' && ...}` conditionals to nested `<Routes>` inside MainApp (shown above).
- Sidebar derives the active link from `useLocation().pathname` (see Sidebar changes below).
- Navigation uses `<Link to="/dashboard">` instead of `onClick={() => setActiveTab('dashboard')}`.

**Changes to Sidebar.tsx:**

The current Sidebar (lines 1-189) uses `activeTab` prop and `setActiveTab` callback. It must be converted to React Router navigation:

1. **Remove props:** Delete `activeTab` and `setActiveTab` from `SidebarProps` interface and component params. The new interface:
   ```typescript
   interface SidebarProps {
     isOpen: boolean;
     isCollapsed: boolean;
     toggleMobile: () => void;
     toggleCollapse: () => void;
     // activeTab and setActiveTab REMOVED
   }
   ```

2. **Add React Router imports:**
   ```typescript
   import { Link, useLocation } from 'react-router-dom';
   ```

3. **Remove camera entry from `mainLinks` array (line 25):** Delete `{ id: 'camera', label: 'Live Feed', icon: 'videocam' }`. Camera access is now exclusively via direct URL on separate devices. The updated array:
   ```typescript
   const mainLinks = [
     { id: 'dashboard', label: 'Dashboard', icon: 'grid_view', path: '/dashboard' },
     { id: 'analytics', label: 'Analytics', icon: 'bar_chart', path: '/analytics' },
     // REMOVED: { id: 'camera', label: 'Live Feed', icon: 'videocam' }
     { id: 'employees', label: 'Employees', icon: 'group', path: '/employees' },
     { id: 'add_employee', label: 'Add Employee', icon: 'person_add', path: '/admin/add-employee' },
     { id: 'logs', label: 'Access Logs', icon: 'history', path: '/logs' },
   ];
   ```

4. **Derive active state from URL** instead of `activeTab` prop:
   ```typescript
   const location = useLocation();
   // Inside the map:
   const isActive = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
   ```

5. **Replace `<button>` with `<Link>`** for navigation items (lines 99-117). The current `<button onClick={() => handleNavClick(link.id)}>` becomes:
   ```tsx
   <Link
     to={link.path}
     onClick={() => { if (window.innerWidth < 1024) toggleMobile(); }}
     className={`w-full flex items-center space-x-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
       isActive
         ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
         : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
     } ${isCollapsed ? 'justify-center' : 'justify-start'}`}
     title={isCollapsed ? link.label : ""}
   >
     ...icon and label...
   </Link>
   ```

6. **Delete `handleNavClick` function** (lines 36-50) entirely -- it is replaced by React Router `<Link>` navigation.

**Changes to CameraFeed props (needed for Step 8):**
Add to `CameraFeedProps` interface (currently lines 4-9 in CameraFeed.tsx):
```typescript
cameraId?: string;  // From URL params, e.g., "engineering", "it-dept"
```

**Acceptance criteria:**
- [ ] `react-router-dom` added to package.json
- [ ] URL `/camera/engineering` renders CameraFeed fullscreen (no sidebar)
- [ ] URL `/dashboard` renders DashboardTab with sidebar
- [ ] URL `/admin/add-employee` renders AddEmployeeTab with sidebar
- [ ] URL `/` redirects to `/dashboard`
- [ ] `cameraId` URL parameter is accessible in CameraStationPage
- [ ] Camera entry (`{ id: 'camera', label: 'Live Feed', icon: 'videocam' }`) removed from Sidebar `mainLinks` array
- [ ] Sidebar uses `<Link>` from react-router-dom (not `<button>` with `setActiveTab`)
- [ ] Sidebar highlights active link using `useLocation().pathname` (not `activeTab` prop)
- [ ] `activeTab` and `setActiveTab` props removed from Sidebar interface
- [ ] `activeTab` state removed from MainApp (replaced by URL routing)
- [ ] TypeScript compiles without errors
- [ ] `npm run build` succeeds

**Commit:** `add URL-based routing for camera stations and dashboard modes`

---

### Step 8: Camera Station Mode -- CameraFeed with Registration + Heartbeat (US-008)

**THIS STEP IS A COMPLETE REWRITE FROM v1.** The old plan had multi-camera grid view with per-camera state on a single machine. The new plan configures CameraFeed for distributed deployment with server communication.

**Files to modify:**
- `frontend/src/components/CameraFeed.tsx` -- Add camera registration, heartbeat, configurable server URL, and camera_id in FormData

**What changes in CameraFeed.tsx:**

**1. Configurable server URL via shared config:**

**NEW FILE: `frontend/src/config.ts`** (created in this step, shared by CameraFeed and DashboardTab):
```typescript
// Shared API and WebSocket base URLs.
// VITE_API_URL should be set to the central server's backend address (e.g., http://192.168.1.100:5001).
// Fallback: derive from current page origin, replacing the frontend port (3000) with backend port (5001).
export const API_BASE: string =
  import.meta.env.VITE_API_URL ||
  window.location.origin.replace(':3000', ':5001');

// WebSocket URL: same host/port as API_BASE, but ws:// or wss:// protocol.
// Backend WebSocket endpoint is /ws/dashboard on port 5001.
export const WS_BASE: string =
  API_BASE.replace(/^http/, 'ws');
```

CameraFeed imports `API_BASE` from this shared config:
```typescript
import { API_BASE } from '../config';
```

Replace the hardcoded URL at line 234:
```typescript
// OLD:
const response = await fetch('http://localhost:5001/api/recognize', { method: 'POST', body: formData });
// NEW:
const response = await fetch(`${API_BASE}/api/recognize`, { method: 'POST', body: formData });
```

Also replace the registration and heartbeat URLs in the `useEffect` hooks (added in this step) to use `API_BASE`.

**2. Camera registration on mount:**
When CameraFeed mounts in camera station mode (when `cameraId` prop is provided), register with the server:

```typescript
useEffect(() => {
  if (!cameraId) return;

  const register = async () => {
    const formData = new FormData();
    formData.append('camera_id', cameraId);
    formData.append('department', cameraId); // department = cameraId for simplicity
    await fetch(`${API_BASE}/api/camera/register`, { method: 'POST', body: formData });
  };
  register();
}, [cameraId]);
```

**3. Heartbeat every 10 seconds:**
```typescript
useEffect(() => {
  if (!cameraId) return;

  const heartbeat = async () => {
    const formData = new FormData();
    formData.append('camera_id', cameraId);
    try {
      await fetch(`${API_BASE}/api/camera/heartbeat`, { method: 'POST', body: formData });
    } catch { /* server unreachable, will retry */ }
  };

  const interval = setInterval(heartbeat, 10000);
  heartbeat(); // immediate first heartbeat
  return () => clearInterval(interval);
}, [cameraId]);
```

**4. Send camera_id with each recognition request:**
In `captureAndSendAll` function (line 231), add to formData:
```typescript
formData.append('camera_id', cameraId || 'default');
```

**5. Camera station UI adjustments:**
When in camera station mode (`cameraId` is present):
- Display camera ID / department name prominently (top-left overlay)
- Show connection status indicator (green = heartbeat OK, red = server unreachable)
- Show server URL being used (small text, bottom corner)
- Auto-start scanning on mount (already happens via `useEffect` setting `isScanning`)

**6. Fullscreen CameraStationPage with complete state management:**

CameraStationPage manages its own `isScanning` and `activeResults` state. Scanning is NOT always-on -- it toggles off when results are received (so CameraFeed pauses the video), then toggles back on after auto-dismiss. This mirrors how the current App.tsx works (see `handleResult` at line 37 which calls `setIsScanning(false)` and `handleDismiss` at line 27 which calls `setIsScanning(true)`).

```tsx
function CameraStationPage() {
  const { cameraId } = useParams<{ cameraId: string }>();

  // Complete state declarations:
  const [isScanning, setIsScanning] = useState(true);       // starts scanning immediately
  const [activeResults, setActiveResults] = useState<AccessLog[] | null>(null);
  const [isSystemOnline, setIsSystemOnline] = useState(false);

  // Called by CameraFeed when faces are recognized.
  // Pauses scanning and shows result modal (same pattern as current App.tsx line 37-56).
  const handleResult = useCallback((results: { name: string; type: 'guest' | 'employee'; confidence: number; image_url?: string }[]) => {
    if (activeResults) return; // prevent double-fire while results are showing
    setIsScanning(false);     // pause camera (CameraFeed pauses video when isScanning=false)

    const newLogs: AccessLog[] = results.map(result => ({
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: result.type === 'employee' ? 'in' : 'denied',
      isUnknown: result.type === 'guest',
      user: {
        name: result.name || 'Unregistered Visitor',
        id: 'LIVE-' + Math.floor(Math.random() * 10000),
        imageUrl: result.image_url || '',
        confidence: result.confidence,
      },
    }));
    setActiveResults(newLogs);
  }, [activeResults]);

  // AUTO-DISMISS: In kiosk mode, auto-clear results after 5 seconds and resume scanning.
  // No manual "dismiss" tap needed on a security kiosk tablet.
  useEffect(() => {
    if (activeResults) {
      const timer = setTimeout(() => {
        setActiveResults(null);
        setIsScanning(true); // resume scanning -- CameraFeed resumes video
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeResults]);

  return (
    <div className="h-screen w-screen">
      <CameraFeed
        cameraId={cameraId}
        isScanning={isScanning && !activeResults}
        onSnap={handleResult}
        onToggle={() => {}} // no manual toggle in kiosk mode
        onStatusChange={setIsSystemOnline}
      >
        {activeResults && <ResultModal data={activeResults} onDismiss={() => {
          setActiveResults(null);
          setIsScanning(true);
        }} />}
      </CameraFeed>
    </div>
  );
}
```

**State lifecycle in CameraStationPage:**
1. Mount: `isScanning=true`, `activeResults=null` -- camera is scanning
2. Face recognized: `handleResult` fires -- `isScanning=false`, `activeResults=[...]` -- camera pauses, ResultModal shows
3. After 5 seconds: auto-dismiss timer fires -- `activeResults=null`, `isScanning=true` -- camera resumes
4. Cycle repeats from step 1

This matches the existing App.tsx pattern (lines 26-56) but adds the auto-dismiss timer for unattended kiosk operation.

**Acceptance criteria:**
- [ ] CameraFeed accepts `cameraId` prop
- [ ] When `cameraId` is provided, CameraFeed registers with `POST /api/camera/register` on mount
- [ ] Heartbeat sent every 10 seconds via `POST /api/camera/heartbeat`
- [ ] Recognition requests include `camera_id` in FormData
- [ ] API URL is configurable (not hardcoded to `localhost:5001`)
- [ ] Camera station renders fullscreen (no sidebar, no tabs)
- [ ] Camera ID / department displayed on the feed overlay
- [ ] Server connection status indicator visible
- [ ] Result modal auto-dismisses after 5 seconds in kiosk mode
- [ ] Scanning auto-resumes after result dismissal
- [ ] Opening `http://<server-ip>:3000/camera/engineering` on a tablet works
- [ ] TypeScript compiles without errors

**Commit:** `add camera station mode with registration, heartbeat, and kiosk auto-dismiss`

---

### Step 9: Dashboard with WebSocket -- Real-Time Camera Grid + Recognition Feed (US-009)

**THIS STEP IS A COMPLETE REWRITE FROM v1.** The old plan just tracked camera_id in logs. The new plan builds a full real-time dashboard powered by WebSocket.

**Files to modify:**
- `frontend/src/components/DashboardTab.tsx` -- MAJOR REWRITE (currently 258 lines of hardcoded static data)
- `frontend/src/types.ts` -- Add WebSocket event types

**What changes in DashboardTab.tsx:**

The current DashboardTab is entirely static/hardcoded with mock data. It needs to become real-time and data-driven via WebSocket.

**1. WebSocket connection hook (add to DashboardTab or create `useWebSocket.ts` hook):**

DashboardTab imports `API_BASE` and `WS_BASE` from the shared config (created in Step 8):
```typescript
import { API_BASE, WS_BASE } from '../config';
```

The WebSocket URL is `${WS_BASE}/ws/dashboard` which resolves to e.g. `ws://192.168.1.100:5001/ws/dashboard`. Note: WebSocket connects to port **5001** (the backend), NOT port 3000 (the frontend dev server).

```typescript
function useDashboardWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 10;

  useEffect(() => {
    function connect() {
      if (retryCountRef.current >= MAX_RETRIES) {
        console.error(`WebSocket: max retries (${MAX_RETRIES}) reached. Giving up.`);
        return;
      }

      const wsUrl = `${WS_BASE}/ws/dashboard`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        retryCountRef.current = 0; // reset on successful connection
      };
      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        retryCountRef.current += 1;
        const delay = Math.min(3000 * retryCountRef.current, 15000); // backoff: 3s, 6s, 9s, ... max 15s
        console.log(`WebSocket closed. Reconnecting in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})...`);
        setTimeout(connect, delay);
      };
      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        setLastEvent(msg);
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      retryCountRef.current = MAX_RETRIES; // prevent reconnect on unmount
      wsRef.current?.close();
    };
  }, []);

  return { isConnected, lastEvent, ws: wsRef.current };
}
```

**2. State management driven by WebSocket events:**
```typescript
const [stats, setStats] = useState({ total_scans: 0, employee_matches: 0, guest_alerts: 0 });
const [recentLogs, setRecentLogs] = useState<any[]>([]);
const [cameras, setCameras] = useState<any[]>([]);

// Process WebSocket events
useEffect(() => {
  if (!lastEvent) return;

  switch (lastEvent.type) {
    case 'recognition_result':
      setRecentLogs(prev => [lastEvent.data, ...prev].slice(0, 50));
      break;
    case 'stats_update':
      setStats(lastEvent.data);
      break;
    case 'camera_online':
      setCameras(prev => {
        const existing = prev.find(c => c.camera_id === lastEvent.data.camera_id);
        if (existing) return prev.map(c => c.camera_id === lastEvent.data.camera_id ? { ...c, is_online: true } : c);
        return [...prev, { ...lastEvent.data, is_online: true }];
      });
      break;
    case 'camera_offline':
      setCameras(prev => prev.map(c => c.camera_id === lastEvent.data.camera_id ? { ...c, is_online: false } : c));
      break;
  }
}, [lastEvent]);
```

**3. Initial data fetch on mount (REST fallback):**
Even with WebSocket, fetch initial state via REST on mount so the dashboard is populated immediately:
```typescript
useEffect(() => {
  const fetchInitial = async () => {
    const [statsRes, logsRes, camerasRes] = await Promise.all([
      fetch(`${API_BASE}/api/stats`),
      fetch(`${API_BASE}/api/access-logs`),
      fetch(`${API_BASE}/api/cameras`),
    ]);
    setStats(await statsRes.json());
    setRecentLogs(await logsRes.json());
    setCameras(await camerasRes.json());
  };
  fetchInitial();
}, []);
```

**4. Dashboard UI sections to update:**

**Metric cards (lines 34-93):** Replace hardcoded values:
- "Total Scans" card: `stats.total_scans` instead of `15,842`
- "Employee Matches" card: `stats.employee_matches` instead of `12,150`
- "Guest Alerts" card: `stats.guest_alerts` instead of `142`
- "System Health" card: `${cameras.filter(c => c.is_online).length}/${cameras.length} cameras` instead of `98%`

**Facility Status / Camera Grid (lines 145-174):** Replace hardcoded 2x2 camera grid with dynamic grid:
```tsx
<div className="grid grid-cols-2 gap-2">
  {cameras.map(cam => (
    <div key={cam.camera_id} className={`rounded-lg p-3 ${cam.is_online ? 'bg-emerald-50' : 'bg-amber-50 border-2 border-amber-200'}`}>
      <span className="material-symbols-outlined">{cam.is_online ? 'videocam' : 'videocam_off'}</span>
      <span className="text-xs font-medium">{cam.department || cam.camera_id}</span>
    </div>
  ))}
</div>
```
Camera count text (line 171): `{cameras.length} Cameras Registered` dynamically.

**Recent Detections table (lines 177-252):** Replace hardcoded rows with `recentLogs.map(...)`:
```tsx
{recentLogs.map(log => (
  <tr key={log.id || log.timestamp}>
    <td>
      <img src={log.image_url || '/avatars/default.png'} />
      <div>{log.name || log.user_id}</div>
    </td>
    <td>{log.type || log.role}</td>
    <td>{log.camera_id || 'Unknown'}</td>
    <td>{log.confidence}%</td>
    <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
  </tr>
))}
```

**5. WebSocket connection indicator:**
Add to the dashboard header area:
```tsx
<div className="flex items-center text-xs font-bold">
  <span className={`w-2 h-2 rounded-full mr-1.5 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
  {isConnected ? 'Live' : 'Disconnected'}
</div>
```

**6. API_BASE configuration:**
Uses the shared `API_BASE` from `frontend/src/config.ts` (created in Step 8). No local definition needed -- just `import { API_BASE } from '../config'`.

**Changes to types.ts:**
```typescript
export interface WebSocketEvent {
  type: 'recognition_result' | 'stats_update' | 'camera_online' | 'camera_offline' | 'pong';
  data: any;
}

export interface CameraInfo {
  camera_id: string;
  department: string;
  last_heartbeat: string;
  is_online: boolean;
}

export interface DashboardStats {
  total_scans: number;
  employee_matches: number;
  guest_alerts: number;
}
```

**Acceptance criteria:**
- [ ] DashboardTab connects to `WebSocket /ws/dashboard` on mount
- [ ] WebSocket connection status indicator shown (Live / Disconnected)
- [ ] Auto-reconnect on WebSocket disconnect with backoff (3s, 6s, 9s... up to 15s) and max 10 retries
- [ ] Initial data loaded via REST fetch on mount (stats, logs, cameras)
- [ ] `recognition_result` events prepend to Recent Detections table in real-time (no page refresh)
- [ ] `stats_update` events update metric cards in real-time
- [ ] `camera_online` / `camera_offline` events update camera grid in real-time
- [ ] Metric cards show real data (not hardcoded 15,842 / 12,150 / 142)
- [ ] Camera grid shows real registered cameras with online/offline status
- [ ] Recent Detections table shows camera_id column with real data
- [ ] Image URLs point to local `/avatars/` paths
- [ ] `API_BASE` and `WS_BASE` imported from shared `frontend/src/config.ts` (NOT defined locally in DashboardTab)
- [ ] WebSocket connects to port 5001 (`WS_BASE`), NOT port 3000
- [ ] No Supabase imports remain
- [ ] `npm run build` succeeds
- [ ] TypeScript compiles without errors

**Commit:** `build real-time dashboard with WebSocket and camera status grid`

---

### Step 10: Config Cleanup + Deployment Documentation (US-010)

**Files to modify:**
- `backend/config.py` -- Remove all AWS/Supabase config, add local-only settings
- `backend/requirements.txt` -- Final cleanup
- `frontend/package.json` -- Final cleanup (should already be done in Step 6)
- `docker-compose.yml` -- Update env vars, add volume mounts, configure networking
- `backend/DockerFile` -- Rename to `Dockerfile`, add system deps for dlib/face_recognition

**Files to create:**
- `.env.example` -- Document required environment variables
- `DEPLOYMENT.md` -- Camera station setup instructions

**New config.py:**
```python
import os
from dotenv import load_dotenv

load_dotenv('.env.local')

class Config:
    # Server
    PORT = int(os.getenv('PORT', '5001'))
    HOST = os.getenv('HOST', '0.0.0.0')

    # Database
    DB_PATH = os.getenv('DB_PATH', 'recognition.db')

    # Storage
    AVATARS_DIR = os.getenv('AVATARS_DIR', 'avatars')
    SNAPSHOTS_DIR = os.getenv('SNAPSHOTS_DIR', 'snapshots')

    # Face Recognition
    FACE_DISTANCE_THRESHOLD = float(os.getenv('FACE_DISTANCE_THRESHOLD', '0.6'))

    # Camera & Detection Tuning
    REQUIRED_STILL_TIME = 3.0
    MOVEMENT_THRESHOLD = 50
    SUCCESS_LOCK_TIME = 3.0
    PADDING = 60

    # Camera Heartbeat
    HEARTBEAT_TIMEOUT = int(os.getenv('HEARTBEAT_TIMEOUT', '30'))  # seconds
```

**Removed fields:** AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, COLLECTION_ID, FACE_MATCH_THRESHOLD, SUPABASE_URL, SUPABASE_KEY, GUEST_BUCKET_NAME

**New requirements.txt:**
```
fastapi
uvicorn[standard]
python-multipart
python-dotenv
face_recognition
numpy
websockets
```

Note: `uvicorn[standard]` includes `websockets` support. The explicit `websockets` dependency ensures it is available.

**Removed:** `boto3`, `supabase`

**Dockerfile changes** (rename from `DockerFile` to `Dockerfile`): The `face_recognition` library requires dlib which needs cmake and C++ compiler:
```dockerfile
FROM python:3.9-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 5001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001", "--reload"]
```

**docker-compose.yml changes:**
- Remove `env_file: ./backend/.env` (or update to `.env.local`)
- Remove `env_file: ./frontend/.env.local` (no more Supabase vars needed)
- Add volume mounts for persistence:
  ```yaml
  volumes:
    - ./backend:/app
    - recognition-data:/app/recognition.db
    - avatar-data:/app/avatars
    - snapshot-data:/app/snapshots
  ```
- Add `VITE_API_URL` environment variable for frontend:
  ```yaml
  frontend:
    environment:
      - VITE_API_URL=http://192.168.1.100:5001
  ```
- Remove Supabase-related env vars from frontend service
- Ensure backend binds to `0.0.0.0` so LAN devices can reach it

**DEPLOYMENT.md content (new file):**
```markdown
# Deployment Guide

## Central Server Setup
1. Install Docker + Docker Compose
2. Clone repo, run `docker compose up --build`
3. Server accessible at http://<server-ip>:3000 (frontend) and http://<server-ip>:5001 (backend)
4. Note the server's LAN IP address (e.g., 192.168.1.100)

## Camera Station Setup
1. Open any browser on a tablet/laptop on the same LAN
2. Navigate to: http://<server-ip>:3000/camera/<department-name>
   - Example: http://192.168.1.100:3000/camera/engineering
   - Example: http://192.168.1.100:3000/camera/it-department
3. Allow camera permission when prompted
4. The station will auto-register and begin scanning

## Admin Dashboard
1. Open: http://<server-ip>:3000/dashboard
2. Real-time camera status and recognition events via WebSocket

## Adding Employees
1. Open: http://<server-ip>:3000/admin/add-employee
2. Fill in the form and upload a photo
```

**Acceptance criteria:**
- [ ] config.py has NO AWS or Supabase references
- [ ] requirements.txt has NO boto3 or supabase; HAS websockets
- [ ] package.json has NO @supabase/supabase-js; HAS react-router-dom
- [ ] `DockerFile` renamed to `Dockerfile` and installs dlib build dependencies
- [ ] docker-compose.yml has volume mounts for DB and storage
- [ ] docker-compose.yml passes `VITE_API_URL` to frontend for LAN access
- [ ] `docker compose up` starts the full stack successfully
- [ ] `.env.example` created with only local env vars documented
- [ ] `DEPLOYMENT.md` created with camera station setup instructions
- [ ] Backend accessible from other devices on the LAN

**Commit:** `clean up config, add deployment docs for distributed camera setup`

---

### Step 11: Update AGENTS.md Documentation (US-011)

**Files to modify:**
- `AGENTS.md` (root)
- `backend/AGENTS.md`
- `backend/services/AGENTS.md`
- `frontend/AGENTS.md`
- `frontend/src/AGENTS.md`
- `frontend/src/components/AGENTS.md`

**What changes:**

All files updated to reflect:
- No cloud dependencies (no AWS, no Supabase)
- SQLite database at `recognition.db` (with `cameras` table)
- Local face_recognition library with dlib
- Local filesystem storage at `avatars/` and `snapshots/`
- Bundled MediaPipe WASM/models
- **Distributed multi-camera via LAN** (NOT USB enumeration)
- URL-based routing: `/camera/:id` for camera stations, `/dashboard` for admin
- WebSocket `/ws/dashboard` for real-time push to dashboard
- Camera registration and heartbeat system
- Camera source tracking in access logs

**Acceptance criteria:**
- [ ] No mention of AWS, Rekognition, Supabase, or cloud in any AGENTS.md
- [ ] No mention of USB camera enumeration or `useCameraDevices` hook
- [ ] Backend AGENTS.md documents: SQLite schema (users, access_logs, cameras), face_engine.py, database.py, local storage, WebSocket manager, camera registration endpoints
- [ ] Frontend AGENTS.md documents: bundled MediaPipe, react-router-dom routing, WebSocket dashboard, no supabase
- [ ] Components AGENTS.md documents: CameraFeed with cameraId prop, configurable serverUrl, heartbeat, kiosk auto-dismiss
- [ ] All parent references valid

**Commit:** `update AGENTS.md files for distributed multi-camera architecture`

---

## 4. Risk Identification and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `face_recognition` / dlib installation fails on macOS or Docker | Blocks Step 3 | Medium | Dockerfile installs cmake + build-essential; for macOS use `brew install cmake`. Add troubleshooting note. |
| `face_recognition.load_image_file` fails with BytesIO | Blocks Step 3 | Low | Fallback: write to temp file, load from path, delete. Test early. |
| WebSocket connections drop on unreliable LAN | Dashboard shows stale data | Medium | Auto-reconnect with 3s delay. Initial REST fetch as fallback. WebSocket is enhancement, not sole data source. |
| Camera heartbeat fails due to network hiccup | False offline status | Medium | 30s timeout is generous (3 missed heartbeats at 10s interval). Camera re-registers on reconnect. |
| SQLite concurrent writes from multiple camera stations | Data corruption | Low | Mitigated in Step 1: WAL mode enabled. Endpoints use `asyncio.to_thread()` for CPU-bound work, keeping event loop free. |
| MediaPipe WASM files are large (~10MB) | Slow initial load on camera tablets | Medium | Files are cached by browser after first load. Camera stations only load once. Add to .gitignore if too large; use postinstall script. |
| Face encoding search is O(n) over all users | Slow for large DBs | Low (small deployments) | For <1000 users this is <100ms. Document limitation. Future: use FAISS or annoy for approximate nearest neighbor. |
| React Router changes break existing bookmark/tab state | Admin confusion | Low | Default `/` redirects to `/dashboard`. Sidebar navigation uses `<Link>` components. |
| Camera tablets lose browser focus / screen locks | Camera stops scanning | Medium | Document: configure tablet to prevent sleep, keep browser active. Consider PWA manifest for fullscreen kiosk. |
| `VITE_API_URL` not set on camera devices | Camera can't reach server | Medium | Auto-derive from `window.location.origin` as fallback. Document in DEPLOYMENT.md. |
| Multiple dashboard tabs cause duplicate WebSocket connections | Memory/bandwidth waste | Low | Each tab gets its own connection -- this is expected and harmless. ConnectionManager handles it. |

---

## 5. Verification Steps

### Per-Step Verification

| Step | Verification Command / Check |
|------|------------------------------|
| 1 | `cd backend && python -c "from database import init_db; init_db()"` -- should create recognition.db with users, access_logs, and cameras tables |
| 2 | Start backend, `curl http://localhost:5001/avatars/` should return 404 (empty dir) not 500 |
| 3 | `cd backend && python -c "from face_engine import index_face; print('OK')"` -- imports without error |
| 4 | `curl -X POST http://localhost:5001/api/recognize -F "image=@test_face.jpg"` -- returns JSON |
| 4 | `curl http://localhost:5001/api/users` -- returns JSON array |
| 4 | `curl http://localhost:5001/api/access-logs` -- returns JSON array |
| 4 | `curl http://localhost:5001/api/stats` -- returns JSON object |
| 5 | `ls frontend/public/mediapipe-wasm/` -- WASM files exist |
| 5 | `ls frontend/public/models/` -- .tflite file exists |
| 6 | `websocat ws://localhost:5001/ws/dashboard` -- connects (install websocat for testing) |
| 6 | `curl -X POST http://localhost:5001/api/camera/register -F "camera_id=test-cam" -F "department=lobby"` -- returns registered |
| 6 | `curl -X POST http://localhost:5001/api/camera/heartbeat -F "camera_id=test-cam"` -- returns ok |
| 6 | `curl http://localhost:5001/api/cameras` -- returns JSON array with test-cam |
| 7 | Open `http://localhost:3000/camera/test-dept` -- renders fullscreen CameraFeed |
| 7 | Open `http://localhost:3000/dashboard` -- renders DashboardTab with sidebar |
| 8 | Open camera URL, verify registration POST sent (check backend logs) |
| 8 | Wait 10s, verify heartbeat POST sent (check backend logs) |
| 9 | Open dashboard, trigger recognition from camera station, verify table updates without page refresh |
| 9 | Register a camera, verify it appears in dashboard camera grid |
| 10 | `docker compose up --build` -- full stack starts |
| 11 | `grep -r "supabase\|aws\|rekognition" *.md backend/AGENTS.md frontend/AGENTS.md` -- no matches |

### End-to-End Smoke Test (Distributed)

1. Start central server: `docker compose up --build`
2. On server machine, open `http://localhost:3000/admin/add-employee`
3. Register an employee with webcam photo
4. On a **separate device** on the same LAN, open `http://<server-ip>:3000/camera/engineering`
5. Verify camera station renders fullscreen, registers with server
6. Let system recognize the registered employee
7. Verify ResultModal shows correct name and confidence, then auto-dismisses
8. On server machine, open `http://localhost:3000/dashboard`
9. Verify dashboard shows the camera as online in camera grid
10. Verify the recognition event appeared in Recent Detections table in real-time
11. Close the camera tab on the separate device
12. Wait 30 seconds, verify dashboard shows camera as offline

### Single-Machine Smoke Test (Development)

1. Start backend: `cd backend && python app.py`
2. Start frontend: `cd frontend && npm run dev`
3. Open `http://localhost:3000/camera/dev-cam` in one tab
4. Open `http://localhost:3000/dashboard` in another tab
5. Register an employee via `http://localhost:3000/admin/add-employee`
6. Go to camera tab, let system recognize the employee
7. Verify dashboard tab updates in real-time (no page refresh)
8. Disconnect internet -- verify everything still works

---

## 6. Commit Strategy

| Order | Commit Message | Files Changed |
|-------|----------------|---------------|
| 1 | `replace Supabase DB with SQLite database layer (includes cameras table)` | `backend/database.py` |
| 2 | `add local filesystem storage with FastAPI static file serving` | `backend/app.py` (partial) |
| 3 | `add local face_recognition engine, remove AWS Rekognition` | `backend/face_engine.py` (new), `backend/aws.py` (delete), `backend/requirements.txt` |
| 4 | `rewire app.py endpoints to use local face engine and SQLite` | `backend/app.py` |
| 5 | `bundle MediaPipe WASM and face detection model locally` | `frontend/src/components/CameraFeed.tsx`, `frontend/public/mediapipe-wasm/*`, `frontend/public/models/*` |
| 6 | `add WebSocket dashboard endpoint and camera registration API` | `backend/app.py`, `frontend/src/supabaseClient.ts` (delete), `frontend/package.json` |
| 7 | `add URL-based routing for camera stations and dashboard modes` | `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/package.json` |
| 8 | `add camera station mode with registration, heartbeat, and kiosk auto-dismiss` | `frontend/src/components/CameraFeed.tsx`, `frontend/src/config.ts` (new) |
| 9 | `build real-time dashboard with WebSocket and camera status grid` | `frontend/src/components/DashboardTab.tsx`, `frontend/src/types.ts` |
| 10 | `clean up config, add deployment docs for distributed camera setup` | `backend/config.py`, `backend/requirements.txt`, `backend/Dockerfile` (renamed), `docker-compose.yml`, `.env.example`, `DEPLOYMENT.md` |
| 11 | `update AGENTS.md files for distributed multi-camera architecture` | All `AGENTS.md` files |

---

## 7. Files to Delete

- `backend/aws.py` -- replaced by `backend/face_engine.py`
- `frontend/src/supabaseClient.ts` -- no longer needed

## 8. Files to Create

- `backend/face_engine.py` -- local face recognition engine
- `frontend/src/config.ts` -- shared `API_BASE` and `WS_BASE` constants (used by CameraFeed and DashboardTab)
- `frontend/public/mediapipe-wasm/` -- bundled WASM files (copied from node_modules)
- `frontend/public/models/blaze_face_short_range.tflite` -- bundled model file
- `.env.example` -- environment variable documentation
- `DEPLOYMENT.md` -- camera station and server setup guide

**Files NOT created (removed from v1 plan):**
- ~~`frontend/src/hooks/useCameraDevices.ts`~~ -- USB enumeration not needed (cameras are separate LAN devices)
- ~~`frontend/src/hooks/useCameraFeed.ts`~~ -- per-camera state hook not needed (each camera is a separate browser tab)

## 9. Success Criteria

The implementation is complete when:
1. The system starts and runs with ZERO internet connectivity
2. Face recognition works using local dlib-based embeddings
3. All data persists in SQLite (`recognition.db`)
4. Images stored locally in `avatars/` and `snapshots/`
5. Dashboard receives real-time updates via WebSocket (not polling)
6. Camera stations on separate LAN devices can register, send heartbeats, and perform recognition
7. Dashboard shows camera online/offline status in real-time
8. Recognition events appear in dashboard instantly via WebSocket push
9. Access logs track which camera detected each person
10. Camera stations auto-dismiss results and resume scanning (kiosk mode)
11. No references to AWS, Supabase, or cloud CDNs remain in codebase
12. `docker compose up` starts the full stack accessible across the LAN
13. All TypeScript compiles, all Python imports succeed
14. A separate device on the LAN can open `/camera/<dept>` and function as a camera station
