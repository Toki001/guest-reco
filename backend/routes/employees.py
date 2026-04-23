import asyncio
import csv
import datetime
import io
import logging
import os
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from auth import require_admin
from database import (
    get_user_profile, get_users_with_last_seen, get_user_detail,
    user_exists, insert_user, delete_user, update_user, update_user_face,
    get_user_attendance,
)
from services.face_engine import index_face

logger = logging.getLogger(__name__)
router = APIRouter()


def _secure_filename(filename: str) -> str:
    return os.path.basename(filename).replace(" ", "_")


def _save_image(image_bytes: bytes, directory: str, filename: str) -> str:
    os.makedirs(directory, exist_ok=True)
    filepath = os.path.join(directory, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    return f"/{directory}/{filename}"


def _extract_entry(entry: dict) -> tuple:
    eid = (entry.get('employee_id', '') or entry.get('id', '') or
           entry.get('emp_id', '') or entry.get('employee_no', '') or
           entry.get('employee_number', '')).strip()
    name = (entry.get('name', '') or entry.get('full_name', '') or
            entry.get('employee_name', '') or entry.get('first_name', '')).strip()
    raw_role = (entry.get('role', '') or entry.get('position', '') or
                entry.get('type', '') or entry.get('designation', '')).strip()
    role_lower = raw_role.lower()
    if role_lower in ('guest', 'visitor', 'visitors', 'guest user'):
        role = 'Guest'
    else:
        role = 'Employee'
    image_ref = (entry.get('image', '') or entry.get('photo', '') or
                 entry.get('avatar', '') or entry.get('picture', '') or
                 entry.get('image_path', '') or entry.get('photo_path', '')).strip()
    return eid, name, role, image_ref


def _parse_employee_excel(file_bytes: bytes):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    raw_headers = [str(h).strip().lower().replace(' ', '_') if h else '' for h in rows[0]]
    entries = []
    for row in rows[1:]:
        if not any(row):
            continue
        entry = {}
        for i, header in enumerate(raw_headers):
            val = row[i] if i < len(row) else ''
            entry[header] = str(val).strip() if val is not None else ''
        entries.append(entry)
    return entries


def _parse_employee_csv(file_bytes: bytes):
    text = file_bytes.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(text))
    entries = []
    for row in reader:
        entry = {}
        for k, v in row.items():
            entry[k.strip().lower().replace(' ', '_')] = (v or '').strip()
        entries.append(entry)
    return entries


@router.post('/add')
async def add_employee(
    employee_id: str = Form(...), name: str = Form(...), role: str = Form("Employee"),
    image: UploadFile = File(...), user=Depends(require_admin)
):
    if not image or not employee_id or not name:
        raise HTTPException(status_code=400, detail="Missing required fields")
    if await asyncio.to_thread(user_exists, employee_id):
        raise HTTPException(status_code=409, detail="Employee ID already exists")
    image_bytes = await image.read()
    filename = _secure_filename(image.filename or "unknown.jpg")
    encoding_bytes = await asyncio.to_thread(index_face, image_bytes)
    if encoding_bytes is None:
        raise HTTPException(status_code=400, detail="No face detected in the image.")
    avatar_path = _save_image(image_bytes, "avatars", f"{employee_id}_{filename}")
    await asyncio.to_thread(insert_user, employee_id, name, encoding_bytes, avatar_path, role)
    return {"message": f"{role} added!", "image_url": avatar_path}


@router.post('/batch-upload/preview')
async def preview_batch_upload(file: UploadFile = File(...), user=Depends(require_admin)):
    file_bytes = await file.read()
    filename = (file.filename or '').lower()
    if filename.endswith(('.xlsx', '.xls')):
        entries = await asyncio.to_thread(_parse_employee_excel, file_bytes)
    elif filename.endswith('.csv'):
        entries = await asyncio.to_thread(_parse_employee_csv, file_bytes)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .xlsx, .xls, or .csv")
    if not entries:
        raise HTTPException(status_code=400, detail="No employee data found in file")

    rows = []
    for entry in entries:
        eid, name, role, image_ref = _extract_entry(entry)
        rows.append({"employee_id": eid, "name": name, "role": role, "has_image": bool(image_ref)})
    return {"rows": rows, "count": len(rows)}


@router.post('/batch-upload')
async def batch_upload_employees(
    file: UploadFile = File(...),
    images: list[UploadFile] = File(default=[]),
    user=Depends(require_admin),
):
    file_bytes = await file.read()
    filename = (file.filename or '').lower()
    if filename.endswith(('.xlsx', '.xls')):
        entries = await asyncio.to_thread(_parse_employee_excel, file_bytes)
    elif filename.endswith('.csv'):
        entries = await asyncio.to_thread(_parse_employee_csv, file_bytes)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .xlsx, .xls, or .csv")
    if not entries:
        raise HTTPException(status_code=400, detail="No employee data found in file")

    image_map: dict[str, bytes] = {}
    for img in images:
        img_bytes = await img.read()
        if img.filename:
            base = os.path.splitext(img.filename)[0].strip()
            image_map[base.lower()] = img_bytes
            image_map[img.filename.lower()] = img_bytes

    results = []
    for entry in entries:
        eid, name, role, image_ref = _extract_entry(entry)
        if not eid or not name:
            results.append({"employee_id": eid, "name": name, "status": "skipped", "reason": "Missing ID or name"})
            continue
        if await asyncio.to_thread(user_exists, eid):
            results.append({"employee_id": eid, "name": name, "status": "skipped", "reason": "Already exists"})
            continue

        img_bytes: Optional[bytes] = None
        if image_ref:
            ref_lower = image_ref.lower()
            ref_base = os.path.splitext(ref_lower)[0]
            img_bytes = image_map.get(ref_lower) or image_map.get(ref_base)
        if not img_bytes:
            img_bytes = image_map.get(eid.lower()) or image_map.get(eid.lower().replace(' ', '_'))

        avatar_path = None
        encoding_bytes = None
        if img_bytes:
            try:
                encoding_bytes = await asyncio.to_thread(index_face, img_bytes)
                safe_id = eid.replace('/', '_').replace('\\', '_')
                avatar_path = _save_image(img_bytes, "avatars", f"{safe_id}_batch.jpg")
            except Exception as e:
                logger.warning("Failed to process image for %s: %s", eid, e)

        await asyncio.to_thread(insert_user, eid, name, encoding_bytes, avatar_path, role)
        status_detail = "created"
        if img_bytes and avatar_path:
            status_detail = "created with photo"
        results.append({"employee_id": eid, "name": name, "role": role, "status": "created", "detail": status_detail})

    created = sum(1 for r in results if r['status'] == 'created')
    return {"message": f"{created} employees imported", "count": created, "results": results}


@router.get('')
async def list_employees(role: str = "all", user=Depends(require_admin)):
    return await asyncio.to_thread(get_users_with_last_seen, role=role)


@router.get('/{employee_id}')
async def get_employee(employee_id: str, user=Depends(require_admin)):
    detail = await asyncio.to_thread(get_user_detail, employee_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Employee not found")
    return detail


@router.put('/{employee_id}')
async def update_employee(employee_id: str, name: str = Form(None), role: str = Form(None), user=Depends(require_admin)):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    await asyncio.to_thread(update_user, employee_id, name=name, role=role)
    return {"status": "updated", "employee_id": employee_id}


@router.delete('/{employee_id}')
async def remove_employee(employee_id: str, user=Depends(require_admin)):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    await asyncio.to_thread(delete_user, employee_id)
    return {"status": "deleted", "employee_id": employee_id}


@router.post('/{employee_id}/reface')
async def reface_employee(employee_id: str, image: UploadFile = File(...), user=Depends(require_admin)):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    image_bytes = await image.read()
    encoding_bytes = await asyncio.to_thread(index_face, image_bytes)
    if encoding_bytes is None:
        raise HTTPException(status_code=400, detail="No face detected in the image.")
    filename = f"{employee_id}_reface_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
    avatar_path = _save_image(image_bytes, "avatars", filename)
    await asyncio.to_thread(update_user_face, employee_id, encoding_bytes, avatar_path)
    return {"status": "updated", "image_url": avatar_path}


@router.get('/{employee_id}/attendance')
async def employee_attendance(employee_id: str, user=Depends(require_admin)):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    return await asyncio.to_thread(get_user_attendance, employee_id)
