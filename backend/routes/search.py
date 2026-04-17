import asyncio

from fastapi import APIRouter, Depends, Query
from auth import require_admin
from database import global_search

router = APIRouter()


@router.get('/search')
async def search(q: str = Query(..., min_length=1), limit: int = Query(20, ge=1, le=100), user=Depends(require_admin)):
    return await asyncio.to_thread(global_search, q, limit)
