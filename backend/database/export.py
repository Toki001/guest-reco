from database.connection import get_connection


def export_attendance(date_from=None, date_to=None, camera_id=None):
    conn = get_connection()
    conditions, params = [], []
    if date_from: conditions.append("a.timestamp >= ?"); params.append(date_from)
    if date_to: conditions.append("a.timestamp <= ?"); params.append(date_to)
    if camera_id: conditions.append("a.camera_id = ?"); params.append(camera_id)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(f"""
        SELECT a.timestamp, a.user_id, u.name, u.role, a.status, a.confidence, a.camera_id
        FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
        {where} ORDER BY a.timestamp DESC
    """, params).fetchall()
    return [{"timestamp": r["timestamp"], "user_id": r["user_id"], "name": r["name"], "role": r["role"],
             "status": r["status"], "confidence": r["confidence"], "camera_id": r["camera_id"]} for r in rows]


def export_visitors(date_from=None, date_to=None):
    conn = get_connection()
    conditions, params = ["u.role = 'Guest'"], []
    if date_from: conditions.append("a.timestamp >= ?"); params.append(date_from)
    if date_to: conditions.append("a.timestamp <= ?"); params.append(date_to)
    where = "WHERE " + " AND ".join(conditions)
    rows = conn.execute(f"""
        SELECT u.id, u.name, MIN(a.timestamp) as first_seen, MAX(a.timestamp) as last_seen, COUNT(a.id) as total_visits
        FROM users u LEFT JOIN access_logs a ON a.user_id = u.id
        {where} GROUP BY u.id ORDER BY last_seen DESC
    """, params).fetchall()
    return [{"id": r["id"], "name": r["name"], "first_seen": r["first_seen"],
             "last_seen": r["last_seen"], "total_visits": r["total_visits"]} for r in rows]
