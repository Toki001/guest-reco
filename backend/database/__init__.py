"""Database package — re-exports all public functions for backward compatibility."""

from database.connection import get_connection, init_db
from database.settings import get_settings, update_settings
from database.users import (
    get_user_profile, get_all_users, get_all_users_with_encodings,
    user_exists, insert_user, delete_user, update_user, update_user_face,
    get_user_detail, get_users_with_last_seen,
    get_all_embeddings, add_embedding, get_user_embedding_count,
    get_recent_activity_for_camera,
)
from database.access_logs import (
    log_access_attempt, get_access_logs, get_stats, get_today_stats,
    get_active_users, get_inactive_users, get_attendance_logs,
    get_user_attendance, get_visitors_aggregated,
    get_hourly_stats, get_stats_for_range, global_search, get_analytics,
    auto_clock_out_stale, get_day_analytics, get_hours_analytics,
)
from database.cameras import (
    register_camera, update_camera_heartbeat, get_all_cameras,
    mark_camera_offline, delete_camera, get_offline_cameras,
    get_faces_by_camera, get_camera_stats, get_camera_activity,
)
from database.export import export_attendance, export_visitors
from database.events import (
    get_all_events, get_event_by_id, create_event, update_event,
    delete_event, bulk_insert_events,
)
from database.event_cameras import (
    get_event_cameras, set_event_cameras, get_event_attendance,
)

# Initialize schema on import, then clean up stale clock-ins
init_db()
auto_clock_out_stale()
