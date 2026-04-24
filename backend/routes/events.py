import asyncio
import csv
import io
import json

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from auth import require_admin
from database.events import (
    get_all_events, get_event_by_id, create_event, update_event,
    delete_event, bulk_insert_events,
)
from database.event_cameras import get_event_attendance

router = APIRouter()


def _parse_excel(file_bytes: bytes):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    raw_headers = [str(h).strip().lower().replace(' ', '_') if h else '' for h in rows[0]]
    events = []
    for row in rows[1:]:
        if not any(row):
            continue
        entry = {}
        for i, header in enumerate(raw_headers):
            val = row[i] if i < len(row) else ''
            if val is None:
                val = ''
            if hasattr(val, 'strftime'):
                val = val.strftime('%Y-%m-%d')
            entry[header] = str(val)
        events.append(entry)
    return events


def _parse_csv(file_bytes: bytes):
    text = file_bytes.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(text))
    events = []
    for row in reader:
        entry = {}
        for k, v in row.items():
            entry[k.strip().lower().replace(' ', '_')] = (v or '').strip()
        events.append(entry)
    return events


@router.get('')
async def list_events(user=Depends(require_admin)):
    return await asyncio.to_thread(get_all_events)


@router.post('')
async def add_event(
    title: str = Form(...),
    description: str = Form(''),
    location: str = Form(''),
    start_date: str = Form(...),
    end_date: str = Form(''),
    start_time: str = Form(''),
    end_time: str = Form(''),
    category: str = Form('General'),
    camera_ids: str = Form(''),
    user=Depends(require_admin),
):
    cids = [c.strip() for c in camera_ids.split(',') if c.strip()] if camera_ids else []
    await asyncio.to_thread(
        create_event, title, description, location,
        start_date, end_date, start_time, end_time, category, cids,
    )
    return {"message": "Event created"}


@router.post('/upload')
async def upload_events_file(file: UploadFile = File(...), user=Depends(require_admin)):
    file_bytes = await file.read()
    filename = (file.filename or '').lower()
    if filename.endswith(('.xlsx', '.xls')):
        events = await asyncio.to_thread(_parse_excel, file_bytes)
    elif filename.endswith('.csv'):
        events = await asyncio.to_thread(_parse_csv, file_bytes)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .xlsx, .xls, or .csv")
    if not events:
        raise HTTPException(status_code=400, detail="No events found in file")
    inserted = await asyncio.to_thread(bulk_insert_events, events)
    return {"message": f"{inserted} events imported", "count": inserted}


@router.get('/{event_id}')
async def get_single_event(event_id: int, user=Depends(require_admin)):
    ev = await asyncio.to_thread(get_event_by_id, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    return ev


@router.get('/{event_id}/attendance')
async def event_attendance(event_id: int, user=Depends(require_admin)):
    result = await asyncio.to_thread(get_event_attendance, event_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return result


@router.put('/{event_id}')
async def edit_event(
    event_id: int,
    title: str = Form(None),
    description: str = Form(None),
    location: str = Form(None),
    start_date: str = Form(None),
    end_date: str = Form(None),
    start_time: str = Form(None),
    end_time: str = Form(None),
    category: str = Form(None),
    camera_ids: str = Form(None),
    user=Depends(require_admin),
):
    ev = await asyncio.to_thread(get_event_by_id, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    kwargs = dict(
        title=title, description=description, location=location,
        start_date=start_date, end_date=end_date,
        start_time=start_time, end_time=end_time, category=category,
    )
    if camera_ids is not None:
        kwargs["camera_ids"] = [c.strip() for c in camera_ids.split(',') if c.strip()] if camera_ids else []
    await asyncio.to_thread(update_event, event_id, **kwargs)
    return {"status": "updated"}


@router.delete('/{event_id}')
async def remove_event(event_id: int, user=Depends(require_admin)):
    ev = await asyncio.to_thread(get_event_by_id, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    await asyncio.to_thread(delete_event, event_id)
    return {"status": "deleted"}
