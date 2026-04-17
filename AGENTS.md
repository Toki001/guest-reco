<!-- Generated: 2026-03-11 | Updated: 2026-03-11 -->

# guest-reco (SecureSight)

## Purpose
A fully offline face recognition system for school security. Camera stations in different departments detect and identify employees/guests via a central server. Uses local face recognition (dlib), SQLite database, and WebSocket for real-time dashboard updates. No cloud dependencies.

## Architecture
```
School LAN
├── Central Server (Docker)
│   ├── Backend: FastAPI + face_recognition + SQLite (:5001)
│   └── Frontend: React + Vite (:3000)
├── Camera Stations (browsers on tablets/laptops)
│   └── Open /camera/:departmentId on central server
└── Admin Dashboard (browser)
    └── Open /dashboard on central server
```

## Key Files

| File | Description |
|------|-------------|
| `docker-compose.yml` | Multi-container orchestration for central server |
| `DEPLOYMENT.md` | Setup guide for central server and camera stations |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `backend/` | FastAPI server with face recognition, SQLite, WebSocket (see `backend/AGENTS.md`) |
| `frontend/` | React SPA serving camera station and admin dashboard modes (see `frontend/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Fully offline system — no AWS, Supabase, or cloud CDN dependencies
- Backend requires `face_recognition` (dlib) which needs cmake for compilation
- Frontend bundles MediaPipe WASM locally in `public/`
- Camera stations are just browsers opening a URL on the central server

### Testing Requirements
- Backend: `cd backend && pip install -r requirements.txt && python app.py`
- Frontend: `cd frontend && npm install && npm run dev`
- Full stack: `docker compose up --build`
- Camera test: Open `http://localhost:3000/camera/test-dept` in browser

### Common Patterns
- HTTP POST for face recognition requests from camera stations
- WebSocket push from backend to dashboard for real-time updates
- Camera heartbeat (10s interval) for online/offline tracking

## Dependencies

### External
- `face_recognition` (dlib) — Local face encoding and matching
- `SQLite` — Embedded database via Python stdlib
- `MediaPipe` — Client-side face detection (bundled WASM)
- `React Router` — URL-based app mode routing

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
