import sqlite3
import datetime

import threading
from config import Config

DB_PATH = getattr(Config, 'DB_PATH', 'recognition.db')

# Thread-local storage for connections
_local = threading.local()

def get_connection():
    """Get a thread-local SQLite connection."""
    if not hasattr(_local, 'connection') or _local.connection is None:
        _local.connection = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.connection.row_factory = sqlite3.Row
        _local.connection.execute("PRAGMA journal_mode=WAL")
    return _local.connection

def init_db():
    """Initialize database schema."""
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            face_encoding BLOB,
            image_path TEXT,
            role TEXT DEFAULT 'Employee'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT REFERENCES users(id),
            status TEXT,
            confidence REAL,
            timestamp TEXT,
            snapshot_path TEXT,
            camera_id TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cameras (
            camera_id TEXT PRIMARY KEY,
            department TEXT NOT NULL,
            last_heartbeat TEXT,
            is_online INTEGER DEFAULT 0,
            registered_at TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_access_logs_user_timestamp ON access_logs(user_id, timestamp DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_access_logs_camera ON access_logs(camera_id, timestamp DESC)")
    conn.commit()
    print("✅ SQLite Database Initialized")

# --- PERFORMANCE CACHE ---
USER_STATE_CACHE = {}
KNOWN_USERS_CACHE = set()

# --- USER FUNCTIONS ---
def get_user_profile(user_id):
    conn = get_connection()
    row = conn.execute("SELECT id, name, image_path, role FROM users WHERE id = ?", (user_id,)).fetchone()
    if row:
        return {"id": row["id"], "name": row["name"], "image_url": row["image_path"], "role": row["role"]}
    return None

def get_all_users():
    conn = get_connection()
    rows = conn.execute("SELECT id, name, image_path, role FROM users").fetchall()
    return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"]} for r in rows]

def get_all_users_with_encodings():
    """Return all users including their face_encoding BLOBs (for face matching)."""
    conn = get_connection()
    rows = conn.execute("SELECT id, name, face_encoding, image_path, role FROM users").fetchall()
    return [{"id": r["id"], "name": r["name"], "face_encoding": r["face_encoding"], "image_url": r["image_path"], "role": r["role"]} for r in rows]

def insert_user(user_id, name, face_encoding_bytes, image_path, role="Employee"):
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO users (id, name, face_encoding, image_path, role) VALUES (?, ?, ?, ?, ?)",
        (user_id, name, face_encoding_bytes, image_path, role)
    )
    conn.commit()
    KNOWN_USERS_CACHE.add(user_id)

def get_last_status(user_id):
    if user_id in USER_STATE_CACHE:
        return USER_STATE_CACHE[user_id]
    conn = get_connection()
    row = conn.execute(
        "SELECT status FROM access_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    if row:
        return row["status"]
    return None

def log_access_attempt(user_id, status_type, confidence, snapshot_path=None, camera_id=None):
    # Determine in/out toggle
    final_status = status_type
    if user_id:
        if user_id not in KNOWN_USERS_CACHE:
            existing = get_user_profile(user_id)
            if existing:
                KNOWN_USERS_CACHE.add(user_id)

        last = get_last_status(user_id)
        if last:
            final_status = 'out' if last == 'in' else 'in'
        else:
            final_status = 'in'
        USER_STATE_CACHE[user_id] = final_status
    else:
        final_status = 'in'

    conn = get_connection()
    conn.execute(
        "INSERT INTO access_logs (user_id, status, confidence, timestamp, snapshot_path, camera_id) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, final_status, float(confidence), datetime.datetime.now(datetime.timezone.utc).isoformat(), snapshot_path, camera_id)
    )
    conn.commit()

    direction = "➡️" if final_status == 'in' else "⬅️"
    print(f"✅ Logged: {user_id} ({direction} {final_status.upper()})")
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

def delete_user(user_id):
    conn = get_connection()
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    USER_STATE_CACHE.pop(user_id, None)
    KNOWN_USERS_CACHE.discard(user_id)

def update_user(user_id, name=None, role=None):
    conn = get_connection()
    if name is not None:
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
    if role is not None:
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    conn.commit()

def update_user_face(user_id, face_encoding_bytes, image_path):
    conn = get_connection()
    conn.execute("UPDATE users SET face_encoding = ?, image_path = ? WHERE id = ?",
                 (face_encoding_bytes, image_path, user_id))
    conn.commit()

def get_user_detail(user_id):
    conn = get_connection()
    row = conn.execute("SELECT id, name, image_path, role FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    first_seen = conn.execute(
        "SELECT MIN(timestamp) as ts FROM access_logs WHERE user_id = ?", (user_id,)
    ).fetchone()["ts"]
    last_log = conn.execute(
        "SELECT status, timestamp, camera_id FROM access_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    return {
        "id": row["id"], "name": row["name"], "image_url": row["image_path"], "role": row["role"],
        "first_seen": first_seen,
        "last_status": last_log["status"] if last_log else None,
        "last_seen": last_log["timestamp"] if last_log else None,
        "last_camera": last_log["camera_id"] if last_log else None,
    }

def get_users_with_last_seen(role=None):
    conn = get_connection()
    role_filter = ""
    params = []
    if role and role != "all":
        role_filter = "WHERE u.role = ?"
        params = [role]
    rows = conn.execute(f"""
        SELECT u.id, u.name, u.image_path, u.role,
               a.status as last_status, a.timestamp as last_seen, a.camera_id as last_camera
        FROM users u
        LEFT JOIN access_logs a ON a.user_id = u.id
            AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
        {role_filter}
        ORDER BY u.name
    """, params).fetchall()
    return [{
        "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
        "last_status": r["last_status"], "last_seen": r["last_seen"], "last_camera": r["last_camera"]
    } for r in rows]

def get_visitors_aggregated(page=1, per_page=50, date_from=None, date_to=None):
    conn = get_connection()
    conditions = ["u.role = 'Guest'"]
    params = []
    if date_from:
        conditions.append("a.timestamp >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("a.timestamp <= ?")
        params.append(date_to)

    where = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * per_page

    total = conn.execute(f"""
        SELECT COUNT(DISTINCT u.id) as c
        FROM users u LEFT JOIN access_logs a ON a.user_id = u.id
        {where}
    """, params).fetchone()["c"]

    rows = conn.execute(f"""
        SELECT u.id, u.name, u.image_path,
               MIN(a.timestamp) as first_seen,
               MAX(a.timestamp) as last_seen,
               COUNT(a.id) as total_visits,
               (SELECT camera_id FROM access_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as last_camera
        FROM users u
        LEFT JOIN access_logs a ON a.user_id = u.id
        {where}
        GROUP BY u.id
        ORDER BY last_seen DESC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": [{
            "id": r["id"], "name": r["name"], "image_url": r["image_path"],
            "first_seen": r["first_seen"], "last_seen": r["last_seen"],
            "total_visits": r["total_visits"], "last_camera": r["last_camera"]
        } for r in rows]
    }

def get_today_stats():
    conn = get_connection()
    today_start = conn.execute("SELECT date('now', 'localtime', 'start of day')").fetchone()[0]

    scans = conn.execute(
        "SELECT COUNT(*) as c FROM access_logs WHERE timestamp >= ?", (today_start,)
    ).fetchone()["c"]

    unique = conn.execute(
        "SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE timestamp >= ?", (today_start,)
    ).fetchone()["c"]

    emp_in = conn.execute("""
        SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
        JOIN users u ON a.user_id = u.id
        WHERE a.timestamp >= ? AND u.role = 'Employee'
    """, (today_start,)).fetchone()["c"]

    guest_in = conn.execute("""
        SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
        JOIN users u ON a.user_id = u.id
        WHERE a.timestamp >= ? AND u.role = 'Guest'
    """, (today_start,)).fetchone()["c"]

    on_site = len(get_active_users())

    return {
        "scans_today": scans,
        "unique_people_today": unique,
        "employees_in_today": emp_in,
        "guests_today": guest_in,
        "currently_on_site": on_site
    }

def get_active_users():
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id, u.name, u.image_path, u.role, a.timestamp as clock_in_time, a.camera_id
        FROM users u
        JOIN access_logs a ON a.user_id = u.id
            AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
        WHERE a.status = 'in'
        ORDER BY a.timestamp DESC
    """).fetchall()
    return [{
        "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
        "clock_in_time": r["clock_in_time"], "camera_id": r["camera_id"]
    } for r in rows]

def get_attendance_logs(page=1, per_page=50, date_from=None, date_to=None,
                        camera_id=None, user_id=None, status=None):
    conn = get_connection()
    conditions = []
    params = []
    if date_from:
        conditions.append("a.timestamp >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("a.timestamp <= ?")
        params.append(date_to)
    if camera_id:
        conditions.append("a.camera_id = ?")
        params.append(camera_id)
    if user_id:
        conditions.append("a.user_id = ?")
        params.append(user_id)
    if status:
        conditions.append("a.status = ?")
        params.append(status)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * per_page

    total = conn.execute(f"SELECT COUNT(*) as c FROM access_logs a {where}", params).fetchone()["c"]

    rows = conn.execute(f"""
        SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.camera_id,
               COALESCE(u.name, 'Deleted User') as name, u.image_path, COALESCE(u.role, 'Unknown') as role
        FROM access_logs a
        LEFT JOIN users u ON a.user_id = u.id
        {where}
        ORDER BY a.timestamp DESC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": [{
            "id": r["id"], "user_id": r["user_id"], "status": r["status"],
            "confidence": r["confidence"], "timestamp": r["timestamp"], "camera_id": r["camera_id"],
            "name": r["name"], "image_url": r["image_path"], "role": r["role"]
        } for r in rows]
    }

def get_user_attendance(user_id, limit=100):
    conn = get_connection()
    rows = conn.execute("""
        SELECT id, status, confidence, timestamp, camera_id
        FROM access_logs WHERE user_id = ?
        ORDER BY timestamp ASC
    """, (user_id,)).fetchall()

    # Pair in/out events into sessions
    sessions = []
    pending_in = None
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
            sessions.append({
                "time_in": pending_in["time_in"],
                "time_out": r["timestamp"],
                "camera_in": pending_in["camera_in"],
                "camera_out": r["camera_id"],
                "confidence": pending_in["confidence"],
                "duration_seconds": duration
            })
            pending_in = None

    # If there's a pending clock-in with no clock-out yet
    if pending_in:
        sessions.append({
            "time_in": pending_in["time_in"],
            "time_out": None,
            "camera_in": pending_in["camera_in"],
            "camera_out": None,
            "confidence": pending_in["confidence"],
            "duration_seconds": None
        })

    sessions.reverse()  # newest first
    return sessions[:limit]

def user_exists(user_id):
    conn = get_connection()
    row = conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone()
    return row is not None

# --- PER-CAMERA FACE DATA ---
def get_faces_by_camera(camera_id, limit=50):
    """Get unique faces seen by a specific camera, with last seen time and visit count."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id, u.name, u.image_path, u.role,
               COUNT(a.id) as visit_count,
               MAX(a.timestamp) as last_seen,
               MIN(a.timestamp) as first_seen
        FROM access_logs a
        JOIN users u ON a.user_id = u.id
        WHERE a.camera_id = ?
        GROUP BY u.id
        ORDER BY last_seen DESC
        LIMIT ?
    """, (camera_id, limit)).fetchall()
    return [{
        "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
        "visit_count": r["visit_count"], "last_seen": r["last_seen"], "first_seen": r["first_seen"]
    } for r in rows]

def get_camera_stats(camera_id):
    """Get stats for a specific camera."""
    conn = get_connection()
    today_start = conn.execute("SELECT date('now', 'localtime', 'start of day')").fetchone()[0]

    total_scans = conn.execute(
        "SELECT COUNT(*) as c FROM access_logs WHERE camera_id = ?", (camera_id,)
    ).fetchone()["c"]

    scans_today = conn.execute(
        "SELECT COUNT(*) as c FROM access_logs WHERE camera_id = ? AND timestamp >= ?",
        (camera_id, today_start)
    ).fetchone()["c"]

    unique_faces = conn.execute(
        "SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE camera_id = ?", (camera_id,)
    ).fetchone()["c"]

    unique_today = conn.execute(
        "SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE camera_id = ? AND timestamp >= ?",
        (camera_id, today_start)
    ).fetchone()["c"]

    last_activity = conn.execute(
        "SELECT MAX(timestamp) as ts FROM access_logs WHERE camera_id = ?", (camera_id,)
    ).fetchone()["ts"]

    return {
        "camera_id": camera_id,
        "total_scans": total_scans,
        "scans_today": scans_today,
        "unique_faces": unique_faces,
        "unique_faces_today": unique_today,
        "last_activity": last_activity,
    }

def get_camera_activity(camera_id, limit=20):
    """Get recent recognition events for a specific camera."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.snapshot_path,
               COALESCE(u.name, 'Unknown') as name, u.image_path, COALESCE(u.role, 'Guest') as role
        FROM access_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.camera_id = ?
        ORDER BY a.timestamp DESC
        LIMIT ?
    """, (camera_id, limit)).fetchall()
    return [{
        "id": r["id"], "user_id": r["user_id"], "status": r["status"],
        "confidence": r["confidence"], "timestamp": r["timestamp"],
        "snapshot_path": r["snapshot_path"],
        "name": r["name"], "image_url": r["image_path"], "role": r["role"]
    } for r in rows]

# --- CAMERA FUNCTIONS ---
def register_camera(camera_id, department):
    conn = get_connection()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    conn.execute(
        "INSERT OR REPLACE INTO cameras (camera_id, department, last_heartbeat, is_online, registered_at) VALUES (?, ?, ?, 1, COALESCE((SELECT registered_at FROM cameras WHERE camera_id = ?), ?))",
        (camera_id, department, now, camera_id, now)
    )
    conn.commit()

def update_camera_heartbeat(camera_id):
    conn = get_connection()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    conn.execute(
        "UPDATE cameras SET last_heartbeat = ?, is_online = 1 WHERE camera_id = ?",
        (now, camera_id)
    )
    conn.commit()

def get_all_cameras():
    conn = get_connection()
    rows = conn.execute("SELECT camera_id, department, last_heartbeat, is_online, registered_at FROM cameras").fetchall()
    return [{"camera_id": r["camera_id"], "department": r["department"], "last_heartbeat": r["last_heartbeat"], "is_online": r["is_online"], "registered_at": r["registered_at"]} for r in rows]

def mark_camera_offline(camera_id):
    conn = get_connection()
    conn.execute("UPDATE cameras SET is_online = 0 WHERE camera_id = ?", (camera_id,))
    conn.commit()

def delete_camera(camera_id):
    conn = get_connection()
    conn.execute("DELETE FROM cameras WHERE camera_id = ?", (camera_id,))
    conn.commit()

def get_offline_cameras(timeout_seconds=30):
    """Return cameras whose last heartbeat is older than timeout_seconds."""
    conn = get_connection()
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=timeout_seconds)).isoformat()
    rows = conn.execute(
        "SELECT camera_id, department FROM cameras WHERE is_online = 1 AND last_heartbeat < ?",
        (cutoff,)
    ).fetchall()
    return [{"camera_id": r["camera_id"], "department": r["department"]} for r in rows]

# Initialize DB on import
init_db()
