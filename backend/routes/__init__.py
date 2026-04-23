from fastapi import APIRouter
from routes.auth import router as auth_router
from routes.recognition import router as recognition_router
from routes.employees import router as employees_router
from routes.cameras import router as cameras_router
from routes.attendance import router as attendance_router
from routes.visitors import router as visitors_router
from routes.stats import router as stats_router
from routes.search import router as search_router
from routes.settings import router as settings_router
from routes.streaming import router as streaming_router
from routes.export import router as export_router
from routes.health import router as health_router
from routes.events import router as events_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router, prefix="/api/auth")
api_router.include_router(recognition_router, prefix="/api")
api_router.include_router(employees_router, prefix="/api/employees")
api_router.include_router(cameras_router, prefix="/api")
api_router.include_router(attendance_router, prefix="/api/attendance")
api_router.include_router(visitors_router, prefix="/api")
api_router.include_router(stats_router, prefix="/api/stats")
api_router.include_router(search_router, prefix="/api")
api_router.include_router(settings_router, prefix="/api/settings")
api_router.include_router(streaming_router, prefix="/api")
api_router.include_router(export_router, prefix="/api/export")
api_router.include_router(events_router, prefix="/api/events")
