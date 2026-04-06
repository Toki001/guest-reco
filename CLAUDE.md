# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SecureSight — an offline face recognition system for school security. Camera stations (browsers on tablets/laptops) capture faces via MediaPipe WASM, send crops to a FastAPI backend that matches against ArcFace embeddings in SQLite, and broadcasts results over WebSocket to an admin dashboard. No cloud dependencies.

## Development Commands

### Running locally (3 processes required)

```bash
# Terminal 1: MediaMTX WebRTC relay
./mediamtx mediamtx.yml

# Terminal 2: Backend (from backend/)
source .venv/bin/activate
python app.py                    # Starts on :5001

# Terminal 3: Frontend (from frontend/)
npm run dev                      # Starts on :3000 (HTTPS, self-signed)
```

### Docker (full stack minus MediaMTX)

```bash
docker compose up --build -d
```

### Type checking

```bash
cd frontend && npx tsc --noEmit
```

### Build

```bash
cd frontend && npm run build
```

## Architecture

### Three-process dev setup

| Process | Port | Purpose |
|---------|------|---------|
| MediaMTX | 8889 (HTTP), 8189 (ICE/UDP), 9997 (API) | WHIP/WHEP WebRTC relay for live camera streams |
| Backend (FastAPI) | 5001 | Face recognition, employee CRUD, WebSocket broadcast, SQLite |
| Frontend (Vite) | 3000 | React SPA with proxy to backend and MediaMTX |

Vite dev server proxies: `/api` and `/ws` to backend (:5001), `/whip` and `/whep` paths to MediaMTX (:8889) via a custom middleware plugin in `vite.config.ts`.

### Frontend routing (two modes)

- **Camera station** (`/camera/:cameraId`) — public route, authenticates with API key. Runs MediaPipe face detection client-side, posts JPEG crops to `/api/recognize-batch`, publishes video via WHIP to MediaMTX.
- **Admin dashboard** (`/dashboard`, `/employees`, `/visitors`, `/attendance`, `/cameras`) — JWT-protected routes. Receives real-time events over WebSocket (`/ws/dashboard`), views live camera feeds via WHEP.

### Face recognition pipeline

1. Camera station detects faces client-side (MediaPipe BlazeFace WASM in `public/mediapipe-wasm/`)
2. Crops posted to `/api/recognize` or `/api/recognize-batch`
3. Backend extracts 512-d ArcFace embeddings (InsightFace `buffalo_l`)
4. Matches against stored embeddings (up to 5 per user, multi-embedding adaptive learning, diversity threshold 0.15)
5. Returns match or registers new guest
6. Broadcasts result via WebSocket to all connected dashboards

### Backend patterns

- All endpoints are `async def`; CPU-bound face_recognition calls use `asyncio.to_thread()`
- SQLite in WAL mode with thread-local connections (`database.py`)
- WebSocket `ConnectionManager` in `app.py` broadcasts to all dashboard subscribers
- Background asyncio task checks camera heartbeats (15s interval, 30s timeout)
- Static file mounts (`/avatars`, `/snapshots`) must come AFTER API route definitions in `app.py`
- Config loaded from `.env.local` via `config.py`; defaults: port 5001, face distance threshold 0.45

### Frontend patterns

- React 19, Vite 6, Tailwind CSS v4 (plugin-based, theme via CSS custom properties in `index.css`)
- React StrictMode is disabled in `index.tsx` — it causes WebRTC double-mount issues
- `CameraFeed.tsx` creates video elements via direct DOM manipulation (bypasses React ref binding issues with WebRTC)
- ICE reconnection: only republish on `failed` state; `disconnected` is transient (10s grace period)
- Auth: JWT stored in `localStorage` (key: `securesight_token`), helper in `auth.ts`
- `authFetch` wrapper adds Authorization header to all API calls

### Authentication

- Admin login: POST `/api/auth/login` returns JWT (default: `admin` / `securesight2026`)
- Camera stations: `X-API-Key` header (auto-generated on backend startup, printed to console)
- WebSocket auth: token passed as query parameter

### Database tables (SQLite)

- `users` — id, name, face_encoding, image_path, role
- `face_embeddings` — id, user_id, embedding (bytes), condition, created_at
- `access_logs` — id, user_id, status, confidence, timestamp, snapshot_path, camera_id
- `cameras` — camera_id, department, last_heartbeat, is_online, registered_at

## Build dependencies

- Backend: `face_recognition` requires cmake and a C++ compiler to build dlib
- Frontend: MediaPipe WASM and model files are pre-bundled in `public/` (no download step)
- HTTPS required for camera access — Vite uses `@vitejs/plugin-basic-ssl` for self-signed certs in dev

## Commit style

Use descriptive prefixes: `feat:`, `fix:`, `docs:`, `redesign:`, `revert:`
