import asyncio

from fastapi import APIRouter, Depends, Query
from auth import require_admin
from database import get_visitors_aggregated

router = APIRouter()


@router.get('/visitors')
async def list_visitors(
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
    date_from: str = Query(None), date_to: str = Query(None),
    search: str = Query(None), user=Depends(require_admin)
):
    return await asyncio.to_thread(get_visitors_aggregated, page, per_page, date_from, date_to, search)
