import asyncio
import datetime
import os
import uuid

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
    get_offline_cameras, delete_camera
)
from face_engine import index_face, search_face
from auth import (
    check_login, require_admin, require_camera_or_admin,
    verify_ws_auth, get_camera_api_key
)
from streaming import stream_manager

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

# --- API: RECOGNIZE FACE ---
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

            # Broadcast to dashboard
            await manager.broadcast({
                "event": "recognition_result",
                "data": {"name": guest_name, "type": "guest", "confidence": 100.0,
                         "image_url": avatar_path, "status": final_status,
                         "camera_id": camera_id, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            })
            await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

            return {"message": guest_name, "type": "guest", "confidence": 100.0,
                    "image_url": avatar_path, "status": final_status}

        # Case 3: Match found
        user_id = result["user_id"]
        confidence = result["confidence"]

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
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] ✅ {user_type.title()} Identified: {name} (Clocking {final_status.upper()})")

        # Broadcast to dashboard
        await manager.broadcast({
            "event": "recognition_result",
            "data": {"name": name, "type": user_type, "confidence": confidence,
                     "image_url": image_url, "status": final_status,
                     "camera_id": camera_id, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        })
        await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

        return {"message": name, "type": user_type, "confidence": confidence,
                "image_url": image_url, "status": final_status}

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
    await asyncio.to_thread(update_camera_heartbeat, camera_id)
    return {"status": "ok"}

@app.get('/api/cameras')
async def list_cameras(user=Depends(require_admin)):
    return await asyncio.to_thread(get_all_cameras)

@app.delete('/api/cameras/{camera_id}')
async def remove_camera(camera_id: str, user=Depends(require_admin)):
    await asyncio.to_thread(delete_camera, camera_id)
    await stream_manager.drop_camera(camera_id)
    await manager.broadcast({
        "event": "camera_offline",
        "data": {"camera_id": camera_id, "removed": True,
                 "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    })
    await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
    return {"status": "removed", "camera_id": camera_id}

# --- WEBSOCKET: CAMERA STREAMING ---
@app.websocket("/ws/camera-stream")
async def ws_camera_stream(websocket: WebSocket, key: str | None = Query(None)):
    if not verify_ws_auth(key=key):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await stream_manager.handle_camera_stream(websocket)

@app.websocket("/ws/camera-view")
async def ws_camera_view(websocket: WebSocket, token: str | None = Query(None)):
    if not verify_ws_auth(token=token):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await stream_manager.handle_camera_view(websocket)

# --- STATIC FILE MOUNTS (must be AFTER all API routes) ---
app.mount("/avatars", StaticFiles(directory="avatars"), name="avatars")
app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")

if __name__ == '__main__':
    print("🚀 SecureSight Server Starting...")
    uvicorn.run("app:app", host=Config.HOST, port=Config.PORT, reload=True)
