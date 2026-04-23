import datetime
from database.connection import get_connection


def get_all_events():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM events ORDER BY start_date ASC, start_time ASC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_event_by_id(event_id: int):
    conn = get_connection()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return dict(row) if row else None


def create_event(title, description, location, start_date, end_date, start_time, end_time, category):
    conn = get_connection()
    now = datetime.datetime.utcnow().isoformat()
    conn.execute(
        """INSERT INTO events (title, description, location, start_date, end_date, start_time, end_time, category, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, description or '', location or '', start_date, end_date or start_date,
         start_time or '', end_time or '', category or 'General', now),
    )
    conn.commit()


def update_event(event_id, **kwargs):
    conn = get_connection()
    fields = []
    values = []
    for key in ('title', 'description', 'location', 'start_date', 'end_date', 'start_time', 'end_time', 'category'):
        if key in kwargs and kwargs[key] is not None:
            fields.append(f"{key} = ?")
            values.append(kwargs[key])
    if not fields:
        return
    values.append(event_id)
    conn.execute(f"UPDATE events SET {', '.join(fields)} WHERE id = ?", values)
    conn.commit()


def delete_event(event_id):
    conn = get_connection()
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()


def bulk_insert_events(events_list):
    conn = get_connection()
    now = datetime.datetime.utcnow().isoformat()
    inserted = 0
    for ev in events_list:
        title = str(ev.get('title', '')).strip()
        if not title:
            continue
        conn.execute(
            """INSERT INTO events (title, description, location, start_date, end_date, start_time, end_time, category, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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
