import asyncio
import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from auth import require_admin
from database import export_attendance, export_visitors

router = APIRouter()


@router.get('/attendance')
async def export_attendance_csv(
    date_from: str = Query(None), date_to: str = Query(None),
    camera_id: str = Query(None), role: str = Query(None),
    user_id: str = Query(None),
    user=Depends(require_admin)
):
    rows = await asyncio.to_thread(export_attendance, date_from, date_to, camera_id, role, user_id)
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return StreamingResponse(
        iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance_export.csv"}
    )


@router.get('/visitors')
async def export_visitors_csv(date_from: str = Query(None), date_to: str = Query(None), user=Depends(require_admin)):
    rows = await asyncio.to_thread(export_visitors, date_from, date_to)
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return StreamingResponse(
        iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=visitors_export.csv"}
    )
