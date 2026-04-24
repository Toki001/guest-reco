import asyncio

from fastapi import APIRouter, Depends, Query
from auth import require_admin
from database import get_stats, get_today_stats, get_hourly_stats, get_stats_for_range, get_analytics, get_day_analytics, get_hours_analytics
from database.events import get_all_events
from database.event_cameras import get_event_attendance

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


@router.get('/day')
async def day_analytics(date: str = Query(...), user=Depends(require_admin)):
    data = await asyncio.to_thread(get_day_analytics, date)
    all_events = await asyncio.to_thread(get_all_events)
    day_events = [ev for ev in all_events if ev["start_date"] and str(ev["start_date"]) <= date and str(ev.get("end_date") or ev["start_date"]) >= date]
    events_with_attendance = []
    for ev in day_events:
        att = await asyncio.to_thread(get_event_attendance, ev["id"])
        events_with_attendance.append({
            "id": ev["id"],
            "title": ev["title"],
            "category": ev.get("category", "General"),
            "start_time": ev.get("start_time", ""),
            "end_time": ev.get("end_time", ""),
            "location": ev.get("location", ""),
            "camera_ids": ev.get("camera_ids", []),
            "attendance": {
                "unique_people": att["unique_people"] if att else 0,
                "employees": att["employees"] if att else 0,
                "guests": att["guests"] if att else 0,
                "total_scans": att["total_scans"] if att else 0,
            } if att else {"unique_people": 0, "employees": 0, "guests": 0, "total_scans": 0},
        })
    data["events"] = events_with_attendance
    return data


@router.get('/hours')
async def hours_analytics(hours: int = Query(6), user=Depends(require_admin)):
    return await asyncio.to_thread(get_hours_analytics, hours)
