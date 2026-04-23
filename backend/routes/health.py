import datetime
from fastapi import APIRouter

router = APIRouter()


@router.get('/health')
async def health_check():
    return {"status": "ok", "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
