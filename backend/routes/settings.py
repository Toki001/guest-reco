import asyncio

from fastapi import APIRouter, HTTPException, Depends, Request
from auth import require_admin, require_camera_or_admin
from database import get_settings, update_settings
from services.websocket import manager

router = APIRouter()


@router.get('/')
async def get_system_settings(auth=Depends(require_camera_or_admin)):
    return await asyncio.to_thread(get_settings)


@router.put('/')
async def update_system_settings(request: Request, user=Depends(require_admin)):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected JSON object")
    updated = await asyncio.to_thread(update_settings, body)
    await manager.broadcast({"event": "settings_updated", "settings": updated})
    return updated
