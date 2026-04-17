import datetime
import logging
from database.connection import get_connection
from database.users import USER_STATE_CACHE, KNOWN_USERS_CACHE, get_user_profile

logger = logging.getLogger(__name__)


def auto_clock_out_stale():
    """Clock out users whose last 'in' was before today's midnight. Runs at query time."""
    conn = get_connection()
    today_midnight = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = conn.execute("""
        SELECT u.id
        FROM users u
        JOIN access_logs a ON a.user_id = u.id
            AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
        WHERE a.status = 'in' AND a.timestamp < ?
    """, (today_midnight,)).fetchall()
    clocked_out = []
    for r in rows:
        uid = r["id"]
        conn.execute(
            "INSERT INTO access_logs (user_id, status, confidence, timestamp, snapshot_path, camera_id) VALUES (?, 'out', 100.0, ?, NULL, 'system-auto')",
            (uid, now)
        )
        USER_STATE_CACHE[uid] = 'out'
        clocked_out.append(uid)
    if clocked_out:
        conn.commit()
        logger.info("Auto clock-out: %d users (last in before %s)", len(clocked_out), today_midnight)
    return clocked_out


def get_last_status(user_id):
    if user_id in USER_STATE_CACHE:
        return USER_STATE_CACHE[user_id]
    conn = get_connection()
    row = conn.execute(
        "SELECT status FROM access_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    return row["status"] if row else None


def log_access_attempt(user_id, status_type, confidence, snapshot_path=None, camera_id=None):
    final_status = status_type
    if user_id:
        if user_id not in KNOWN_USERS_CACHE:
            existing = get_user_profile(user_id)
            if existing:
                KNOWN_USERS_CACHE.add(user_id)
        last = get_last_status(user_id)
        final_status = ('out' if last == 'in' else 'in') if last else 'in'
        USER_STATE_CACHE[user_id] = final_status
    else:
        final_status = 'in'

    conn = get_connection()
    conn.execute(
        "INSERT INTO access_logs (user_id, status, confidence, timestamp, snapshot_path, camera_id) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, final_status, float(confidence), datetime.datetime.now(datetime.timezone.utc).isoformat(), snapshot_path, camera_id)
    )
    conn.commit()
    logger.info("Logged: %s (%s)", user_id, final_status.upper())
    return final_status


def get_access_logs(limit=50):
    conn = get_connection()
    rows = conn.execute("""
        SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.snapshot_path, a.camera_id,
               u.name, u.image_path, u.role
        FROM access_logs a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.timestamp DESC
        LIMIT ?
    """, (limit,)).fetchall()
    return [{
        "id": r["id"], "user_id": r["user_id"], "status": r["status"],
        "confidence": r["confidence"], "timestamp": r["timestamp"],
        "snapshot_path": r["snapshot_path"], "camera_id": r["camera_id"],
        "name": r["name"], "image_url": r["image_path"], "role": r["role"]
    } for r in rows]


def get_stats():
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) as c FROM access_logs").fetchone()["c"]
    employees = conn.execute("SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id WHERE u.role = 'Employee'").fetchone()["c"]
    guests = conn.execute("SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id WHERE u.role = 'Guest'").fetchone()["c"]
    cameras_online = conn.execute("SELECT COUNT(*) as c FROM cameras WHERE is_online = 1").fetchone()["c"]
    return {"total_scans": total, "employee_matches": employees, "guest_alerts": guests, "cameras_online": cameras_online}


def get_today_stats():
    auto_clock_out_stale()
    conn = get_connection()
    today_start = conn.execute("SELECT date('now', 'localtime', 'start of day')").fetchone()[0]
    scans = conn.execute("SELECT COUNT(*) as c FROM access_logs WHERE timestamp >= ?", (today_start,)).fetchone()["c"]
    unique = conn.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE timestamp >= ?", (today_start,)).fetchone()["c"]
    emp_in = conn.execute("""
        SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
        JOIN users u ON a.user_id = u.id WHERE a.timestamp >= ? AND u.role = 'Employee'
    """, (today_start,)).fetchone()["c"]
    guest_in = conn.execute("""
        SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
        JOIN users u ON a.user_id = u.id WHERE a.timestamp >= ? AND u.role = 'Guest'
    """, (today_start,)).fetchone()["c"]
    on_site = len(get_active_users())
    return {"scans_today": scans, "unique_people_today": unique, "employees_in_today": emp_in, "guests_today": guest_in, "currently_on_site": on_site}


def get_active_users():
    auto_clock_out_stale()
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id, u.name, u.image_path, u.role, a.timestamp as clock_in_time, a.camera_id
        FROM users u
        JOIN access_logs a ON a.user_id = u.id
            AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
        WHERE a.status = 'in'
        ORDER BY a.timestamp DESC
    """).fetchall()
    return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
             "clock_in_time": r["clock_in_time"], "camera_id": r["camera_id"]} for r in rows]


def get_inactive_users():
    auto_clock_out_stale()
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id, u.name, u.image_path, u.role,
               a.timestamp as last_seen, a.camera_id, a.status as last_status
        FROM users u
        LEFT JOIN access_logs a ON a.user_id = u.id
            AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
        WHERE a.status IS NULL OR a.status = 'out'
        ORDER BY u.name
    """).fetchall()
    return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
             "last_seen": r["last_seen"], "camera_id": r["camera_id"], "last_status": r["last_status"]} for r in rows]


def get_attendance_logs(page=1, per_page=50, date_from=None, date_to=None, camera_id=None, user_id=None, status=None):
    conn = get_connection()
    conditions, params = [], []
    if date_from: conditions.append("a.timestamp >= ?"); params.append(date_from)
    if date_to: conditions.append("a.timestamp <= ?"); params.append(date_to)
    if camera_id: conditions.append("a.camera_id = ?"); params.append(camera_id)
    if user_id: conditions.append("a.user_id = ?"); params.append(user_id)
    if status: conditions.append("a.status = ?"); params.append(status)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * per_page
    total = conn.execute(f"SELECT COUNT(*) as c FROM access_logs a {where}", params).fetchone()["c"]
    rows = conn.execute(f"""
        SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.camera_id,
               COALESCE(u.name, 'Deleted User') as name, u.image_path, COALESCE(u.role, 'Unknown') as role
        FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
        {where} ORDER BY a.timestamp DESC LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()
    return {"total": total, "page": page, "per_page": per_page, "items": [{
        "id": r["id"], "user_id": r["user_id"], "status": r["status"], "confidence": r["confidence"],
        "timestamp": r["timestamp"], "camera_id": r["camera_id"], "name": r["name"],
        "image_url": r["image_path"], "role": r["role"]
    } for r in rows]}


def get_user_attendance(user_id, limit=100):
    conn = get_connection()
    rows = conn.execute("""
        SELECT id, status, confidence, timestamp, camera_id
        FROM access_logs WHERE user_id = ? ORDER BY timestamp ASC
    """, (user_id,)).fetchall()
    sessions, pending_in = [], None
    for r in rows:
        if r["status"] == "in":
            pending_in = {"time_in": r["timestamp"], "camera_in": r["camera_id"], "confidence": r["confidence"]}
        elif r["status"] == "out" and pending_in:
            duration = None
            try:
                t_in = datetime.datetime.fromisoformat(pending_in["time_in"])
                t_out = datetime.datetime.fromisoformat(r["timestamp"])
                duration = int((t_out - t_in).total_seconds())
            except Exception:
                pass
            sessions.append({"time_in": pending_in["time_in"], "time_out": r["timestamp"],
                             "camera_in": pending_in["camera_in"], "camera_out": r["camera_id"],
                             "confidence": pending_in["confidence"], "duration_seconds": duration})
            pending_in = None
    if pending_in:
        sessions.append({"time_in": pending_in["time_in"], "time_out": None, "camera_in": pending_in["camera_in"],
                         "camera_out": None, "confidence": pending_in["confidence"], "duration_seconds": None})
    sessions.reverse()
    return sessions[:limit]


def get_visitors_aggregated(page=1, per_page=50, date_from=None, date_to=None, search=None):
    conn = get_connection()
    conditions, params = ["u.role = 'Guest'"], []
    if date_from: conditions.append("a.timestamp >= ?"); params.append(date_from)
    if date_to: conditions.append("a.timestamp <= ?"); params.append(date_to)
    if search: conditions.append("(u.name LIKE ? OR u.id LIKE ?)"); params.extend([f"%{search}%", f"%{search}%"])
    where = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * per_page
    total = conn.execute(f"SELECT COUNT(DISTINCT u.id) as c FROM users u LEFT JOIN access_logs a ON a.user_id = u.id {where}", params).fetchone()["c"]
    rows = conn.execute(f"""
        SELECT u.id, u.name, u.image_path, MIN(a.timestamp) as first_seen, MAX(a.timestamp) as last_seen,
               COUNT(a.id) as total_visits,
               SUM(CASE WHEN a.status = 'in' THEN 1 ELSE 0 END) as entries_count,
               SUM(CASE WHEN a.status = 'out' THEN 1 ELSE 0 END) as exits_count,
               (SELECT camera_id FROM access_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as last_camera,
               (SELECT status FROM access_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as last_status
        FROM users u LEFT JOIN access_logs a ON a.user_id = u.id {where}
        GROUP BY u.id ORDER BY last_seen DESC LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()
    return {"total": total, "page": page, "per_page": per_page, "items": [{
        "id": r["id"], "name": r["name"], "image_url": r["image_path"],
        "first_seen": r["first_seen"], "last_seen": r["last_seen"], "total_visits": r["total_visits"],
        "entries_count": r["entries_count"] or 0, "exits_count": r["exits_count"] or 0,
        "last_camera": r["last_camera"], "last_status": r["last_status"]
    } for r in rows]}


def get_hourly_stats(date_from=None, date_to=None):
    conn = get_connection()
    conditions, params = [], []
    if date_from: conditions.append("timestamp >= ?"); params.append(date_from)
    if date_to: conditions.append("timestamp <= ?"); params.append(date_to)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(f"""
        SELECT strftime('%Y-%m-%d %H:00', timestamp) as hour, COUNT(*) as scans,
               SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
               SUM(CASE WHEN status = 'out' THEN 1 ELSE 0 END) as exits
        FROM access_logs {where} GROUP BY hour ORDER BY hour DESC LIMIT 168
    """, params).fetchall()
    return [{"hour": r["hour"], "scans": r["scans"], "entries": r["entries"], "exits": r["exits"]} for r in reversed(rows)]


def get_stats_for_range(date_from=None, date_to=None):
    conn = get_connection()
    conditions, params = [], []
    if date_from: conditions.append("a.timestamp >= ?"); params.append(date_from)
    if date_to: conditions.append("a.timestamp <= ?"); params.append(date_to)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    role_join = f"{where}{' AND ' if conditions else ' WHERE '}"
    total = conn.execute(f"SELECT COUNT(*) as c FROM access_logs a {where}", params).fetchone()["c"]
    employees = conn.execute(f"SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id {role_join}u.role = 'Employee'", params).fetchone()["c"]
    guests = conn.execute(f"SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id {role_join}u.role = 'Guest'", params).fetchone()["c"]
    unique = conn.execute(f"SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a {where}", params).fetchone()["c"]
    return {"total_scans": total, "employee_matches": employees, "guest_alerts": guests, "unique_people": unique}


def global_search(query, limit=20):
    conn = get_connection()
    q = f"%{query}%"
    results = []
    for r in conn.execute("SELECT id, name, image_path, role FROM users WHERE name LIKE ? OR id LIKE ? LIMIT ?", (q, q, limit)).fetchall():
        results.append({"type": "person", "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"]})
    for r in conn.execute("SELECT camera_id, department, is_online FROM cameras WHERE camera_id LIKE ? OR department LIKE ? LIMIT ?", (q, q, limit)).fetchall():
        results.append({"type": "camera", "id": r["camera_id"], "name": r["department"], "is_online": r["is_online"]})
    return results[:limit]
