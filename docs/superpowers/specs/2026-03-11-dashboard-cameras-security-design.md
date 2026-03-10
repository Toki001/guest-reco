# SecureSight: Dashboard Fix, Live Camera Grid, Admin Auth

**Date:** 2026-03-11
**Status:** Approved

## Summary

Three improvements to the SecureSight offline distributed face recognition system:

1. **Fix dashboard analytics** — stats stuck at 0 because camera events don't trigger stats broadcasts
2. **Live camera grid page** — MJPEG-over-WebSocket streaming from camera stations to a new admin grid view
3. **Admin login + camera API key** — JWT-based admin auth for dashboard, shared API key for camera stations

## 1. Dashboard Analytics Fix

### Problem

- `cameras_online` stays at 0 because `register_camera_endpoint` and `camera_heartbeat_endpoint` don't broadcast `stats_update` events
- When cameras come online, the dashboard's metric cards don't update until a face recognition occurs
- `get_stats()` on line 144 and 173 of `app.py` is called synchronously (not wrapped in `asyncio.to_thread`)

### Solution

- After `register_camera`, broadcast `stats_update` with fresh `get_stats()` data
- After `camera_offline` events in `camera_timeout_checker`, broadcast `stats_update`
- Wrap remaining sync `get_stats()` calls in `asyncio.to_thread()`

### Files Modified

- `backend/app.py` — Add stats broadcasts to camera register/offline events

## 2. Live Camera Grid (MJPEG over WebSocket)

### Architecture

```
Camera Station Browser
  → captures frame from webcam canvas (320×240 JPEG)
  → sends as base64 via WebSocket /ws/camera-stream every 200ms (~5 fps)

Backend Server
  → receives frames on /ws/camera-stream
  → stores latest frame per camera_id in memory dict
  → relays frames to all /ws/camera-view subscribers

Dashboard Grid Page (/cameras)
  → connects to /ws/camera-view
  → receives {camera_id, frame, timestamp} messages
  → renders frames into <img> tags via data URI src swap
  → click any tile → fullscreen overlay with ESC/close
```

### UI Design

- **Auto-fit grid** layout — tiles resize to fill available space
- Each tile shows: live video frame, department name, online status dot, FPS indicator
- Offline cameras show amber border with "Offline" label
- Click any tile to expand to fullscreen, close with ESC or X button
- Auto-reconnect with "Reconnecting..." spinner if stream drops

### Backend Changes

- New WebSocket endpoint: `/ws/camera-stream` — receives frames from camera stations
  - Accepts: `{"camera_id": "lobby", "frame": "<base64 jpeg>", "timestamp": "..."}`
  - Stores latest frame in `dict[str, bytes]` (in-memory, no disk)
  - Relays to all `/ws/camera-view` subscribers
- New WebSocket endpoint: `/ws/camera-view` — sends frames to dashboard viewers
  - On connect: sends latest frame for all known cameras
  - Ongoing: forwards new frames as they arrive

### Frontend Changes

- New page: `frontend/src/pages/CameraGridPage.tsx`
  - WebSocket connection to `/ws/camera-view`
  - CSS Grid with `auto-fit, minmax(280px, 1fr)`
  - Fullscreen overlay component on tile click
- New sidebar link: `/cameras` with `videocam` icon
- `CameraStationPage.tsx` / `CameraFeed.tsx` updated:
  - Capture canvas frames and send via WebSocket to `/ws/camera-stream`
  - Frame capture at 5 fps (200ms interval), JPEG quality 0.6, 320×240 resolution

### Performance Constraints

- Frame size: ~15-30KB per JPEG at 320×240 quality 0.6
- 5 cameras × 5 fps × 25KB = ~625KB/s bandwidth (fine for LAN)
- In-memory frame buffer — no disk writes for streaming

## 3. Admin Login + Camera API Key

### Auth Flow

```
Admin (Dashboard/Cameras/Add Employee):
  1. Opens any protected route
  2. No valid JWT → redirected to /login
  3. Enters username + password
  4. POST /api/auth/login → returns JWT token
  5. Token stored in localStorage
  6. All subsequent API calls include Authorization: Bearer <token>
  7. WebSocket connections include token as query param

Camera Stations:
  1. URL includes API key: /camera/lobby?key=<CAMERA_API_KEY>
  2. All API calls include X-API-Key header
  3. WebSocket connections include key as query param
```

### Backend Changes

- New file: `backend/auth.py`
  - `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` from env vars
  - `CAMERA_API_KEY` from env var
  - Password hashing with `hashlib.sha256` (bcrypt avoided to stay dependency-light)
  - JWT creation/validation using `PyJWT` library
  - FastAPI dependency `require_admin` — validates Bearer token
  - FastAPI dependency `require_camera_or_admin` — validates either Bearer token or X-API-Key
- New endpoint: `POST /api/auth/login` — returns JWT
- New endpoint: `GET /api/auth/me` — returns current user info
- Protected endpoints:
  - Admin-only: `GET /api/users`, `GET /api/access-logs`, `GET /api/stats`, `GET /api/cameras`
  - Camera-or-admin: `POST /api/recognize`, `POST /api/camera/register`, `POST /api/camera/heartbeat`
  - Public: `POST /api/auth/login`
- WebSocket auth: token/key validated on connection, reject if invalid

### Frontend Changes

- New page: `frontend/src/pages/LoginPage.tsx`
  - Dark centered card design matching sidebar aesthetic
  - Username + password form
  - Stores JWT in localStorage on success
  - Redirects to /dashboard
- New utility: `frontend/src/auth.ts`
  - `getToken()`, `setToken()`, `clearToken()`, `isAuthenticated()`
  - `authFetch()` — wrapper around fetch that adds Authorization header
  - `getAuthWsUrl(url)` — appends token as query param for WebSocket
- Route protection in `App.tsx`:
  - Wrap admin routes with auth check
  - Redirect to /login if not authenticated
- `CameraStationPage.tsx`:
  - Read API key from URL query param `?key=`
  - Include `X-API-Key` header on all requests
- Sidebar: add logout button functionality

### Default Credentials

Set via environment variables with defaults for development:
- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD=securesight2026`
- `CAMERA_API_KEY=` (auto-generated UUID on first run if not set)

### Dependencies

- `PyJWT` added to `backend/requirements.txt`

## Acceptance Criteria

1. Dashboard stats update in real-time when cameras register/go offline
2. Camera grid page shows live video from all connected camera stations at ~5 fps
3. Clicking a camera tile opens fullscreen view
4. Offline cameras show visually distinct (amber) in the grid
5. Admin login required to access dashboard, cameras, and add-employee pages
6. Camera stations authenticate with API key from URL
7. Unauthenticated requests to protected endpoints return 401
8. WebSocket connections require valid auth
9. Logout clears token and redirects to login
