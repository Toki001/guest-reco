# Plan: Per-Camera/Department Face Data Decoupling

## Summary

Currently, all face recognitions go into a single global pool (`access_logs` table with an optional `camera_id` column). The dashboard shows all faces regardless of which camera captured them.

**Goal**: Each camera/department has its own scoped face data. The dashboard can filter and view faces per-department, showing which faces were captured at which camera station.

## Current State Analysis

### Database (`backend/database.py`)
- `access_logs` table already HAS `camera_id` column — data is already tagged per-camera
- `users` table is global (shared across all cameras) — this is CORRECT, a person exists globally
- The `log_access_attempt()` function already accepts `camera_id` parameter
- All query functions (`get_access_logs`, `get_attendance_logs`, `get_visitors_aggregated`) already support `camera_id` filtering

### Backend (`backend/app.py`)
- `POST /api/recognize-batch` already receives `camera_id` from the camera page
- `POST /api/recognize` already receives `camera_id`
- `GET /api/attendance` already accepts `camera_id` query param
- **Missing**: No endpoint to get faces/logs filtered by camera, no per-camera stats

### Frontend
- `CameraFeed.tsx` already sends `camera_id` with recognition requests
- `DashboardTab.tsx` shows global stats — no per-camera breakdown
- `AttendancePage.tsx` has camera filter — partially working
- **Missing**: Per-camera face gallery view, department filter in dashboard

## What DOESN'T Need to Change

The data model is already 80% there. `access_logs.camera_id` already tracks which camera saw each face. We don't need a new table or schema migration. We just need:

1. **Better API filtering** — expose per-camera data more cleanly
2. **Frontend views** — show per-department face data in the dashboard

## Implementation Plan

### Task 1: Backend — Add per-camera API endpoints
**Files**: `backend/app.py`, `backend/database.py`

1.1. Add `GET /api/cameras/{camera_id}/faces` — returns faces seen by this camera
```python
def get_faces_by_camera(camera_id, limit=50):
    """Get unique faces seen by a specific camera, with last seen time."""
```

1.2. Add `GET /api/cameras/{camera_id}/stats` — per-camera statistics
```python
def get_camera_stats(camera_id):
    """Get stats for a specific camera: total scans, unique faces, last activity."""
```

1.3. Add `GET /api/cameras/{camera_id}/activity` — recent activity feed
```python
def get_camera_activity(camera_id, limit=20):
    """Get recent recognition events for a specific camera."""
```

### Task 2: Frontend — Camera detail panel in dashboard
**Files**: `frontend/src/pages/CameraGridPage.tsx` (or new component)

2.1. Add a "camera detail" view that shows when clicking a camera in the grid:
- Recent faces captured at this camera
- Per-camera stats (scans today, unique faces, etc.)
- Activity feed (last N recognitions)

2.2. The camera grid card should show a badge with face count for today.

### Task 3: Frontend — Department filter on existing pages
**Files**: `frontend/src/components/DashboardTab.tsx`, `frontend/src/pages/AttendancePage.tsx`

3.1. Add camera/department dropdown filter to the main dashboard
3.2. When filtered, stats and activity feed show only that camera's data
3.3. The attendance page already has a camera filter — verify it works

### Task 4: WebSocket events — per-camera scoping
**Files**: `backend/app.py`

4.1. Include `camera_id` in all recognition broadcast events (already done)
4.2. Frontend filters WS events by selected camera when in per-camera view

## Acceptance Criteria

- [ ] `GET /api/cameras/csp/faces` returns only faces seen at the "csp" camera
- [ ] `GET /api/cameras/csp/stats` returns scans count, unique faces, last activity for "csp"
- [ ] Dashboard camera grid shows face count badge per camera
- [ ] Clicking a camera in the grid shows its face gallery and stats
- [ ] Main dashboard can filter by department/camera
- [ ] No database migration needed — uses existing `camera_id` column

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Performance on large access_logs | Add index on `camera_id` column (if not exists) |
| Camera IDs are URL-encoded (contain hyphens) | Use `encodeURIComponent` consistently |
| Existing global views must still work | Filters are additive — no filter = global view |

## Verification Steps

1. Open `/camera/csp`, scan some faces
2. Open `/camera/lobby`, scan some faces
3. Open dashboard → camera grid → click "csp" → see only csp faces
4. Click "lobby" → see only lobby faces
5. Main dashboard without filter → see all faces globally
6. `GET /api/cameras/csp/faces` returns only csp faces
7. `GET /api/cameras/lobby/faces` returns only lobby faces

## Order of Implementation

1. Task 1 (backend APIs) — foundation
2. Task 2 (camera detail panel) — main feature
3. Task 3 (dashboard filter) — enhancement
4. Task 4 (WS scoping) — polish

PLAN_READY: .omc/plans/per-camera-face-data.md
