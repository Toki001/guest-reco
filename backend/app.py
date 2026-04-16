import asyncio
import datetime
import logging
import os
import uuid
import time
from collections import defaultdict

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, Depends, Header, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from starlette.websockets import WebSocketDisconnect
import uvicorn

from config import Config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)
from database import (
    get_user_profile, log_access_attempt, insert_user,
    get_access_logs, get_all_users, get_all_users_with_encodings, get_stats,
    register_camera, update_camera_heartbeat, get_all_cameras, mark_camera_offline,
    get_offline_cameras, delete_camera,
    delete_user, update_user, update_user_face, get_user_detail,
    get_users_with_last_seen, get_active_users, get_attendance_logs,
    get_user_attendance, user_exists, get_visitors_aggregated, get_today_stats,
    get_faces_by_camera, get_camera_stats, get_camera_activity,
    get_all_embeddings, add_embedding, get_recent_activity_for_camera,
    get_settings, update_settings,
    get_hourly_stats, get_stats_for_range, global_search,
    export_attendance, export_visitors,
    get_inactive_users
)
from face_engine import index_face, search_face, search_face_multi
from auth import (
    check_login, require_admin, require_camera_or_admin,
    verify_ws_auth, get_camera_api_key
)
# PeerJS handles WebRTC signaling (runs as separate server on port 9000)

# --- FASTAPI SETUP ---
app = FastAPI(title="SecureSight Edge Recognition API")

_allowed_origins = os.getenv("CORS_ORIGINS", "https://localhost:3000,https://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LOCAL STORAGE DIRECTORIES ---
os.makedirs("avatars", exist_ok=True)
os.makedirs("snapshots", exist_ok=True)

# --- MJPEG LIVE STREAM RELAY ---
# Camera browsers POST frames here; dashboard GETs an MJPEG stream.
_camera_frames: dict[str, tuple[bytes, asyncio.Event]] = {}  # camera_id -> (jpeg_bytes, new_frame_event)

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

# --- SIMPLE RATE LIMITER ---
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_rate_limit_last_cleanup: float = 0.0
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 120  # max requests per window per key
RATE_LIMIT_CLEANUP_INTERVAL = 300  # seconds between stale key purges

def _check_rate_limit(key: str) -> bool:
    """Return True if the request is within rate limits."""
    global _rate_limit_last_cleanup
    now = time.monotonic()

    # Periodic cleanup of stale keys to prevent unbounded memory growth
    if now - _rate_limit_last_cleanup > RATE_LIMIT_CLEANUP_INTERVAL:
        stale_keys = [k for k, v in _rate_limit_store.items() if not v or now - v[-1] > RATE_LIMIT_WINDOW]
        for k in stale_keys:
            del _rate_limit_store[k]
        _rate_limit_last_cleanup = now

    # Purge old entries for this key
    window = _rate_limit_store[key]
    _rate_limit_store[key] = [t for t in window if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limit_store[key]) >= RATE_LIMIT_MAX_REQUESTS:
        return False
    _rate_limit_store[key].append(now)
    return True

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
            logger.error("Camera timeout checker error: %s", e)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(camera_timeout_checker())
    api_key = get_camera_api_key()
    logger.info("Camera API Key: %s...%s (masked)", api_key[:4], api_key[-4:])

# --- HEALTH CHECK ---
@app.get('/health')
async def health_check():
    try:
        from database import get_connection
        await asyncio.to_thread(lambda: get_connection().execute("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "ok", "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}

# --- API: AUTH ---
@app.post('/api/auth/login')
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(f"login:{client_ip}"):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    token = check_login(username, password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": token, "username": username}

@app.get('/api/auth/me')
async def auth_me(user=Depends(require_admin)):
    return {"username": user["sub"]}

# --- API: RECOGNIZE FACE (BATCH) ---
def _recognize_single(image_bytes, camera_id, known_users):
    """Synchronous single-face recognition with multi-embedding matching."""
    # Get all embeddings for multi-embedding matching
    all_embs = get_all_embeddings()

    # Build context for uncertain-zone resolution
    context = None
    if camera_id:
        recent = get_recent_activity_for_camera(camera_id, minutes=120)
        context = {"camera_id": camera_id, "recent_users": recent}

    # Use multi-embedding matching if we have embeddings, else fall back to legacy
    if all_embs:
        result = search_face_multi(image_bytes, all_embs, context=context)
    else:
        result = search_face(image_bytes, known_users)

    if isinstance(result, dict) and result.get("no_face"):
        return None

    if result is None:
        # No match — register as new guest (ensure unique ID)
        for _ in range(5):
            guest_id = f"GUEST-{uuid.uuid4().hex[:6].upper()}"
            if not user_exists(guest_id):
                break
        else:
            logger.error("Could not generate unique guest ID after 5 attempts")
            return None
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

    # Store new embedding if the face looks different from stored ones
    if result.get("is_new_embedding") and result.get("new_embedding_bytes"):
        add_embedding(user_id, result["new_embedding_bytes"], condition="auto")
        logger.info("New embedding stored for %s", user_id)

    # Cooldown check
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
    rate_key = f"recognize:{camera_id or 'unknown'}"
    if not _check_rate_limit(rate_key):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
    all_bytes = [await img.read() for img in images]
    known_users = await asyncio.to_thread(get_all_users_with_encodings)

    def process_all():
        results = []
        for i, img_bytes in enumerate(all_bytes):
            try:
                r = _recognize_single(img_bytes, camera_id, known_users)
                if r:
                    results.append(r)
            except Exception as e:
                logger.error("Error processing image %d in batch: %s", i, e)
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
    rate_key = f"recognize:{camera_id or 'unknown'}"
    if not _check_rate_limit(rate_key):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file")

    try:
        known_users = await asyncio.to_thread(get_all_users_with_encodings)
        result = await asyncio.to_thread(_recognize_single, image_bytes, camera_id, known_users)

        if result is None:
            return {"status": "no_face_detected", "message": "No face detected or no match"}

        # Broadcast non-skipped results
        if not result.get("skipped"):
            await manager.broadcast({
                "event": "recognition_result",
                "data": {**result, "camera_id": camera_id,
                         "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            })
            await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

        return result

    except Exception as e:
        logger.exception("Error in recognize_face")
        raise HTTPException(status_code=500, detail="Internal server error")

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

# --- MJPEG STREAMING ENDPOINTS ---
@app.post('/api/camera-frame/{camera_id}')
async def post_camera_frame(camera_id: str, request: Request):
    """Camera browser POSTs JPEG frames here at ~10fps."""
    body = await request.body()
    if not body:
        raise HTTPException(400, "Empty body")
    if camera_id in _camera_frames:
        _, event = _camera_frames[camera_id]
        _camera_frames[camera_id] = (body, event)
        event.set()
    else:
        event = asyncio.Event()
        _camera_frames[camera_id] = (body, event)
        event.set()
    return {"ok": True}

@app.get('/api/camera-stream/{camera_id}')
async def get_camera_stream(camera_id: str):
    """Dashboard shows this as <img src=...> — serves MJPEG multipart stream."""
    async def generate():
        while True:
            if camera_id not in _camera_frames:
                await asyncio.sleep(0.5)
                continue
            frame_data, event = _camera_frames[camera_id]
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(frame_data)).encode() + b"\r\n"
                b"\r\n" + frame_data + b"\r\n"
            )
            event.clear()
            try:
                await asyncio.wait_for(event.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                continue  # Send last frame again if no new one

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

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
    # PeerJS handles signaling — camera peer auto-disconnects when removed
    await manager.broadcast({
        "event": "camera_offline",
        "data": {"camera_id": camera_id, "removed": True,
                 "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    })
    await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
    return {"status": "removed", "camera_id": camera_id}

# --- API: PER-CAMERA FACE DATA ---
@app.get('/api/cameras/{camera_id}/faces')
async def get_camera_faces(camera_id: str, limit: int = Query(50), user=Depends(require_admin)):
    """Get unique faces seen by a specific camera."""
    return await asyncio.to_thread(get_faces_by_camera, camera_id, limit)

@app.get('/api/cameras/{camera_id}/stats')
async def get_camera_statistics(camera_id: str, user=Depends(require_admin)):
    """Get stats for a specific camera."""
    return await asyncio.to_thread(get_camera_stats, camera_id)

@app.get('/api/cameras/{camera_id}/activity')
async def get_camera_activity_feed(camera_id: str, limit: int = Query(20), user=Depends(require_admin)):
    """Get recent recognition events for a specific camera."""
    return await asyncio.to_thread(get_camera_activity, camera_id, limit)

# --- API: EMPLOYEE MANAGEMENT ---
@app.get('/api/employees')
async def list_employees(role: str = Query("all"), user=Depends(require_admin)):
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
    search: str = Query(None),
    user=Depends(require_admin)
):
    return await asyncio.to_thread(get_visitors_aggregated, page, per_page, date_from, date_to, search)

# --- API: ATTENDANCE ---
@app.get('/api/attendance/active')
async def active_users(user=Depends(require_admin)):
    return await asyncio.to_thread(get_active_users)

@app.get('/api/attendance/inactive')
async def inactive_users(user=Depends(require_admin)):
    return await asyncio.to_thread(get_inactive_users)

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

# --- API: SETTINGS ---
@app.get('/api/settings')
async def get_system_settings(auth=Depends(require_camera_or_admin)):
    """Camera stations and admin dashboard both read settings."""
    return await asyncio.to_thread(get_settings)

@app.put('/api/settings')
async def update_system_settings(request: Request, user=Depends(require_admin)):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected JSON object")
    updated = await asyncio.to_thread(update_settings, body)
    # Broadcast settings change so connected camera stations can react
    await manager.broadcast({"event": "settings_updated", "settings": updated})
    return updated

# --- API: HOURLY STATS (for charts) ---
@app.get('/api/stats/hourly')
async def hourly_stats(
    date_from: str = Query(None),
    date_to: str = Query(None),
    user=Depends(require_admin)
):
    return await asyncio.to_thread(get_hourly_stats, date_from, date_to)

# --- API: STATS WITH DATE RANGE ---
@app.get('/api/stats/range')
async def stats_range(
    date_from: str = Query(None),
    date_to: str = Query(None),
    user=Depends(require_admin)
):
    return await asyncio.to_thread(get_stats_for_range, date_from, date_to)

# --- API: GLOBAL SEARCH ---
@app.get('/api/search')
async def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    user=Depends(require_admin)
):
    return await asyncio.to_thread(global_search, q, limit)

# --- API: EXPORT ---
@app.get('/api/export/attendance')
async def export_attendance_csv(
    date_from: str = Query(None),
    date_to: str = Query(None),
    camera_id: str = Query(None),
    user=Depends(require_admin)
):
    import csv
    import io as _io
    rows = await asyncio.to_thread(export_attendance, date_from, date_to, camera_id)
    output = _io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance_export.csv"}
    )

@app.get('/api/export/visitors')
async def export_visitors_csv(
    date_from: str = Query(None),
    date_to: str = Query(None),
    user=Depends(require_admin)
):
    import csv
    import io as _io
    rows = await asyncio.to_thread(export_visitors, date_from, date_to)
    output = _io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=visitors_export.csv"}
    )

# --- STATIC FILE MOUNTS (must be AFTER all API routes) ---
app.mount("/avatars", StaticFiles(directory="avatars"), name="avatars")
app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")

if __name__ == '__main__':
    logger.info("SecureSight Server Starting...")
    uvicorn.run("app:app", host=Config.HOST, port=Config.PORT, reload=True)
