from database.connection import get_connection


def export_attendance(date_from=None, date_to=None, camera_id=None, role=None, user_id=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = [], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        if camera_id: conditions.append("a.camera_id = %s"); params.append(camera_id)
        if role and role.lower() != "all": conditions.append("u.role = %s"); params.append(role)
        if user_id: conditions.append("(a.user_id = %s OR u.name LIKE %s)"); params.extend([user_id, f"%{user_id}%"])
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        cursor.execute(f"""
            SELECT a.timestamp, a.user_id, u.name, u.role, a.status, a.confidence, a.camera_id
            FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
            {where} ORDER BY a.timestamp DESC
        """, params)
        rows = cursor.fetchall()
        return [{"timestamp": str(r["timestamp"]) if r["timestamp"] else None, "user_id": r["user_id"],
                 "name": r["name"], "role": r["role"], "status": r["status"], "confidence": r["confidence"],
                 "camera_id": r["camera_id"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def export_visitors(date_from=None, date_to=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = ["u.role = 'Guest'"], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        where = "WHERE " + " AND ".join(conditions)
        cursor.execute(f"""
            SELECT u.id, u.name, MIN(a.timestamp) as first_seen, MAX(a.timestamp) as last_seen, COUNT(a.id) as total_visits
            FROM users u LEFT JOIN access_logs a ON a.user_id = u.id
            {where} GROUP BY u.id ORDER BY last_seen DESC
        """, params)
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"],
                 "first_seen": str(r["first_seen"]) if r["first_seen"] else None,
                 "last_seen": str(r["last_seen"]) if r["last_seen"] else None,
                 "total_visits": r["total_visits"]} for r in rows]
    finally:
        cursor.close()
        conn.close()
