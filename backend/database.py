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
