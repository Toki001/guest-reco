# UX & Reliability Improvements — Design Spec

## Overview

Four improvement areas for the facial recognition attendance system: separating employees from guests, camera station reliability, dashboard enhancements, and kiosk polish.

## 1. Separate Employees from Guests

### Problem
The Employees page shows both employees and auto-registered guests, making it confusing to manage staff.

### Solution

**Backend:**
- `GET /api/employees` — add optional `?role=` query param. Default `role=Employee` to only return employees. Pass `role=all` to return everyone (used by promote-search).
- New `GET /api/visitors` — returns **aggregated per-guest** data: one row per guest user with `id`, `name`, `image_url`, `first_seen`, `last_seen`, `total_visits`, `last_camera`. Paginated. Parameters: `page`, `per_page`, `date_from`, `date_to`. Uses `GROUP BY user_id, COUNT(*)` on access_logs joined with users where `role='Guest'`.

**Frontend:**
- `EmployeesPage.tsx` — default API call uses `?role=Employee`. The "promote guest" search input calls `GET /api/employees?role=all&search=<query>` to find guests to promote.
- New `VisitorsPage.tsx` — read-only table: photo thumbnail, guest name/ID, first seen, last seen, total visits, last camera. No edit/delete. Uses `authFetch` (admin-only page).
- `Sidebar.tsx` — nav becomes: Dashboard, Cameras, Employees, Visitors, Attendance.
- `MainApp.tsx` — add `/visitors` route with lazy import.

## 2. Camera Station Reliability Overhaul

### Problem
Scanning is intermittently unreliable across different devices (laptop, tablet, phone, mounted camera). Faces captured too small or blurry fail recognition silently.

### Solution (all changes in `CameraFeed.tsx`, no backend changes)

**A) Minimum face size gate**
- Face bounding box must be >= 80px wide **in MediaPipe video coordinates** (i.e., `det.boundingBox.width` relative to `video.videoWidth`, typically 640px). 80px at 640px = 12.5% of frame.
- Faces below threshold: show "MOVE CLOSER" (yellow outline) instead of starting countdown.

**B) Adaptive still-time**
- Use the **smallest face** in frame to determine still-time (most conservative):
  - Small faces (80–150px wide): 2s still time.
  - Large faces (150px+ wide): 1s still time.
- Adapts naturally to distance — close webcam = fast, far mounted camera = more patience.

**C) ~~Minimum crop resolution~~ — REMOVED**
Reviewer noted that upscaling a low-resolution crop doesn't add information (InsightFace resizes to 112x112 internally). The backend already adds padding in `_bytes_to_cv2`. The real fix is the minimum face size gate (2A) which prevents sending bad crops in the first place.

**D) Visual feedback states**
Replace current text overlays with distinct states:
- **No face** → control bar shows "READY TO SCAN" (green accent). Current "MOVEMENT" text removed.
- **Face too small** → "MOVE CLOSER" (yellow bounding box outline, yellow text)
- **Face detected, moving** → "HOLD STILL" (red bounding box outline, red text). Current code shows "MOVEMENT" — changed to clearer wording.
- **Face stable, counting** → countdown number (green bounding box outline, green text). Same as current "HOLD STILL: N" but without the "HOLD STILL" prefix since green = good.
- **Analyzing** → spinner overlay (unchanged)

Note: The CameraStationPage idle screen (Section 4C) and CameraFeed's "READY TO SCAN" are **separate layers**: CameraFeed's control bar always shows status, while CameraStationPage's idle overlay appears on top of the camera feed after 10s with no face. They coexist, not conflict.

**E) Retry on failure**
- If batch response returns zero valid results despite faces being sent (HTTP 200 but empty results), wait 500ms and retry once with a fresh capture from the current video frame.
- On network error or non-200 response, do NOT retry (avoid hammering a down server).
- Max 1 retry per scan cycle to prevent loops.
- If retry fails, reset to scanning state.

## 3. Dashboard Quick Wins

### Problem
Dashboard shows all-time stats with no "today" context. Activity feed lacks face thumbnails.

### Solution

**Backend:**
- New `GET /api/stats/today` — returns: `scans_today`, `unique_people_today`, `employees_in_today`, `guests_today`, `currently_on_site`.
- "Today" is computed using **server local time** (system timezone, which for FSUU in Philippines is UTC+8). Query: `timestamp >= date('now', 'localtime', 'start of day')` in SQLite.
- `currently_on_site` = `len(get_active_users())` — simple count, not the full list.

**Frontend (`DashboardTab.tsx`):**

**A) "Today" summary row**
- Row of small stat pills above existing all-time cards: "X scans today", "Y unique people", "Z on site now".
- Fetched from `GET /api/stats/today` on mount and on refresh.

**B) Face thumbnails in activity feed**
- Render circular avatar from `image_url` next to each activity entry. Resolve URL with `API_BASE` prefix for paths starting with `/`.
- Fallback to existing colored icon placeholder if `image_url` is empty/null.

**C) "Last updated" indicator**
- New `lastUpdatedAt` state variable, set on every WebSocket message and REST refresh.
- Rendered as subtle text below the "Live/Disconnected" badge: "Updated 2s ago".

## 4. Kiosk Polish

### Problem
Camera station is functional but doesn't feel like a proper kiosk. Toast notifications are too subtle for the use case.

### Solution

**A) Kiosk header (`CameraStationPage.tsx`)**
- Add live clock + date: "2:45 PM · Wednesday, March 12" — updated every second via `setInterval`.
- Institution branding: "FSUU" alongside department name.
- Animated "ready" pulse on status indicator when scanning.

**B) Full-width recognition banner (replaces `RecognitionToast`)**
- On recognition: full-width banner slides down from top of camera feed (below header).
- Content: large avatar (64px), name, role badge, status ("Welcome! Clocked In" green / "Goodbye! Clocked Out" red), confidence.
- Auto-dismiss: 4s with slide-up animation.
- Stack up to 3 visible banners. If 4+ recognized simultaneously, the 4th+ queue behind and appear as earlier banners dismiss.
- New component: `RecognitionBanner.tsx`. Interface: `BannerData` with same fields as current `ToastData` (id, name, type, status, confidence, imageUrl). `CameraStationPage.tsx` maps `result.image_url` → `banner.imageUrl` (same mapping as current toast).
- Delete `RecognitionToast.tsx`. Remove its import from `CameraStationPage.tsx`.

**C) Idle state**
- Track time since last face detected in `CameraStationPage.tsx` (not CameraFeed).
- After 10+ seconds with no face: show centered overlay "Approach camera to scan" with a pulsing face-outline icon.
- Disappears immediately when CameraFeed's `onSnap` fires or scan status changes to 'analyzing'.

**D) Audio feedback**
- Use **Web Audio API** to generate tones (no audio files needed). Short sine-wave beep for clock-in (higher pitch), lower pitch for clock-out.
- Unlock audio context on the first user interaction (the "Connect Camera" button tap or scan toggle tap). This handles mobile autoplay restrictions.
- Mute toggle in header bar. **Sound is OFF by default** (muted). Admin can tap to enable.

## Implementation Order

Sections can be implemented in parallel with these dependencies:
1. **Section 1** (employees/guests split) — independent, backend + frontend.
2. **Section 2** (camera reliability) — independent, frontend only.
3. **Section 3** (dashboard) — independent, backend + frontend.
4. **Section 4** (kiosk polish) — depends on Section 2 being done (feedback states must be settled before adding idle overlay and banners on top).

## File Impact Summary

| File | Action |
|------|--------|
| `backend/app.py` | Modify `/api/employees` (role param), add `/api/visitors`, `/api/stats/today` |
| `backend/database.py` | Add `get_visitors_aggregated`, `get_today_stats` functions. Modify `get_users_with_last_seen` to accept role filter. |
| `frontend/src/pages/EmployeesPage.tsx` | Default to `?role=Employee`, promote search uses `?role=all` |
| `frontend/src/pages/VisitorsPage.tsx` | New — read-only aggregated guest log |
| `frontend/src/components/Sidebar.tsx` | Add Visitors nav link |
| `frontend/src/pages/MainApp.tsx` | Add /visitors route |
| `frontend/src/components/CameraFeed.tsx` | Reliability overhaul (min size, adaptive time, retry, feedback states) |
| `frontend/src/components/DashboardTab.tsx` | Today stats row, face thumbnails, last-updated indicator |
| `frontend/src/pages/CameraStationPage.tsx` | Kiosk header (clock, branding), idle overlay, banner integration, audio, remove toast import |
| `frontend/src/components/RecognitionBanner.tsx` | New — full-width recognition banner, replaces RecognitionToast |
| `frontend/src/components/RecognitionToast.tsx` | Delete |
