import asyncio
import datetime
import os
import uuid
import time

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect
import uvicorn

from config import Config
from database import (
    get_user_profile, log_access_attempt, insert_user,
    get_access_logs, get_all_users, get_all_users_with_encodings, get_stats,
    register_camera, update_camera_heartbeat, get_all_cameras, mark_camera_offline,
    get_offline_cameras, delete_camera,
    delete_user, update_user, update_user_face, get_user_detail,
    get_users_with_last_seen, get_active_users, get_attendance_logs,
    get_user_attendance, user_exists, get_visitors_aggregated, get_today_stats
)
from face_engine import index_face, search_face
from auth import (
    check_login, require_admin, require_camera_or_admin,
    verify_ws_auth, get_camera_api_key
)
from signaling import signaling_manager

# --- FASTAPI SETUP ---
app = FastAPI(title="SecureSight Edge Recognition API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LOCAL STORAGE DIRECTORIES ---
os.makedirs("avatars", exist_ok=True)
os.makedirs("snapshots", exist_ok=True)

def secure_filename(filename: str) -> str:
    return os.path.basename(filename).replace(" ", "_")

def save_image_locally(image_bytes: bytes, directory: str, filename: str) -> str:
    filepath = os.path.join(directory, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    return f"/{directory}/{filename}"

# --- WEBSOCKET CONNECTION MANAGER ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

# In-memory cooldown: user_id -> last_logged_timestamp (monotonic)
_scan_cooldown: dict[str, float] = {}
COOLDOWN_SECONDS = 10

# --- WEBSOCKET ENDPOINT ---
@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket, token: str | None = Query(None)):
    if not verify_ws_auth(token=token):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await manager.connect(websocket)
    try:
        # Send initial state
        cameras = await asyncio.to_thread(get_all_cameras)
        stats = await asyncio.to_thread(get_stats)
        await websocket.send_json({"event": "initial_state", "data": {"cameras": cameras, "stats": stats}})

        while True:
            # Keep connection alive, listen for any messages (ping/pong)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- BACKGROUND TASK: Camera timeout checker ---
async def camera_timeout_checker():
    while True:
        await asyncio.sleep(15)
        try:
            timed_out = await asyncio.to_thread(get_offline_cameras, timeout_seconds=30)
            for cam in timed_out:
                await asyncio.to_thread(mark_camera_offline, cam["camera_id"])
                await manager.broadcast({
                    "event": "camera_offline",
                    "data": {"camera_id": cam["camera_id"], "department": cam["department"],
                             "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
                })
            if timed_out:
                await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
        except Exception as e:
            print(f"⚠️ Camera timeout checker error: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(camera_timeout_checker())
    print(f"Camera API Key: {get_camera_api_key()}")

# --- API: AUTH ---
@app.post('/api/auth/login')
async def login(username: str = Form(...), password: str = Form(...)):
    token = check_login(username, password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": token, "username": username}

@app.get('/api/auth/me')
async def auth_me(user=Depends(require_admin)):
    return {"username": user["sub"]}

# --- API: RECOGNIZE FACE (BATCH) ---
def _recognize_single(image_bytes, camera_id, known_users):
    """Synchronous single-face recognition. Called within a thread."""
    result = search_face(image_bytes, known_users)

    if isinstance(result, dict) and result.get("no_face"):
        return None

    # Double-verify failed — face matched someone on first pass but not second.
    # Do NOT register as new guest; just skip this face entirely.
    if isinstance(result, dict) and result.get("uncertain"):
        return None

    if result is None:
        guest_id = f"GUEST-{uuid.uuid4().hex[:6].upper()}"
        guest_name = f"Guest {guest_id[-4:]}"
        encoding_bytes = index_face(image_bytes)
        if encoding_bytes is None:
            return None
        avatar_path = save_image_locally(image_bytes, "avatars", f"{guest_id}.jpg")
        insert_user(guest_id, guest_name, encoding_bytes, avatar_path, "Guest")
        final_status = log_access_attempt(guest_id, "in", 100.0, camera_id=camera_id)
        _scan_cooldown[guest_id] = time.monotonic()
        return {"message": guest_name, "type": "guest", "confidence": 100.0,
                "image_url": avatar_path, "status": final_status, "user_id": guest_id}

    user_id = result["user_id"]
    confidence = result["confidence"]

    now = time.monotonic()
    if now - _scan_cooldown.get(user_id, 0) < COOLDOWN_SECONDS:
        profile = get_user_profile(user_id)
        return {"message": profile["name"] if profile else user_id,
                "type": (profile.get("role", "Employee").lower() if profile else "employee"),
                "confidence": confidence, "user_id": user_id, "skipped": True,
                "image_url": profile.get("image_url", "") if profile else "", "status": None}

    profile = get_user_profile(user_id)
    name = profile["name"] if profile else f"ID: {user_id}"
    image_url = profile.get("image_url", "") if profile else ""
    user_type = profile.get("role", "Employee").lower() if profile else "employee"

    final_status = log_access_attempt(user_id, "in", confidence, camera_id=camera_id)
    _scan_cooldown[user_id] = time.monotonic()
    return {"message": name, "type": user_type, "confidence": confidence,
            "image_url": image_url, "status": final_status, "user_id": user_id}


@app.post('/api/recognize-batch')
async def recognize_batch(
    images: list[UploadFile] = File(...),
    camera_id: str = Form(None),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    auth=Depends(require_camera_or_admin)
):
    """Process multiple face crops in a single request, sequentially."""
    all_bytes = [await img.read() for img in images]
    known_users = await asyncio.to_thread(get_all_users_with_encodings)

    def process_all():
        results = []
        for img_bytes in all_bytes:
            r = _recognize_single(img_bytes, camera_id, known_users)
            if r:
                results.append(r)
        return results

    results = await asyncio.to_thread(process_all)

    # Broadcast non-skipped results
    for r in results:
        if not r.get("skipped"):
            await manager.broadcast({
                "event": "recognition_result",
                "data": {**r, "camera_id": camera_id,
                         "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            })
    if any(not r.get("skipped") for r in results):
        await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

    return {"results": results}


# --- API: RECOGNIZE FACE (SINGLE) ---
@app.post('/api/recognize')
async def recognize_face(
    image: UploadFile = File(...),
    camera_id: str = Form(None),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    auth=Depends(require_camera_or_admin)
):
    image_bytes = await image.read()

    try:
        # Run CPU-bound face search in thread pool
        known_users = await asyncio.to_thread(get_all_users_with_encodings)
        result = await asyncio.to_thread(search_face, image_bytes, known_users)

        # Case 1: No face detected in image
        if isinstance(result, dict) and result.get("no_face"):
            return {"status": "no_face_detected", "message": "No face detected in image"}

        # Case 1b: Double-verify failed — skip, don't register as guest
        if isinstance(result, dict) and result.get("uncertain"):
            return {"status": "uncertain", "message": "Face detected but verification uncertain"}

        # Case 2: No match found - auto-register as guest
        if result is None:
            guest_id = f"GUEST-{uuid.uuid4().hex[:6].upper()}"
            guest_name = f"Guest {guest_id[-4:]}"
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 👤 Unknown Face - Auto-Registering as {guest_name}...")

            encoding_bytes = await asyncio.to_thread(index_face, image_bytes)
            if encoding_bytes is None:
                return {"status": "no_face_detected", "message": "SCAN FAILED: Could not extract face encoding"}

            avatar_path = save_image_locally(image_bytes, "avatars", f"{guest_id}.jpg")
            await asyncio.to_thread(insert_user, guest_id, guest_name, encoding_bytes, avatar_path, "Guest")
            final_status = await asyncio.to_thread(lambda: log_access_attempt(guest_id, "in", 100.0, camera_id=camera_id))
            _scan_cooldown[guest_id] = time.monotonic()

            # Broadcast to dashboard
            await manager.broadcast({
                "event": "recognition_result",
                "data": {"name": guest_name, "type": "guest", "confidence": 100.0,
                         "image_url": avatar_path, "status": final_status, "user_id": guest_id,
                         "camera_id": camera_id, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            })
            await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

            return {"message": guest_name, "type": "guest", "confidence": 100.0,
                    "image_url": avatar_path, "status": final_status, "user_id": guest_id}

        # Case 3: Match found
        user_id = result["user_id"]
        confidence = result["confidence"]

        # In-memory cooldown: skip if same user scanned within 10 seconds
        now = time.monotonic()
        last_scan = _scan_cooldown.get(user_id, 0)
        if now - last_scan < COOLDOWN_SECONDS:
            user_profile = await asyncio.to_thread(get_user_profile, user_id)
            return {"message": user_profile["name"] if user_profile else user_id,
                    "type": (user_profile.get("role", "Employee").lower() if user_profile else "employee"),
                    "confidence": confidence, "user_id": user_id, "skipped": True,
                    "image_url": user_profile.get("image_url", "") if user_profile else "",
                    "status": None}

        user_profile = await asyncio.to_thread(get_user_profile, user_id)
        if user_profile:
            name = user_profile["name"]
            image_url = user_profile.get("image_url", "")
            user_type = user_profile.get("role", "Employee").lower()
        else:
            name = f"ID: {user_id}"
            image_url = ""
            user_type = "employee"

        final_status = await asyncio.to_thread(lambda: log_access_attempt(user_id, "in", confidence, camera_id=camera_id))
        _scan_cooldown[user_id] = time.monotonic()
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] ✅ {user_type.title()} Identified: {name} (Clocking {final_status.upper()})")

        await manager.broadcast({
            "event": "recognition_result",
            "data": {"name": name, "type": user_type, "confidence": confidence,
                     "image_url": image_url, "status": final_status, "user_id": user_id,
                     "camera_id": camera_id, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        })
        await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

        return {"message": name, "type": user_type, "confidence": confidence,
                "image_url": image_url, "status": final_status, "user_id": user_id}

    except Exception as e:
        print(f"❌ CRITICAL ERROR in recognize_face: {e}")
        raise HTTPException(status_code=500, detail={"error": "System Error", "details": str(e)})

# --- API: ADD EMPLOYEE ---
@app.post('/api/employees/add')
async def add_employee(
    employee_id: str = Form(...),
    name: str = Form(...),
    role: str = Form("Employee"),
    image: UploadFile = File(...),
    user=Depends(require_admin)
):
    if not image or not employee_id or not name:
        raise HTTPException(status_code=400, detail="Missing required fields")

    if await asyncio.to_thread(user_exists, employee_id):
        raise HTTPException(status_code=409, detail="Employee ID already exists")

    image_bytes = await image.read()
    filename = secure_filename(image.filename or "unknown.jpg")

    encoding_bytes = await asyncio.to_thread(index_face, image_bytes)
    if encoding_bytes is None:
        raise HTTPException(status_code=400, detail="No face detected in the image.")

    avatar_path = save_image_locally(image_bytes, "avatars", f"{employee_id}_{filename}")
    await asyncio.to_thread(insert_user, employee_id, name, encoding_bytes, avatar_path, role)

    return {"message": f"{role} added!", "image_url": avatar_path}

# --- API: DATA ENDPOINTS ---
@app.get('/api/users')
async def list_users(user=Depends(require_admin)):
    users = await asyncio.to_thread(get_all_users)
    return users

@app.get('/api/access-logs')
async def list_access_logs(user=Depends(require_admin)):
    logs = await asyncio.to_thread(get_access_logs, limit=50)
    return logs

@app.get('/api/stats')
async def get_dashboard_stats(user=Depends(require_admin)):
    return await asyncio.to_thread(get_stats)

@app.get('/api/stats/today')
async def get_today_dashboard_stats(user=Depends(require_admin)):
    return await asyncio.to_thread(get_today_stats)

# --- API: CAMERA MANAGEMENT ---
@app.post('/api/camera/register')
async def register_camera_endpoint(
    camera_id: str = Form(...),
    department: str = Form(...),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    auth=Depends(require_camera_or_admin)
):
    await asyncio.to_thread(register_camera, camera_id, department)
    await manager.broadcast({
        "event": "camera_online",
        "data": {"camera_id": camera_id, "department": department,
                 "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    })
    await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
    return {"status": "registered", "camera_id": camera_id}

@app.post('/api/camera/heartbeat')
async def camera_heartbeat_endpoint(
    camera_id: str = Form(...),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    auth=Depends(require_camera_or_admin)
):
    # Check if camera was offline before this heartbeat
    cameras = await asyncio.to_thread(get_all_cameras)
    was_offline = True
    department = camera_id
    for cam in cameras:
        if cam["camera_id"] == camera_id:
            was_offline = not cam["is_online"]
            department = cam.get("department", camera_id)
            break

    await asyncio.to_thread(update_camera_heartbeat, camera_id)

    # Broadcast camera_online if it just came back
    if was_offline:
        await manager.broadcast({
            "event": "camera_online",
            "data": {"camera_id": camera_id, "department": department,
                     "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        })
        await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

    return {"status": "ok"}

@app.get('/api/cameras')
async def list_cameras(user=Depends(require_admin)):
    return await asyncio.to_thread(get_all_cameras)

@app.delete('/api/cameras/{camera_id}')
async def remove_camera(camera_id: str, user=Depends(require_admin)):
    await asyncio.to_thread(delete_camera, camera_id)
    await signaling_manager.drop_camera(camera_id)
    await manager.broadcast({
        "event": "camera_offline",
        "data": {"camera_id": camera_id, "removed": True,
                 "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    })
    await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
    return {"status": "removed", "camera_id": camera_id}

# --- API: EMPLOYEE MANAGEMENT ---
@app.get('/api/employees')
async def list_employees(role: str = Query("Employee"), user=Depends(require_admin)):
    return await asyncio.to_thread(get_users_with_last_seen, role=role)

@app.get('/api/employees/{employee_id}')
async def get_employee(employee_id: str, user=Depends(require_admin)):
    detail = await asyncio.to_thread(get_user_detail, employee_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Employee not found")
    return detail

@app.put('/api/employees/{employee_id}')
async def update_employee(
    employee_id: str,
    name: str = Form(None),
    role: str = Form(None),
    user=Depends(require_admin)
):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    await asyncio.to_thread(update_user, employee_id, name=name, role=role)
    return {"status": "updated", "employee_id": employee_id}

@app.delete('/api/employees/{employee_id}')
async def remove_employee(employee_id: str, user=Depends(require_admin)):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    await asyncio.to_thread(delete_user, employee_id)
    return {"status": "deleted", "employee_id": employee_id}

@app.post('/api/employees/{employee_id}/reface')
async def reface_employee(
    employee_id: str,
    image: UploadFile = File(...),
    user=Depends(require_admin)
):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    image_bytes = await image.read()
    encoding_bytes = await asyncio.to_thread(index_face, image_bytes)
    if encoding_bytes is None:
        raise HTTPException(status_code=400, detail="No face detected in the image.")
    filename = f"{employee_id}_reface_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
    avatar_path = save_image_locally(image_bytes, "avatars", filename)
    await asyncio.to_thread(update_user_face, employee_id, encoding_bytes, avatar_path)
    return {"status": "updated", "image_url": avatar_path}

@app.get('/api/employees/{employee_id}/attendance')
async def employee_attendance(employee_id: str, user=Depends(require_admin)):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    logs = await asyncio.to_thread(get_user_attendance, employee_id)
    return logs

# --- API: VISITORS ---
@app.get('/api/visitors')
async def list_visitors(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    date_from: str = Query(None),
    date_to: str = Query(None),
    user=Depends(require_admin)
):
    return await asyncio.to_thread(get_visitors_aggregated, page, per_page, date_from, date_to)

# --- API: ATTENDANCE ---
@app.get('/api/attendance/active')
async def active_users(user=Depends(require_admin)):
    return await asyncio.to_thread(get_active_users)

@app.get('/api/attendance')
async def attendance_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    date_from: str = Query(None),
    date_to: str = Query(None),
    camera_id: str = Query(None),
    user_id: str = Query(None),
    status: str = Query(None),
    user=Depends(require_admin)
):
    return await asyncio.to_thread(
        get_attendance_logs, page, per_page, date_from, date_to, camera_id, user_id, status
    )

# --- WEBSOCKET: WEBRTC SIGNALING ---
@app.websocket("/ws/camera-signal")
async def ws_camera_signal(websocket: WebSocket, key: str | None = Query(None)):
    if not verify_ws_auth(key=key):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await signaling_manager.handle_camera_signal(websocket)

@app.websocket("/ws/viewer-signal")
async def ws_viewer_signal(websocket: WebSocket, token: str | None = Query(None)):
    if not verify_ws_auth(token=token):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await signaling_manager.handle_viewer_signal(websocket)

# --- STATIC FILE MOUNTS (must be AFTER all API routes) ---
app.mount("/avatars", StaticFiles(directory="avatars"), name="avatars")
app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")

if __name__ == '__main__':
    print("🚀 SecureSight Server Starting...")
    uvicorn.run("app:app", host=Config.HOST, port=Config.PORT, reload=True)
