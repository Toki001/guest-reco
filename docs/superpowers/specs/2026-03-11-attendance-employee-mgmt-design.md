# Attendance & Employee Management Design Spec

## Overview

Complete the time in/out experience, add employee management CRUD, and add an attendance log view. Three areas of work: kiosk-style camera station, employee management page, and attendance log page.

## 1. Camera Station — Kiosk Clock In/Out

Replace the current `ResultModal` with a non-blocking toast system for multi-face scanning.

- **Toast cards**: Each recognized person gets a card sliding in from the right, stacked vertically. Shows avatar, name, "IN" (green) or "OUT" (red), confidence %. Auto-dismisses after 4 seconds. Toasts appear per-result as they arrive (not batched).
- **Cooldown**: 10-second per-person cooldown enforced **both** client-side (skip API call) and server-side (return `skipped: true` as fallback for multi-camera race conditions). Client tracks cooldown by `user_id` — requires the `/api/recognize` response to include `user_id`.
- **Guests**: Amber-colored card — "Guest Detected" with auto-assigned ID (existing `GUEST-{uuid[:6]}` format).
- **No modal**: Remove `ResultModal`. Toasts don't block the camera feed.

## 2. Employee Management Page

New route `/employees` replacing the "Add Employee" sidebar link.

### Action Bar
- Search box (filter by name/ID)
- Role filter dropdown (All / Employee / Guest)
- "Add Employee" button — opens existing webcam/upload flow as a modal

### Employee Table
- Columns: Avatar, Name, ID, Role, Last Seen (computed join to access_logs), Current Status (in/out), Actions
- Row actions: Edit (name, role, re-capture face), View (profile), Delete (with confirmation)
- Guest rows get a "Promote to Employee" action — changes role, lets admin set a name
- No pagination initially — load all (expected <1000 users for offline facility)

### Profile View (slide-over or sub-route `/employees/:id`)
- Info card: avatar, name, role, earliest access_log timestamp as "first seen" date
- Attendance history table: date, time in, time out, camera, duration

### Deletion behavior
- Deleting a user removes from `users` table; orphaned `access_logs` rows are kept (historical record) but will show "Deleted User" in UI via LEFT JOIN null check
- Clear in-memory caches (`USER_STATE_CACHE`, `KNOWN_USERS_CACHE`) for the deleted user
- If user was "clocked in", they disappear from "Who's In" panel immediately

### Promote Guest
- Historical access_logs will retroactively show the new name/role (by design — the JOIN pulls current user data)

## 3. Attendance Log Page

New route `/attendance` in the sidebar.

### "Who's In Right Now" Panel
- Grid of cards for everyone currently clocked in (last status = "in")
- Each card: avatar, name, role badge, clock-in time, entry camera
- Live-updating via WebSocket
- Empty state: "No one currently on site"

### Event Log Table
- All clock in/out events, newest first
- Columns: Person, Role, Status (IN/OUT), Camera, Confidence, Timestamp
- Filters: date range picker, person search, camera dropdown, status filter
- Pagination: 50 per page

## 4. Backend Changes

### Multi-Camera In/Out Logic

The toggle is per-person globally (not per-camera). In a single-entrance facility, this works correctly. For multi-camera setups, all cameras toggle the same global status. This is acceptable for the current use case (office/facility access control where cameras are at entry points).

### New Endpoints
- `GET /api/employees/:id` — single employee profile
- `PUT /api/employees/:id` — update name, role
- `DELETE /api/employees/:id` — delete user + face encoding + clear caches
- `POST /api/employees/:id/reface` — re-capture face photo, re-encode
- `GET /api/employees/:id/attendance` — attendance history for one person
- `GET /api/attendance` — paginated log with filters (date_from, date_to, camera_id, user_id, status)
- `GET /api/attendance/active` — everyone currently clocked in

### Recognition Endpoint Changes
- 10-second per-user cooldown enforced server-side (in-memory dict of `user_id -> last_logged_time`)
- Return `user_id` in response (currently missing) + `skipped: true` when within cooldown
- Broadcast `recognition_result` only when not skipped
- Reject duplicate employee IDs on `POST /api/employees/add` instead of silent overwrite

### Database
- Add index on `access_logs(user_id, timestamp)` for efficient "last status" and attendance queries
- "Registered date" for profile view: use earliest `access_logs.timestamp` for that user (avoids schema migration)
- No other schema changes needed
