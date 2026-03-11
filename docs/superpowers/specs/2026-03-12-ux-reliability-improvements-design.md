# UX & Reliability Improvements — Design Spec

## Overview

Four improvement areas for the facial recognition attendance system: separating employees from guests, camera station reliability, dashboard enhancements, and kiosk polish.

## 1. Separate Employees from Guests

### Problem
The Employees page shows both employees and auto-registered guests, making it confusing to manage staff.

### Solution

**Backend:**
- `GET /api/employees` — add default filter to return only `role=Employee`. Existing endpoint, behavior change.
- New `GET /api/visitors` — returns paginated guest access logs with user info, sorted by most recent visit. Parameters: `page`, `per_page`, `date_from`, `date_to`.

**Frontend:**
- `EmployeesPage.tsx` — filter displayed list to `role=Employee` only. Keep "promote guest to employee" search (searches all users).
- New `VisitorsPage.tsx` — simple read-only table: photo thumbnail, guest name/ID, first seen, last seen, total visits, last camera. No edit/delete.
- `Sidebar.tsx` — nav becomes: Dashboard, Cameras, Employees, Visitors, Attendance.
- `MainApp.tsx` — add `/visitors` route with lazy import.

## 2. Camera Station Reliability Overhaul

### Problem
Scanning is intermittently unreliable across different devices (laptop, tablet, phone, mounted camera). Faces captured too small or blurry fail recognition silently.

### Solution (all changes in `CameraFeed.tsx`, no backend changes)

**A) Minimum face size gate**
- Face bounding box must be >= 80px wide in the video frame.
- Faces below threshold: show "MOVE CLOSER" (yellow outline) instead of starting countdown.

**B) Adaptive still-time**
- Small-to-medium faces (80–150px wide): 2s still time.
- Large faces (150px+ wide): 1s still time.
- Adapts naturally to distance — close webcam = fast, far mounted camera = more patience.

**C) Minimum crop resolution**
- After cropping with padding, if result is < 150px on either dimension, upscale to 150px before sending.
- Ensures InsightFace receives enough pixels.

**D) Visual feedback states**
Replace current text overlays:
- No face detected → idle: "READY TO SCAN" (green accent on control bar)
- Face too small → "PLEASE MOVE CLOSER" (yellow bounding box)
- Face moving → "HOLD STILL" (red bounding box, same as current)
- Face stable → countdown (green bounding box)
- Analyzing → spinner overlay (unchanged)

**E) Retry on failure**
- If batch response returns zero valid results despite faces being sent, wait 500ms and retry once.
- Max 1 retry per scan cycle to prevent loops.
- If retry fails, reset to scanning state.

## 3. Dashboard Quick Wins

### Problem
Dashboard shows all-time stats with no "today" context. Activity feed lacks face thumbnails.

### Solution

**Backend:**
- New `GET /api/stats/today` — returns: scans_today, unique_people_today, employees_in_today, guests_today, currently_on_site (count from `get_active_users`).

**Frontend (`DashboardTab.tsx`):**

**A) "Today" summary row**
- Row of stat pills above existing cards: "X scans today", "Y unique people", "Z on site now".
- Provides immediate situational awareness.

**B) Face thumbnails in activity feed**
- Render circular avatar from `image_url` next to each activity entry.
- Fallback to colored icon placeholder if no image.

**C) "Last updated" indicator**
- Subtle timestamp at top of activity feed: "Last updated: 2s ago".
- Updates on each WebSocket event or REST refresh.

## 4. Kiosk Polish

### Problem
Camera station is functional but doesn't feel like a proper kiosk. Toast notifications are too subtle for the use case.

### Solution

**A) Kiosk header (`CameraStationPage.tsx`)**
- Add live clock + date: "2:45 PM · Wednesday, March 12"
- Institution branding: "FSUU" alongside department name.
- Animated "ready" pulse on status indicator when scanning.

**B) Full-width recognition banner (replaces `RecognitionToast`)**
- On recognition: full-width banner across top of camera feed.
- Content: large avatar (64px), name, role badge, status ("Welcome! Clocked In" green / "Goodbye! Clocked Out" red), confidence.
- Auto-dismiss: 4s with slide-up animation.
- Stack up to 3 banners for simultaneous multi-face recognition.
- New component: `RecognitionBanner.tsx` replaces `RecognitionToast.tsx`.

**C) Idle state**
- No face detected for 10+ seconds → show centered "Approach camera to scan" with subtle face-scan animation.
- Disappears immediately when a face is detected.

**D) Audio feedback**
- Success chime on clock-in, different tone on clock-out.
- No sound on failure.
- Mute toggle in header bar, off by default.

## File Impact Summary

| File | Action |
|------|--------|
| `backend/app.py` | Add `/api/visitors`, `/api/stats/today` endpoints |
| `backend/database.py` | Add `get_visitors`, `get_today_stats` functions |
| `frontend/src/pages/EmployeesPage.tsx` | Filter to employees only |
| `frontend/src/pages/VisitorsPage.tsx` | New — read-only guest log |
| `frontend/src/pages/AttendancePage.tsx` | No changes |
| `frontend/src/components/Sidebar.tsx` | Add Visitors nav link |
| `frontend/src/pages/MainApp.tsx` | Add /visitors route |
| `frontend/src/components/CameraFeed.tsx` | Reliability overhaul (min size, adaptive time, retry, feedback) |
| `frontend/src/components/DashboardTab.tsx` | Today stats, thumbnails, last-updated |
| `frontend/src/pages/CameraStationPage.tsx` | Kiosk header, idle state, banner integration |
| `frontend/src/components/RecognitionBanner.tsx` | New — replaces RecognitionToast |
| `frontend/src/components/RecognitionToast.tsx` | Delete |
