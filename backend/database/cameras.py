import datetime
from database.connection import get_connection


def register_camera(camera_id, department):
    conn = get_connection()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    existing = conn.execute("SELECT camera_id FROM cameras WHERE camera_id = ?", (camera_id,)).fetchone()
    if existing:
        conn.execute("UPDATE cameras SET department = ?, last_heartbeat = ?, is_online = 1 WHERE camera_id = ?", (department, now, camera_id))
    else:
        conn.execute("INSERT INTO cameras (camera_id, department, last_heartbeat, is_online, registered_at) VALUES (?, ?, ?, 1, ?)", (camera_id, department, now, now))
    conn.commit()


def update_camera_heartbeat(camera_id):
    conn = get_connection()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    conn.execute("UPDATE cameras SET last_heartbeat = ?, is_online = 1 WHERE camera_id = ?", (now, camera_id))
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
    conn = get_connection()
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=timeout_seconds)).isoformat()
    rows = conn.execute("SELECT camera_id, department FROM cameras WHERE is_online = 1 AND last_heartbeat < ?", (cutoff,)).fetchall()
    return [{"camera_id": r["camera_id"], "department": r["department"]} for r in rows]


def get_faces_by_camera(camera_id, limit=50):
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id, u.name, u.image_path, u.role, COUNT(a.id) as visit_count,
               MAX(a.timestamp) as last_seen, MIN(a.timestamp) as first_seen
        FROM access_logs a JOIN users u ON a.user_id = u.id
        WHERE a.camera_id = ? GROUP BY u.id ORDER BY last_seen DESC LIMIT ?
    """, (camera_id, limit)).fetchall()
    return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
             "visit_count": r["visit_count"], "last_seen": r["last_seen"], "first_seen": r["first_seen"]} for r in rows]


def get_camera_stats(camera_id):
    conn = get_connection()
    today_start = conn.execute("SELECT date('now', 'localtime', 'start of day')").fetchone()[0]
    total_scans = conn.execute("SELECT COUNT(*) as c FROM access_logs WHERE camera_id = ?", (camera_id,)).fetchone()["c"]
    scans_today = conn.execute("SELECT COUNT(*) as c FROM access_logs WHERE camera_id = ? AND timestamp >= ?", (camera_id, today_start)).fetchone()["c"]
    unique_faces = conn.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE camera_id = ?", (camera_id,)).fetchone()["c"]
    unique_today = conn.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE camera_id = ? AND timestamp >= ?", (camera_id, today_start)).fetchone()["c"]
    last_activity = conn.execute("SELECT MAX(timestamp) as ts FROM access_logs WHERE camera_id = ?", (camera_id,)).fetchone()["ts"]
    return {"camera_id": camera_id, "total_scans": total_scans, "scans_today": scans_today,
            "unique_faces": unique_faces, "unique_faces_today": unique_today, "last_activity": last_activity}


def get_camera_activity(camera_id, limit=20):
    conn = get_connection()
    rows = conn.execute("""
        SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.snapshot_path,
               COALESCE(u.name, 'Unknown') as name, u.image_path, COALESCE(u.role, 'Guest') as role
        FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
        WHERE a.camera_id = ? ORDER BY a.timestamp DESC LIMIT ?
    """, (camera_id, limit)).fetchall()
    return [{"id": r["id"], "user_id": r["user_id"], "status": r["status"], "confidence": r["confidence"],
             "timestamp": r["timestamp"], "snapshot_path": r["snapshot_path"], "name": r["name"],
             "image_url": r["image_path"], "role": r["role"]} for r in rows]
