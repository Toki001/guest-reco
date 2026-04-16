import asyncio
import datetime
import logging
import os
import time
import uuid

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from auth import require_camera_or_admin
from database import (
    get_user_profile, log_access_attempt, insert_user, user_exists,
    get_all_users_with_encodings, get_all_embeddings, add_embedding,
    get_recent_activity_for_camera, get_stats, get_settings,
)
from services.face_engine import index_face, search_face, search_face_multi
from services.websocket import manager
from services.rate_limiter import check_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()

_scan_cooldown: dict[str, float] = {}
COOLDOWN_SECONDS = 10


def _save_image(image_bytes: bytes, directory: str, filename: str) -> str:
    os.makedirs(directory, exist_ok=True)
    filepath = os.path.join(directory, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    return f"/{directory}/{filename}"


def _recognize_single(image_bytes, camera_id, known_users):
    all_embs = get_all_embeddings()
    context = None
    if camera_id:
        recent = get_recent_activity_for_camera(camera_id, minutes=120)
        context = {"camera_id": camera_id, "recent_users": recent}

    settings = get_settings()
    thresholds = {
        "match_threshold": settings.get("match_threshold", 0.45),
        "confidence_floor": settings.get("confidence_floor", 50.0),
        "uncertain_lower": settings.get("uncertain_lower", 0.35),
        "uncertain_upper": settings.get("uncertain_upper", 0.55),
        "embedding_diversity_min": settings.get("embedding_diversity_min", 0.15),
    }

    result = search_face_multi(image_bytes, all_embs, context=context, thresholds=thresholds) if all_embs else search_face(image_bytes, known_users)

    if isinstance(result, dict) and result.get("no_face"):
        return None

    if result is None:
        for _ in range(5):
            guest_id = f"GUEST-{uuid.uuid4().hex[:6].upper()}"
            if not user_exists(guest_id):
                break
        else:
            logger.error("Could not generate unique guest ID after 5 attempts")
            return None
        guest_name = f"Guest {guest_id[-4:]}"
        encoding_bytes = index_face(image_bytes)
        if encoding_bytes is None:
            return None
        avatar_path = _save_image(image_bytes, "avatars", f"{guest_id}.jpg")
        insert_user(guest_id, guest_name, encoding_bytes, avatar_path, "Guest")
        final_status = log_access_attempt(guest_id, "in", 100.0, camera_id=camera_id)
        _scan_cooldown[guest_id] = time.monotonic()
        return {"message": guest_name, "type": "guest", "confidence": 100.0,
                "image_url": avatar_path, "status": final_status, "user_id": guest_id}

    user_id = result["user_id"]
    confidence = result["confidence"]

    if result.get("is_new_embedding") and result.get("new_embedding_bytes"):
        add_embedding(user_id, result["new_embedding_bytes"], condition="auto")
        logger.info("New embedding stored for %s", user_id)

    now = time.monotonic()
    if now - _scan_cooldown.get(user_id, 0) < COOLDOWN_SECONDS:
        profile = get_user_profile(user_id)
        return {"message": profile["name"] if profile else user_id,
                "type": (profile.get("role", "Employee").lower() if profile else "employee"),
                "confidence": confidence, "user_id": user_id, "skipped": True,
                "image_url": profile.get("image_url", "") if profile else "", "status": None}

    profile = get_user_profile(user_id)
    name = profile["name"] if profile else f"ID: {user_id}"
    image_url = profile.get("image_url", "") if profile else ""
    user_type = profile.get("role", "Employee").lower() if profile else "employee"

    final_status = log_access_attempt(user_id, "in", confidence, camera_id=camera_id)
    _scan_cooldown[user_id] = time.monotonic()
    return {"message": name, "type": user_type, "confidence": confidence,
            "image_url": image_url, "status": final_status, "user_id": user_id}


@router.post('/recognize-batch')
async def recognize_batch(
    images: list[UploadFile] = File(...),
    camera_id: str = Form(None),
    auth=Depends(require_camera_or_admin)
):
    if not check_rate_limit(f"recognize:{camera_id or 'unknown'}"):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
    all_bytes = [await img.read() for img in images]
    known_users = await asyncio.to_thread(get_all_users_with_encodings)

    def process_all():
        results = []
        for i, img_bytes in enumerate(all_bytes):
            try:
                r = _recognize_single(img_bytes, camera_id, known_users)
                if r:
                    results.append(r)
            except Exception as e:
                logger.error("Error processing image %d in batch: %s", i, e)
        return results

    results = await asyncio.to_thread(process_all)
    for r in results:
        if not r.get("skipped"):
            await manager.broadcast({
                "event": "recognition_result",
                "data": {**r, "camera_id": camera_id, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            })
    if any(not r.get("skipped") for r in results):
        await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
    return {"results": results}


@router.post('/recognize')
async def recognize_face(
    image: UploadFile = File(...),
    camera_id: str = Form(None),
    auth=Depends(require_camera_or_admin)
):
    if not check_rate_limit(f"recognize:{camera_id or 'unknown'}"):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file")
    try:
        known_users = await asyncio.to_thread(get_all_users_with_encodings)
        result = await asyncio.to_thread(_recognize_single, image_bytes, camera_id, known_users)
        if result is None:
            return {"status": "no_face_detected", "message": "No face detected or no match"}
        if not result.get("skipped"):
            await manager.broadcast({
                "event": "recognition_result",
                "data": {**result, "camera_id": camera_id, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            })
            await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
        return result
    except Exception:
        logger.exception("Error in recognize_face")
        raise HTTPException(status_code=500, detail="Internal server error")
