import datetime
import logging
from database.connection import get_connection
from database.users import USER_STATE_CACHE, KNOWN_USERS_CACHE, get_user_profile

logger = logging.getLogger(__name__)


def auto_clock_out_stale():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        today_midnight = datetime.datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).strftime('%Y-%m-%d %H:%M:%S')
        now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            SELECT u.id
            FROM users u
            JOIN access_logs a ON a.user_id = u.id
                AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
            WHERE a.status = 'in' AND a.timestamp < %s
        """, (today_midnight,))
        rows = cursor.fetchall()
        clocked_out = []
        for r in rows:
            uid = r["id"]
            cursor.execute(
                "SELECT 1 FROM access_logs WHERE user_id = %s AND camera_id = 'system-auto' AND timestamp >= %s",
                (uid, today_midnight)
            )
            if cursor.fetchone():
                continue
            cursor.execute(
                "INSERT INTO access_logs (user_id, status, confidence, timestamp, snapshot_path, camera_id) VALUES (%s, 'out', 100.0, %s, NULL, 'system-auto')",
                (uid, now)
            )
            USER_STATE_CACHE[uid] = 'out'
            clocked_out.append(uid)
        if clocked_out:
            conn.commit()
            logger.info("Auto clock-out: %d users (last in before %s)", len(clocked_out), today_midnight)
        return clocked_out
    finally:
        cursor.close()
        conn.close()


def get_last_status(user_id):
    if user_id in USER_STATE_CACHE:
        return USER_STATE_CACHE[user_id]
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT status FROM access_logs WHERE user_id = %s ORDER BY timestamp DESC LIMIT 1",
            (user_id,)
        )
        row = cursor.fetchone()
        return row["status"] if row else None
    finally:
        cursor.close()
        conn.close()


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
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO access_logs (user_id, status, confidence, timestamp, snapshot_path, camera_id) VALUES (%s, %s, %s, %s, %s, %s)",
            (user_id, final_status, float(confidence), datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S'), snapshot_path, camera_id)
        )
        conn.commit()
        logger.info("Logged: %s (%s)", user_id, final_status.upper())
        return final_status
    finally:
        cursor.close()
        conn.close()


def get_access_logs(limit=50):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.snapshot_path, a.camera_id,
                   u.name, u.image_path, u.role
            FROM access_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.timestamp DESC
            LIMIT %s
        """, (limit,))
        rows = cursor.fetchall()
        return [{
            "id": r["id"], "user_id": r["user_id"], "status": r["status"],
            "confidence": r["confidence"], "timestamp": str(r["timestamp"]) if r["timestamp"] else None,
            "snapshot_path": r["snapshot_path"], "camera_id": r["camera_id"],
            "name": r["name"], "image_url": r["image_path"], "role": r["role"]
        } for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_stats():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT COUNT(*) as c FROM access_logs")
        total = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id WHERE u.role = 'Employee'")
        employees = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id WHERE u.role = 'Guest'")
        guests = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM cameras WHERE is_online = 1")
        cameras_online = cursor.fetchone()["c"]
        return {"total_scans": total, "employee_matches": employees, "guest_alerts": guests, "cameras_online": cameras_online}
    finally:
        cursor.close()
        conn.close()


def get_today_stats():
    auto_clock_out_stale()
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        today_start = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d 00:00:00')
        cursor.execute("SELECT COUNT(*) as c FROM access_logs WHERE timestamp >= %s", (today_start,))
        scans = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE timestamp >= %s", (today_start,))
        unique = cursor.fetchone()["c"]
        cursor.execute("""
            SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
            JOIN users u ON a.user_id = u.id WHERE a.timestamp >= %s AND u.role = 'Employee'
        """, (today_start,))
        emp_in = cursor.fetchone()["c"]
        cursor.execute("""
            SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
            JOIN users u ON a.user_id = u.id WHERE a.timestamp >= %s AND u.role = 'Guest'
        """, (today_start,))
        guest_in = cursor.fetchone()["c"]
        on_site = len(get_active_users())
        return {"scans_today": scans, "unique_people_today": unique, "employees_in_today": emp_in, "guests_today": guest_in, "currently_on_site": on_site}
    finally:
        cursor.close()
        conn.close()


def get_active_users():
    auto_clock_out_stale()
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT u.id, u.name, u.image_path, u.role, a.timestamp as clock_in_time, a.camera_id
            FROM users u
            JOIN access_logs a ON a.user_id = u.id
                AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
            WHERE a.status = 'in'
            ORDER BY a.timestamp DESC
        """)
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
                 "clock_in_time": str(r["clock_in_time"]) if r["clock_in_time"] else None, "camera_id": r["camera_id"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_inactive_users():
    auto_clock_out_stale()
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT u.id, u.name, u.image_path, u.role,
                   a.timestamp as last_seen, a.camera_id, a.status as last_status
            FROM users u
            LEFT JOIN access_logs a ON a.user_id = u.id
                AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
            WHERE a.status IS NULL OR a.status = 'out'
            ORDER BY u.name
        """)
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
                 "last_seen": str(r["last_seen"]) if r["last_seen"] else None, "camera_id": r["camera_id"],
                 "last_status": r["last_status"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_attendance_logs(page=1, per_page=50, date_from=None, date_to=None, camera_id=None, user_id=None, status=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = [], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        if camera_id: conditions.append("a.camera_id = %s"); params.append(camera_id)
        if user_id: conditions.append("a.user_id = %s"); params.append(user_id)
        if status: conditions.append("a.status = %s"); params.append(status)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        offset = (page - 1) * per_page
        cursor.execute(f"SELECT COUNT(*) as c FROM access_logs a {where}", params)
        total = cursor.fetchone()["c"]
        cursor.execute(f"""
            SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.camera_id,
                   COALESCE(u.name, 'Deleted User') as name, u.image_path, COALESCE(u.role, 'Unknown') as role
            FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
            {where} ORDER BY a.timestamp DESC LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        rows = cursor.fetchall()
        return {"total": total, "page": page, "per_page": per_page, "items": [{
            "id": r["id"], "user_id": r["user_id"], "status": r["status"], "confidence": r["confidence"],
            "timestamp": str(r["timestamp"]) if r["timestamp"] else None, "camera_id": r["camera_id"],
            "name": r["name"], "image_url": r["image_path"], "role": r["role"]
        } for r in rows]}
    finally:
        cursor.close()
        conn.close()


def get_user_attendance(user_id, limit=100):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, status, confidence, timestamp, camera_id
            FROM access_logs WHERE user_id = %s ORDER BY timestamp ASC
        """, (user_id,))
        rows = cursor.fetchall()
        sessions, pending_in = [], None
        for r in rows:
            if r["status"] == "in":
                pending_in = {"time_in": str(r["timestamp"]), "camera_in": r["camera_id"], "confidence": r["confidence"]}
            elif r["status"] == "out" and pending_in:
                duration = None
                try:
                    t_in = datetime.datetime.fromisoformat(pending_in["time_in"])
                    t_out = r["timestamp"] if isinstance(r["timestamp"], datetime.datetime) else datetime.datetime.fromisoformat(str(r["timestamp"]))
                    duration = int((t_out - t_in).total_seconds())
                except Exception:
                    pass
                sessions.append({"time_in": pending_in["time_in"], "time_out": str(r["timestamp"]),
                                 "camera_in": pending_in["camera_in"], "camera_out": r["camera_id"],
                                 "confidence": pending_in["confidence"], "duration_seconds": duration})
                pending_in = None
        if pending_in:
            sessions.append({"time_in": pending_in["time_in"], "time_out": None, "camera_in": pending_in["camera_in"],
                             "camera_out": None, "confidence": pending_in["confidence"], "duration_seconds": None})
        sessions.reverse()
        return sessions[:limit]
    finally:
        cursor.close()
        conn.close()


def get_visitors_aggregated(page=1, per_page=50, date_from=None, date_to=None, search=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = ["u.role = 'Guest'"], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        if search: conditions.append("(u.name LIKE %s OR u.id LIKE %s)"); params.extend([f"%{search}%", f"%{search}%"])
        where = "WHERE " + " AND ".join(conditions)
        offset = (page - 1) * per_page
        cursor.execute(f"SELECT COUNT(DISTINCT u.id) as c FROM users u LEFT JOIN access_logs a ON a.user_id = u.id {where}", params)
        total = cursor.fetchone()["c"]
        cursor.execute(f"""
            SELECT u.id, u.name, u.image_path, MIN(a.timestamp) as first_seen, MAX(a.timestamp) as last_seen,
                   COUNT(a.id) as total_visits,
                   SUM(CASE WHEN a.status = 'in' THEN 1 ELSE 0 END) as entries_count,
                   SUM(CASE WHEN a.status = 'out' THEN 1 ELSE 0 END) as exits_count,
                   (SELECT camera_id FROM access_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as last_camera,
                   (SELECT status FROM access_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as last_status
            FROM users u LEFT JOIN access_logs a ON a.user_id = u.id {where}
            GROUP BY u.id ORDER BY last_seen DESC LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        rows = cursor.fetchall()
        return {"total": total, "page": page, "per_page": per_page, "items": [{
            "id": r["id"], "name": r["name"], "image_url": r["image_path"],
            "first_seen": str(r["first_seen"]) if r["first_seen"] else None,
            "last_seen": str(r["last_seen"]) if r["last_seen"] else None,
            "total_visits": r["total_visits"],
            "entries_count": int(r["entries_count"] or 0), "exits_count": int(r["exits_count"] or 0),
            "last_camera": r["last_camera"], "last_status": r["last_status"]
        } for r in rows]}
    finally:
        cursor.close()
        conn.close()


def get_hourly_stats(date_from=None, date_to=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = [], []
        if date_from: conditions.append("timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("timestamp <= %s"); params.append(date_to)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        cursor.execute(f"""
            SELECT DATE_FORMAT(timestamp, '%%Y-%%m-%%d %%H:00') as hour, COUNT(*) as scans,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   SUM(CASE WHEN status = 'out' THEN 1 ELSE 0 END) as exits
            FROM access_logs {where} GROUP BY hour ORDER BY hour DESC LIMIT 168
        """, params)
        rows = cursor.fetchall()
        return [{"hour": r["hour"], "scans": r["scans"], "entries": int(r["entries"] or 0), "exits": int(r["exits"] or 0)} for r in reversed(rows)]
    finally:
        cursor.close()
        conn.close()


def get_stats_for_range(date_from=None, date_to=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = [], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        role_join = f"{where}{' AND ' if conditions else ' WHERE '}"
        cursor.execute(f"SELECT COUNT(*) as c FROM access_logs a {where}", params)
        total = cursor.fetchone()["c"]
        cursor.execute(f"SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id {role_join}u.role = 'Employee'", params)
        employees = cursor.fetchone()["c"]
        cursor.execute(f"SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id {role_join}u.role = 'Guest'", params)
        guests = cursor.fetchone()["c"]
        cursor.execute(f"SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a {where}", params)
        unique = cursor.fetchone()["c"]
        return {"total_scans": total, "employee_matches": employees, "guest_alerts": guests, "unique_people": unique}
    finally:
        cursor.close()
        conn.close()


def get_analytics(days=30):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')

        cursor.execute("""
            SELECT HOUR(timestamp) as hour,
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   SUM(CASE WHEN status = 'out' THEN 1 ELSE 0 END) as exits
            FROM access_logs WHERE timestamp >= %s
            GROUP BY hour ORDER BY hour
        """, (cutoff,))
        peak_hours = cursor.fetchall()
        peak_hours_data = [{"hour": r["hour"], "total": r["total"], "entries": int(r["entries"] or 0), "exits": int(r["exits"] or 0)} for r in peak_hours]

        cursor.execute("""
            SELECT (DAYOFWEEK(timestamp) - 1) as dow,
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   COUNT(DISTINCT DATE(timestamp)) as num_days
            FROM access_logs WHERE timestamp >= %s
            GROUP BY dow ORDER BY dow
        """, (cutoff,))
        dow_rows = cursor.fetchall()
        day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        dow_data = [{"day": day_names[r["dow"]], "dow": r["dow"], "total": r["total"], "entries": int(r["entries"] or 0),
                     "avg": round(r["total"] / max(r["num_days"], 1), 1)} for r in dow_rows]

        cursor.execute("""
            SELECT DATE(timestamp) as day,
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   SUM(CASE WHEN status = 'out' THEN 1 ELSE 0 END) as exits,
                   COUNT(DISTINCT user_id) as unique_people
            FROM access_logs WHERE timestamp >= %s
            GROUP BY day ORDER BY day
        """, (cutoff,))
        daily_rows = cursor.fetchall()
        daily_data = [{"day": str(r["day"]), "total": r["total"], "entries": int(r["entries"] or 0),
                       "exits": int(r["exits"] or 0), "unique_people": r["unique_people"]} for r in daily_rows]

        cursor.execute("""
            SELECT a.camera_id, COALESCE(c.department, a.camera_id) as department,
                   COUNT(*) as total,
                   SUM(CASE WHEN a.status = 'in' THEN 1 ELSE 0 END) as entries,
                   COUNT(DISTINCT a.user_id) as unique_people
            FROM access_logs a LEFT JOIN cameras c ON a.camera_id = c.camera_id
            WHERE a.timestamp >= %s AND a.camera_id IS NOT NULL
            GROUP BY a.camera_id ORDER BY total DESC
        """, (cutoff,))
        camera_rows = cursor.fetchall()
        camera_data = [{"camera_id": r["camera_id"], "department": r["department"], "total": r["total"],
                        "entries": int(r["entries"] or 0), "unique_people": r["unique_people"]} for r in camera_rows]

        cursor.execute("""
            SELECT COALESCE(u.role, 'Unknown') as role, COUNT(*) as total,
                   COUNT(DISTINCT a.user_id) as unique_people
            FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
            WHERE a.timestamp >= %s
            GROUP BY role
        """, (cutoff,))
        role_rows = cursor.fetchall()
        role_data = [{"role": r["role"], "total": r["total"], "unique_people": r["unique_people"]} for r in role_rows]

        num_days = max(len(daily_data), 1)
        total_scans = sum(d["total"] for d in daily_data)
        total_entries = sum(d["entries"] for d in daily_data)
        cursor.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE timestamp >= %s", (cutoff,))
        total_unique = cursor.fetchone()["c"]

        busiest_hour = max(peak_hours_data, key=lambda x: x["total"])["hour"] if peak_hours_data else 0
        busiest_day = max(dow_data, key=lambda x: x["avg"])["day"] if dow_data else "N/A"

        tomorrow = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)
        tomorrow_dow = int(tomorrow.strftime('%w'))
        cursor.execute("""
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   COUNT(DISTINCT user_id) as unique_people,
                   COUNT(DISTINCT DATE(timestamp)) as num_days
            FROM access_logs
            WHERE (DAYOFWEEK(timestamp) - 1) = %s AND timestamp >= %s
        """, (tomorrow_dow, cutoff))
        hist_row = cursor.fetchone()

        pred_days = max(hist_row["num_days"] or 0, 1)
        prediction = {
            "day_name": day_names[tomorrow_dow],
            "date": tomorrow.strftime('%Y-%m-%d'),
            "expected_scans": round((hist_row["total"] or 0) / pred_days),
            "expected_entries": round((hist_row["entries"] or 0) / pred_days),
            "expected_unique": round((hist_row["unique_people"] or 0) / pred_days),
            "based_on_days": hist_row["num_days"] or 0,
            "confidence": min(round((hist_row["num_days"] or 0) / max(num_days * 0.15, 1) * 100), 100),
        }

        return {
            "summary": {
                "total_scans": total_scans,
                "total_entries": total_entries,
                "total_unique": total_unique,
                "avg_daily_scans": round(total_scans / num_days, 1),
                "avg_daily_entries": round(total_entries / num_days, 1),
                "avg_daily_unique": round(total_unique / num_days, 1) if num_days > 1 else total_unique,
                "busiest_hour": busiest_hour,
                "busiest_day": busiest_day,
                "days_analyzed": num_days,
            },
            "peak_hours": peak_hours_data,
            "day_of_week": dow_data,
            "daily_trend": daily_data,
            "camera_traffic": camera_data,
            "role_breakdown": role_data,
            "prediction": prediction,
        }
    finally:
        cursor.close()
        conn.close()


def global_search(query, limit=20):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        q = f"%{query}%"
        results = []
        cursor.execute("SELECT id, name, image_path, role FROM users WHERE name LIKE %s OR id LIKE %s LIMIT %s", (q, q, limit))
        for r in cursor.fetchall():
            results.append({"type": "person", "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"]})
        cursor.execute("SELECT camera_id, department, is_online FROM cameras WHERE camera_id LIKE %s OR department LIKE %s LIMIT %s", (q, q, limit))
        for r in cursor.fetchall():
            results.append({"type": "camera", "id": r["camera_id"], "name": r["department"], "is_online": r["is_online"]})
        return results[:limit]
    finally:
        cursor.close()
        conn.close()
