# Attendance & Employee Management Design Spec

## Overview

Complete the time in/out experience, add employee management CRUD, and add an attendance log view. Three areas of work: kiosk-style camera station, employee management page, and attendance log page.

## 1. Camera Station — Kiosk Clock In/Out

Replace the current `ResultModal` with a non-blocking toast system for multi-face scanning.

- **Toast cards**: Each recognized person gets a card sliding in from the right, stacked vertically. Shows avatar, name, "IN" (green) or "OUT" (red), confidence %. Auto-dismisses after 4 seconds.
- **Cooldown**: 10-second per-person cooldown. Same `user_id` within 10s is skipped — no toast, no API call.
- **Guests**: Amber-colored card — "Guest Detected" with auto-assigned ID.
- **No modal**: Remove `ResultModal`. Toasts don't block the camera feed.

## 2. Employee Management Page

New route `/employees` replacing the "Add Employee" sidebar link.

### Action Bar
- Search box (filter by name/ID)
- Role filter dropdown (All / Employee / Guest)
- "Add Employee" button — opens existing webcam/upload flow as a modal

### Employee Table
- Columns: Avatar, Name, ID, Role, Last Seen (timestamp + camera), Current Status (in/out), Actions
- Row actions: Edit (name, role, re-capture face), View (profile), Delete (with confirmation)
- Guest rows get a "Promote to Employee" action — changes role, lets admin set a name

### Profile View (slide-over or sub-route `/employees/:id`)
- Info card: avatar, name, role, registered date
- Attendance history table: date, time in, time out, camera, duration

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

### New Endpoints
- `GET /api/employees/:id` — single employee profile
- `PUT /api/employees/:id` — update name, role
- `DELETE /api/employees/:id` — delete user + face encoding
- `POST /api/employees/:id/reface` — re-capture face photo
- `GET /api/employees/:id/attendance` — attendance history for one person
- `GET /api/attendance` — paginated log with filters (date_from, date_to, camera_id, user_id, status)
- `GET /api/attendance/active` — everyone currently clocked in

### Recognition Endpoint Changes
- 10-second per-user cooldown before logging
- Return `skipped: true` when within cooldown
- Broadcast `recognition_result` only when not skipped

### Database
- No schema changes — existing tables cover all requirements
- New query: users whose last access_log status = "in" for active panel
