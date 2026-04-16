import asyncio
import datetime
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect
import uvicorn

from config import Config
from auth import verify_ws_auth, get_camera_api_key
from database import get_all_cameras, get_stats, get_offline_cameras, mark_camera_offline, auto_clock_out_stale
from services.websocket import manager
from routes import api_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


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


# --- BACKGROUND TASK: Midnight auto-clock-out ---
async def midnight_auto_clock_out():
    while True:
        now = datetime.datetime.now()
        tomorrow = (now + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        seconds_until_midnight = (tomorrow - now).total_seconds()
        await asyncio.sleep(seconds_until_midnight)
        try:
            clocked_out = await asyncio.to_thread(auto_clock_out_stale)
            if clocked_out:
                await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
                logger.info("Midnight auto-clock-out completed: %d users", len(clocked_out))
        except Exception as e:
            logger.error("Midnight auto-clock-out error: %s", e)


# --- LIFESPAN ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(camera_timeout_checker())
    midnight_task = asyncio.create_task(midnight_auto_clock_out())
    api_key = get_camera_api_key()
    logger.info("Camera API Key: %s...%s (masked)", api_key[:4], api_key[-4:])
    yield
    task.cancel()
    midnight_task.cancel()


# --- APP SETUP ---
app = FastAPI(title="SecureSight Edge Recognition API", lifespan=lifespan)

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

# --- WEBSOCKET ENDPOINT (must be on the app, not a router) ---
@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket, token: str | None = Query(None)):
    if not verify_ws_auth(token=token):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await manager.connect(websocket)
    try:
        cameras = await asyncio.to_thread(get_all_cameras)
        stats = await asyncio.to_thread(get_stats)
        await websocket.send_json({"event": "initial_state", "data": {"cameras": cameras, "stats": stats}})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- INCLUDE ALL ROUTES ---
app.include_router(api_router)

# --- STATIC FILE MOUNTS (must be AFTER all API routes) ---
app.mount("/avatars", StaticFiles(directory="avatars"), name="avatars")
app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")

if __name__ == '__main__':
    logger.info("SecureSight Server Starting...")
    uvicorn.run("app:app", host=Config.HOST, port=Config.PORT, reload=True)
