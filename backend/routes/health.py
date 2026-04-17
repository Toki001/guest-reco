import asyncio
import datetime
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get('/health')
async def health_check():
    try:
        from database.connection import get_connection
        await asyncio.to_thread(lambda: get_connection().execute("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "ok", "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
