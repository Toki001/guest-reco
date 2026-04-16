import asyncio
import datetime

from fastapi import APIRouter, Form, HTTPException, Depends, Query
from auth import require_admin, require_camera_or_admin
from database import (
    register_camera, update_camera_heartbeat, get_all_cameras,
    delete_camera, get_stats, get_faces_by_camera, get_camera_stats, get_camera_activity,
)
from services.websocket import manager

router = APIRouter()


@router.post('/camera/register')
async def register_camera_endpoint(
    camera_id: str = Form(...), department: str = Form(...),
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


@router.post('/camera/heartbeat')
async def camera_heartbeat_endpoint(
    camera_id: str = Form(...),
    auth=Depends(require_camera_or_admin)
):
    cameras = await asyncio.to_thread(get_all_cameras)
    was_offline = True
    department = camera_id
    for cam in cameras:
        if cam["camera_id"] == camera_id:
            was_offline = not cam["is_online"]
            department = cam.get("department", camera_id)
            break
    await asyncio.to_thread(update_camera_heartbeat, camera_id)
    if was_offline:
        await manager.broadcast({
            "event": "camera_online",
            "data": {"camera_id": camera_id, "department": department,
                     "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        })
        await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
    return {"status": "ok"}


@router.get('/cameras')
async def list_cameras(user=Depends(require_admin)):
    return await asyncio.to_thread(get_all_cameras)


@router.delete('/cameras/{camera_id}')
async def remove_camera(camera_id: str, user=Depends(require_admin)):
    await asyncio.to_thread(delete_camera, camera_id)
    await manager.broadcast({
        "event": "camera_offline",
        "data": {"camera_id": camera_id, "removed": True,
                 "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    })
    await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
    return {"status": "removed", "camera_id": camera_id}


@router.get('/cameras/{camera_id}/faces')
async def get_camera_faces(camera_id: str, limit: int = Query(50), user=Depends(require_admin)):
    return await asyncio.to_thread(get_faces_by_camera, camera_id, limit)


@router.get('/cameras/{camera_id}/stats')
async def get_camera_statistics(camera_id: str, user=Depends(require_admin)):
    return await asyncio.to_thread(get_camera_stats, camera_id)


@router.get('/cameras/{camera_id}/activity')
async def get_camera_activity_feed(camera_id: str, limit: int = Query(20), user=Depends(require_admin)):
    return await asyncio.to_thread(get_camera_activity, camera_id, limit)
