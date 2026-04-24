import datetime
from database.connection import get_connection


def set_event_cameras(event_id, camera_ids):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM event_cameras WHERE event_id = %s", (event_id,))
        for cid in camera_ids:
            cursor.execute("INSERT INTO event_cameras (event_id, camera_id) VALUES (%s, %s)", (event_id, cid))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def get_event_cameras(event_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT camera_id FROM event_cameras WHERE event_id = %s", (event_id,))
        return [r["camera_id"] for r in cursor.fetchall()]
    finally:
        cursor.close()
        conn.close()


def get_event_attendance(event_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM events WHERE id = %s", (event_id,))
        event = cursor.fetchone()
        if not event:
            return None

        cursor.execute("SELECT camera_id FROM event_cameras WHERE event_id = %s", (event_id,))
        camera_ids = [r["camera_id"] for r in cursor.fetchall()]
        if not camera_ids:
            return {"total_scans": 0, "unique_people": 0, "employees": 0, "guests": 0, "cameras": [], "attendees": []}

        start_dt = str(event["start_date"])
        end_dt = str(event["end_date"] or event["start_date"])
        start_time = event["start_time"] or "00:00:00"
        end_time = event["end_time"] or "23:59:59"
        if len(start_time) == 5:
            start_time += ":00"
        if len(end_time) == 5:
            end_time += ":59"
        # Event times are local (UTC+8), access_logs are stored in UTC — convert to UTC
        local_tz = datetime.timezone(datetime.timedelta(hours=8))
        dt_start_local = datetime.datetime.strptime(f"{start_dt} {start_time}", "%Y-%m-%d %H:%M:%S").replace(tzinfo=local_tz)
        dt_end_local = datetime.datetime.strptime(f"{end_dt} {end_time}", "%Y-%m-%d %H:%M:%S").replace(tzinfo=local_tz)
        dt_start = dt_start_local.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        dt_end = dt_end_local.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        placeholders = ", ".join(["%s"] * len(camera_ids))

        cursor.execute(f"""
            SELECT COUNT(*) as total_scans
            FROM access_logs
            WHERE camera_id IN ({placeholders})
              AND timestamp >= %s AND timestamp <= %s
        """, camera_ids + [dt_start, dt_end])
        total_scans = cursor.fetchone()["total_scans"]

        cursor.execute(f"""
            SELECT a.user_id, u.name, u.role, u.image_path,
                   MIN(a.timestamp) as first_scan, MAX(a.timestamp) as last_scan
            FROM access_logs a
            JOIN event_cameras ec ON a.camera_id = ec.camera_id AND ec.event_id = %s
            JOIN users u ON a.user_id = u.id
            WHERE a.timestamp >= %s AND a.timestamp <= %s
            GROUP BY a.user_id
            ORDER BY first_scan ASC
        """, [event_id, dt_start, dt_end])
        attendees = cursor.fetchall()

        unique_people = len(attendees)
        employees = sum(1 for a in attendees if a["role"] == "Employee")
        guests = sum(1 for a in attendees if a["role"] != "Employee")

        return {
            "total_scans": total_scans,
            "unique_people": unique_people,
            "employees": employees,
            "guests": guests,
            "cameras": camera_ids,
            "attendees": [{
                "user_id": a["user_id"],
                "name": a["name"],
                "role": a["role"],
                "image_url": a["image_path"],
                "first_scan": str(a["first_scan"]) if a["first_scan"] else None,
                "last_scan": str(a["last_scan"]) if a["last_scan"] else None,
            } for a in attendees],
        }
    finally:
        cursor.close()
        conn.close()
