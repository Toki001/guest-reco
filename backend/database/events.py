import datetime
from database.connection import get_connection
from database.event_cameras import get_event_cameras, set_event_cameras


def get_all_events():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM events ORDER BY start_date ASC, start_time ASC")
        events = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()
    for ev in events:
        ev["camera_ids"] = get_event_cameras(ev["id"])
    return events


def get_event_by_id(event_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM events WHERE id = %s", (event_id,))
        ev = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()
    if ev:
        ev["camera_ids"] = get_event_cameras(ev["id"])
    return ev


def create_event(title, description, location, start_date, end_date, start_time, end_time, category, camera_ids=None):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        now = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            """INSERT INTO events (title, description, location, start_date, end_date, start_time, end_time, category, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (title, description or '', location or '', start_date, end_date or start_date,
             start_time or '', end_time or '', category or 'General', now),
        )
        event_id = cursor.lastrowid
        conn.commit()
    finally:
        cursor.close()
        conn.close()
    if camera_ids:
        set_event_cameras(event_id, camera_ids)
    return event_id


def update_event(event_id, **kwargs):
    camera_ids = kwargs.pop("camera_ids", None)
    conn = get_connection()
    cursor = conn.cursor()
    try:
        fields = []
        values = []
        for key in ('title', 'description', 'location', 'start_date', 'end_date', 'start_time', 'end_time', 'category'):
            if key in kwargs and kwargs[key] is not None:
                fields.append(f"{key} = %s")
                values.append(kwargs[key])
        if fields:
            values.append(event_id)
            cursor.execute(f"UPDATE events SET {', '.join(fields)} WHERE id = %s", values)
            conn.commit()
    finally:
        cursor.close()
        conn.close()
    if camera_ids is not None:
        set_event_cameras(event_id, camera_ids)


def delete_event(event_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM events WHERE id = %s", (event_id,))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def bulk_insert_events(events_list):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        now = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        inserted = 0
        for ev in events_list:
            title = str(ev.get('title', '')).strip()
            if not title:
                continue
            cursor.execute(
                """INSERT INTO events (title, description, location, start_date, end_date, start_time, end_time, category, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    title,
                    str(ev.get('description', '')).strip(),
                    str(ev.get('location', '')).strip(),
                    str(ev.get('start_date', '')).strip(),
                    str(ev.get('end_date', '')).strip() or str(ev.get('start_date', '')).strip(),
                    str(ev.get('start_time', '')).strip(),
                    str(ev.get('end_time', '')).strip(),
                    str(ev.get('category', 'General')).strip() or 'General',
                    now,
                ),
            )
            inserted += 1
        conn.commit()
        return inserted
    finally:
        cursor.close()
        conn.close()
