import asyncio

from fastapi import APIRouter, Depends, Query
from auth import require_admin
from database import get_stats, get_today_stats, get_hourly_stats, get_stats_for_range, get_analytics

router = APIRouter()


@router.get('')
async def get_dashboard_stats(user=Depends(require_admin)):
    return await asyncio.to_thread(get_stats)


@router.get('/today')
async def get_today_dashboard_stats(user=Depends(require_admin)):
    return await asyncio.to_thread(get_today_stats)


@router.get('/hourly')
async def hourly_stats(date_from: str = Query(None), date_to: str = Query(None), user=Depends(require_admin)):
    return await asyncio.to_thread(get_hourly_stats, date_from, date_to)


@router.get('/range')
async def stats_range(date_from: str = Query(None), date_to: str = Query(None), user=Depends(require_admin)):
    return await asyncio.to_thread(get_stats_for_range, date_from, date_to)


@router.get('/analytics')
async def analytics(days: int = Query(30), user=Depends(require_admin)):
    return await asyncio.to_thread(get_analytics, days)
