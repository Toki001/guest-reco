import asyncio
import datetime
import os

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from auth import require_admin
from database import (
    get_user_profile, get_users_with_last_seen, get_user_detail,
    user_exists, insert_user, delete_user, update_user, update_user_face,
    get_user_attendance, get_all_users,
)
from services.face_engine import index_face

router = APIRouter()


def _secure_filename(filename: str) -> str:
    return os.path.basename(filename).replace(" ", "_")


def _save_image(image_bytes: bytes, directory: str, filename: str) -> str:
    os.makedirs(directory, exist_ok=True)
    filepath = os.path.join(directory, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    return f"/{directory}/{filename}"


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


@router.get('/')
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
