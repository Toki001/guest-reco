import datetime
from database.connection import get_connection


def register_camera(camera_id, department):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("SELECT camera_id FROM cameras WHERE camera_id = %s", (camera_id,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("UPDATE cameras SET department = %s, last_heartbeat = %s, is_online = 1 WHERE camera_id = %s", (department, now, camera_id))
        else:
            cursor.execute("INSERT INTO cameras (camera_id, department, last_heartbeat, is_online, registered_at) VALUES (%s, %s, %s, 1, %s)", (camera_id, department, now, now))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def update_camera_heartbeat(camera_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("UPDATE cameras SET last_heartbeat = %s, is_online = 1 WHERE camera_id = %s", (now, camera_id))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def get_all_cameras():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT camera_id, department, last_heartbeat, is_online, registered_at FROM cameras")
        rows = cursor.fetchall()
        return [{"camera_id": r["camera_id"], "department": r["department"],
                 "last_heartbeat": str(r["last_heartbeat"]) if r["last_heartbeat"] else None,
                 "is_online": r["is_online"],
                 "registered_at": str(r["registered_at"]) if r["registered_at"] else None} for r in rows]
    finally:
        cursor.close()
        conn.close()


def mark_camera_offline(camera_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE cameras SET is_online = 0 WHERE camera_id = %s", (camera_id,))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def delete_camera(camera_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM cameras WHERE camera_id = %s", (camera_id,))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def get_offline_cameras(timeout_seconds=30):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=timeout_seconds)).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("SELECT camera_id, department FROM cameras WHERE is_online = 1 AND last_heartbeat < %s", (cutoff,))
        rows = cursor.fetchall()
        return [{"camera_id": r["camera_id"], "department": r["department"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_faces_by_camera(camera_id, limit=50):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT u.id, u.name, u.image_path, u.role, COUNT(a.id) as visit_count,
                   MAX(a.timestamp) as last_seen, MIN(a.timestamp) as first_seen
            FROM access_logs a JOIN users u ON a.user_id = u.id
            WHERE a.camera_id = %s GROUP BY u.id ORDER BY last_seen DESC LIMIT %s
        """, (camera_id, limit))
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
                 "visit_count": r["visit_count"], "last_seen": str(r["last_seen"]) if r["last_seen"] else None,
                 "first_seen": str(r["first_seen"]) if r["first_seen"] else None} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_camera_stats(camera_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        today_start = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d 00:00:00')
        cursor.execute("SELECT COUNT(*) as c FROM access_logs WHERE camera_id = %s", (camera_id,))
        total_scans = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM access_logs WHERE camera_id = %s AND timestamp >= %s", (camera_id, today_start))
        scans_today = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE camera_id = %s", (camera_id,))
        unique_faces = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE camera_id = %s AND timestamp >= %s", (camera_id, today_start))
        unique_today = cursor.fetchone()["c"]
        cursor.execute("SELECT MAX(timestamp) as ts FROM access_logs WHERE camera_id = %s", (camera_id,))
        last_activity = cursor.fetchone()["ts"]
        return {"camera_id": camera_id, "total_scans": total_scans, "scans_today": scans_today,
                "unique_faces": unique_faces, "unique_faces_today": unique_today,
                "last_activity": str(last_activity) if last_activity else None}
    finally:
        cursor.close()
        conn.close()


def get_camera_activity(camera_id, limit=20):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.snapshot_path,
                   COALESCE(u.name, 'Unknown') as name, u.image_path, COALESCE(u.role, 'Guest') as role
            FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
            WHERE a.camera_id = %s ORDER BY a.timestamp DESC LIMIT %s
        """, (camera_id, limit))
        rows = cursor.fetchall()
        return [{"id": r["id"], "user_id": r["user_id"], "status": r["status"], "confidence": r["confidence"],
                 "timestamp": str(r["timestamp"]) if r["timestamp"] else None, "snapshot_path": r["snapshot_path"],
                 "name": r["name"], "image_url": r["image_path"], "role": r["role"]} for r in rows]
    finally:
        cursor.close()
        conn.close()
