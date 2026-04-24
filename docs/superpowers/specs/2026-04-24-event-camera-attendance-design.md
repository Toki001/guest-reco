# Event Camera Assignment & Attendance Tracking Design

## Context

Events exist in the system as an informational calendar. This feature connects events to cameras, enabling automatic attendance tracking — anyone scanned by an assigned camera during the event's time window counts as an attendee. No guest list or RSVP. Attendance is derived from existing `access_logs` data.

## Database

### New Table: `event_cameras`

```sql
CREATE TABLE event_cameras (
    event_id INT NOT NULL,
    camera_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (event_id, camera_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (camera_id) REFERENCES cameras(camera_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

No changes to `events`, `access_logs`, or `cameras` tables.

### Attendance Query Logic

Attendance is derived, not stored. Query pattern:

```sql
SELECT DISTINCT a.user_id, u.name, u.role, u.image_path,
       MIN(a.timestamp) as first_scan, MAX(a.timestamp) as last_scan
FROM access_logs a
JOIN event_cameras ec ON a.camera_id = ec.camera_id
JOIN users u ON a.user_id = u.id
WHERE ec.event_id = %s
  AND a.timestamp >= %s  -- event start datetime
  AND a.timestamp <= %s  -- event end datetime
GROUP BY a.user_id
ORDER BY first_scan ASC
```

Event start datetime is constructed from `events.start_date + events.start_time`. Event end datetime from `events.end_date + events.end_time`. If `start_time` or `end_time` is empty, default to `00:00:00` and `23:59:59` respectively.

## Backend

### New File: `backend/database/event_cameras.py`

Functions:
- `set_event_cameras(event_id, camera_ids: list[str])` — delete all existing camera assignments for the event, insert new ones. Handles empty list (removes all cameras).
- `get_event_cameras(event_id)` → `list[str]` of camera_ids assigned to the event.
- `get_event_attendance(event_id)` → dict with:
  - `total_scans`: int (total scan count, not unique)
  - `unique_people`: int
  - `employees`: int (unique employees)
  - `guests`: int (unique guests)
  - `cameras`: list of assigned camera_ids
  - `attendees`: list of `{user_id, name, role, image_url, first_scan, last_scan}`

### Modified: `backend/database/events.py`

- `create_event()` — accepts optional `camera_ids` parameter. After insert, calls `set_event_cameras` if provided.
- `update_event()` — accepts optional `camera_ids` parameter. Calls `set_event_cameras` if provided.
- `get_event_by_id()` — includes `camera_ids` in the returned dict.
- `get_all_events()` — includes `camera_ids` list for each event.

### Modified: `backend/database/connection.py`

Add `event_cameras` table creation to `init_db()`.

### Modified: `backend/database/__init__.py`

Re-export: `get_event_cameras`, `set_event_cameras`, `get_event_attendance`.

### Modified: `backend/routes/events.py`

- `POST /api/events` — accepts optional `camera_ids` field (JSON list of camera_id strings).
- `PUT /api/events/{id}` — accepts optional `camera_ids` field.
- `GET /api/events/{id}/attendance` — new endpoint, returns attendance data from `get_event_attendance`.

## Frontend

### Event Create/Edit Modal (in EventsPage.tsx)

- Fetch available cameras from `GET /api/cameras` on modal open.
- Add a multi-select section: list of cameras with checkboxes. Selected cameras shown as removable chips.
- On submit, include `camera_ids: string[]` in the request body.

### Event Detail View (in EventsPage.tsx)

When clicking an event:
- Show assigned cameras as badges.
- Fetch `GET /api/events/{id}/attendance` on open.
- Display: total unique attendees, employee count, guest count.
- Scrollable attendee list: avatar, name, role, first scan time, last scan time.
- If no cameras assigned or event not started: show "No attendance data yet".

## Files Modified

| File | Action |
|------|--------|
| `backend/database/connection.py` | Add `event_cameras` table to `init_db()` |
| `backend/database/event_cameras.py` | New file — camera assignment + attendance queries |
| `backend/database/events.py` | Modify create/update/get to include camera_ids |
| `backend/database/__init__.py` | Re-export new functions |
| `backend/routes/events.py` | Modify create/update, add attendance endpoint |
| `frontend/src/pages/EventsPage.tsx` | Camera multi-select in modal, attendance in detail view |
