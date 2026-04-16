import asyncio

from fastapi import APIRouter, Depends, Query
from auth import require_admin
from database import get_active_users, get_inactive_users, get_attendance_logs

router = APIRouter()


@router.get('/active')
async def active_users(user=Depends(require_admin)):
    return await asyncio.to_thread(get_active_users)


@router.get('/inactive')
async def inactive_users(user=Depends(require_admin)):
    return await asyncio.to_thread(get_inactive_users)


@router.get('/')
async def attendance_log(
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
    date_from: str = Query(None), date_to: str = Query(None),
    camera_id: str = Query(None), user_id: str = Query(None),
    status: str = Query(None), user=Depends(require_admin)
):
    return await asyncio.to_thread(get_attendance_logs, page, per_page, date_from, date_to, camera_id, user_id, status)
