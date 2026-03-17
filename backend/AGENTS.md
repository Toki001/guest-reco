<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-11 | Updated: 2026-03-11 -->

# backend

## Purpose
FastAPI Python server providing offline face recognition, employee management, camera registration, and WebSocket dashboard broadcast. Uses local dlib-based face encoding stored in SQLite.

## Key Files

| File | Description |
|------|-------------|
| `app.py` | FastAPI app with `/api/recognize`, `/api/employees/add`, WebSocket `/ws/dashboard`, camera registration/heartbeat endpoints |
| `config.py` | Local-only configuration (DB path, storage dirs, face threshold) |
| `database.py` | SQLite database layer with WAL mode — users, access_logs, cameras tables |
| `face_engine.py` | Local face recognition using `face_recognition` library — `index_face()` and `search_face()` |
| `requirements.txt` | Python dependencies (fastapi, face_recognition, numpy, websockets) |
| `Dockerfile` | Container config with dlib build deps (cmake, build-essential) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `services/` | Standalone utility scripts for batch operations (see `services/AGENTS.md`) |
| `avatars/` | Local avatar image storage (auto-created at runtime) |
| `snapshots/` | Local snapshot storage (auto-created at runtime) |

## For AI Agents

### Working In This Directory
- Endpoints use `async def` with `asyncio.to_thread()` for CPU-bound face_recognition calls
- SQLite uses WAL mode and thread-local connections for concurrent access
- WebSocket ConnectionManager broadcasts events to all dashboard subscribers
- Camera timeout checker runs as background asyncio task (15s interval, 30s timeout)
- Static file mounts (`/avatars`, `/snapshots`) must be AFTER all API route definitions

### Database Schema
- `users`: id, name, face_encoding (BLOB), image_path, role
- `access_logs`: id, user_id, status, confidence, timestamp, snapshot_path, camera_id
- `cameras`: camera_id, department, last_heartbeat, is_online, registered_at

### Testing Requirements
- Run: `uvicorn app:app --host 0.0.0.0 --port 5001 --reload`
- Test: `curl -X POST http://localhost:5001/api/recognize -F "image=@test.jpg"`
- WebSocket: Connect to `ws://localhost:5001/ws/dashboard`

## Dependencies

### External
- `fastapi` + `uvicorn` — Web framework and ASGI server
- `face_recognition` — dlib-based face encoding (128-d vectors)
- `numpy` — Array operations for face distance computation
- `websockets` — WebSocket protocol support
- `python-dotenv` — Environment variable loading

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
