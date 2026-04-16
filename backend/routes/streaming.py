import asyncio

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

router = APIRouter()

_camera_frames: dict[str, tuple[bytes, asyncio.Event]] = {}


@router.post('/camera-frame/{camera_id}')
async def post_camera_frame(camera_id: str, request: Request):
    body = await request.body()
    if not body:
        raise HTTPException(400, "Empty body")
    if camera_id in _camera_frames:
        _, event = _camera_frames[camera_id]
        _camera_frames[camera_id] = (body, event)
        event.set()
    else:
        event = asyncio.Event()
        _camera_frames[camera_id] = (body, event)
        event.set()
    return {"ok": True}


@router.get('/camera-stream/{camera_id}')
async def get_camera_stream(camera_id: str):
    async def generate():
        while True:
            if camera_id not in _camera_frames:
                await asyncio.sleep(0.5)
                continue
            frame_data, event = _camera_frames[camera_id]
            yield (b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " +
                   str(len(frame_data)).encode() + b"\r\n\r\n" + frame_data + b"\r\n")
            event.clear()
            try:
                await asyncio.wait_for(event.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                continue
    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")
