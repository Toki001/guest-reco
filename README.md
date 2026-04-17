# SecureSight

Offline face recognition system for Fr. Saturnino Urios University (FSUU) school security. Camera stations in different departments detect and identify employees/guests via a central server. No cloud dependencies — everything runs on your LAN.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11, FastAPI, uvicorn |
| Face Recognition | InsightFace (ArcFace + RetinaFace, `antelopev2` model) |
| Database | SQLite (WAL mode) |
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 6 |
| Face Detection (client) | MediaPipe WASM (bundled in `public/`) |
| Video Streaming | MediaMTX (WebRTC via WHIP/WHEP) |
| Charts | Recharts |
| Real-time | WebSocket (backend to dashboard) |
| Auth | JWT + API key for cameras |

## Architecture

```
School LAN (no internet required)
├── Central Server
│   ├── Backend API        :5001  (FastAPI)
│   ├── Frontend           :3000  (Vite dev / nginx production)
│   └── MediaMTX           :8889  (WebRTC WHIP/WHEP)
├── Camera Stations (browser on tablet/laptop)
│   └── https://<server-ip>:3000/camera/<department-id>
└── Admin Dashboard (any browser)
    └── https://<server-ip>:3000/dashboard
```

Camera browsers detect faces client-side (MediaPipe), crop them, and POST to the backend. The backend matches against stored ArcFace embeddings using multi-embedding adaptive learning (up to 5 embeddings per person) and broadcasts results to the dashboard via WebSocket. Live video streams from cameras to the dashboard use MediaMTX (WHIP publish, WHEP subscribe).

## Features

- **Real-time face recognition** with configurable confidence thresholds
- **Multi-embedding adaptive learning** — stores up to 5 face variants per person for better accuracy across lighting/angle changes
- **Auto clock-out** — users are automatically clocked out at midnight if they didn't scan out
- **Live camera grid** with WebRTC streaming (WHIP/WHEP via MediaMTX)
- **Glassmorphism UI** with light/dark mode throughout
- **Dashboard analytics** — hourly activity charts, time range filters (Today/7d/30d/All)
- **Global search** (Cmd+K) across employees, visitors, and cameras
- **QR code camera setup** — generate QR codes to configure camera stations
- **CSV export** for attendance and visitor data
- **Batch employee registration** — upload multiple faces at once
- **Per-camera face data** — see who was detected at each camera
- **Attendance tracking** — Who's In / Who's Not In with role filters

## Prerequisites

| Requirement | Why |
|-------------|-----|
| Python 3.11+ | Backend runtime |
| Node.js 20+ | Frontend build/dev |
| MediaMTX binary | WebRTC video relay ([download here](https://github.com/bluenviron/mediamtx/releases)) |

**macOS:**
```bash
brew install python@3.11 node
```

**Ubuntu/Debian:**
```bash
sudo apt install python3.11 python3.11-venv nodejs npm
```

> Note: InsightFace uses ONNX Runtime (CPU) — no cmake, dlib, or C++ compiler needed.

## Quick Start (Docker)

```bash
git clone https://github.com/Toki001/guest-reco.git && cd guest-reco
docker compose up --build -d
```

All three services start automatically:
- Backend: `http://localhost:5001`
- Frontend: `http://localhost:3000`
- MediaMTX: `http://localhost:8889`

## Development Setup (Manual)

You need **3 terminal processes** running simultaneously:

### 1. MediaMTX (WebRTC relay)

Download the [MediaMTX binary](https://github.com/bluenviron/mediamtx/releases) for your platform and place it in the project root.

```bash
./mediamtx mediamtx.yml
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt  # First time only
cp .env.example .env.local       # First time only
python app.py
```

Runs on `http://localhost:5001`. Prints the camera API key on startup.

### 3. Frontend

```bash
cd frontend
npm install    # First time only
npm run dev
```

Runs on `https://localhost:3000` (self-signed SSL via `@vitejs/plugin-basic-ssl` — required for camera access in browsers).

## Default Credentials

| What | Value |
|------|-------|
| Admin username | `admin` |
| Admin password | `securesight2026` |
| Camera API key | Auto-generated, printed in backend console on startup |

Change these via `backend/.env.local`. See `backend/.env.example` for all options.

## Project Structure

```
guest-reco/
├── backend/
│   ├── app.py              # FastAPI setup, lifespan, WebSocket, static mounts (~90 lines)
│   ├── auth.py             # JWT + API key authentication
│   ├── config.py           # Environment config loader
│   ├── database/           # Database package (6 modules)
│   │   ├── connection.py   # Thread-local SQLite, schema init
│   │   ├── users.py        # User CRUD, multi-embedding management
│   │   ├── access_logs.py  # Logging, stats, attendance, search, auto-clock-out
│   │   ├── cameras.py      # Camera CRUD, heartbeat, per-camera data
│   │   ├── settings.py     # System settings (camera + face recognition thresholds)
│   │   └── export.py       # CSV export queries
│   ├── routes/             # FastAPI routers (12 modules)
│   │   ├── auth.py         # Login, auth check
│   │   ├── recognition.py  # Face recognition (single + batch)
│   │   ├── employees.py    # Employee CRUD, reface, attendance
│   │   ├── cameras.py      # Camera register, heartbeat, delete
│   │   ├── attendance.py   # Active/inactive users, attendance log
│   │   ├── visitors.py     # Visitor listing
│   │   ├── stats.py        # Dashboard stats, hourly, time range
│   │   ├── search.py       # Global search
│   │   ├── settings.py     # Settings get/update
│   │   ├── streaming.py    # MJPEG relay (legacy)
│   │   ├── export.py       # CSV download endpoints
│   │   └── health.py       # Health check
│   ├── services/
│   │   ├── face_engine.py  # InsightFace model, embedding matching
│   │   ├── websocket.py    # ConnectionManager for broadcast
│   │   └── rate_limiter.py # In-memory rate limiting
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── CameraStationPage.tsx   # Camera capture + face detection
│   │   │   ├── CameraGridPage.tsx      # Live camera grid (WHEP viewer)
│   │   │   ├── EmployeesPage.tsx       # Employee management
│   │   │   ├── AttendancePage.tsx       # Who's In / Who's Not In
│   │   │   ├── VisitorsPage.tsx        # Visitor tracking + delete
│   │   │   ├── LoginPage.tsx           # Admin login (light/dark)
│   │   │   └── MainApp.tsx             # Layout, routing, command palette
│   │   └── components/
│   │       ├── DashboardTab.tsx        # Dashboard with charts + real-time feed
│   │       ├── Sidebar.tsx             # Collapsible glass sidebar
│   │       ├── Header.tsx              # Glass header with search + clock
│   │       ├── CameraFeed.tsx          # WHIP publish + face detection
│   │       ├── CommandPalette.tsx       # Global search (Cmd+K)
│   │       ├── AddEmployeeModal.tsx    # Single + batch registration
│   │       ├── SettingsModal.tsx       # Camera + face recognition settings
│   │       ├── HoverCard.tsx           # Detail popover on hover
│   │       ├── GlassSkeleton.tsx       # Skeleton loading components
│   │       ├── EmptyState.tsx          # Animated empty state illustrations
│   │       └── RecognitionBanner.tsx   # Clock in/out notification banners
│   ├── public/
│   │   ├── fsuu-logo.png              # University logo
│   │   ├── mediapipe-wasm/            # Bundled MediaPipe face detection
│   │   └── models/                    # ML model files
│   ├── nginx.conf                     # Production reverse proxy config
│   ├── vite.config.ts                 # Dev server + proxy config
│   ├── Dockerfile                     # Multi-stage build (Node -> nginx)
│   └── package.json
├── mediamtx.yml           # MediaMTX config (WebRTC ports, ICE servers)
├── docker-compose.yml     # Full stack: backend + frontend + MediaMTX
└── CLAUDE.md              # AI assistant context file
```

## Key URLs (Development)

| URL | What |
|-----|------|
| `https://localhost:3000/login` | Admin login |
| `https://localhost:3000/dashboard` | Live dashboard with charts |
| `https://localhost:3000/camera/<dept-id>` | Camera station (e.g. `/camera/engineering`) |
| `https://localhost:3000/employees` | Employee management |
| `https://localhost:3000/attendance` | Who's In / Who's Not In |
| `https://localhost:3000/visitors` | Visitor tracking |
| `http://localhost:5001/docs` | FastAPI auto-generated API docs |

## API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | None | Get JWT token |
| GET | `/api/auth/me` | JWT | Verify token |
| POST | `/api/recognize` | API key / JWT | Recognize a single face |
| POST | `/api/recognize-batch` | API key / JWT | Recognize multiple face crops |
| POST | `/api/employees/add` | JWT | Register new employee |
| GET | `/api/employees` | JWT | List employees with stats |
| PUT | `/api/employees/:id` | JWT | Update employee |
| DELETE | `/api/employees/:id` | JWT | Delete employee |
| POST | `/api/employees/:id/reface` | JWT | Re-capture face |
| GET | `/api/cameras` | JWT | List registered cameras |
| POST | `/api/camera/register` | API key / JWT | Register camera |
| POST | `/api/camera/heartbeat` | API key / JWT | Camera heartbeat |
| GET | `/api/attendance/active` | JWT | Currently on-site users |
| GET | `/api/attendance/inactive` | JWT | Users not on site |
| GET | `/api/attendance` | JWT | Attendance log (paginated) |
| GET | `/api/visitors` | JWT | Visitor list (paginated) |
| GET | `/api/stats` | JWT | Dashboard statistics |
| GET | `/api/stats/today` | JWT | Today's stats |
| GET | `/api/stats/hourly` | JWT | Hourly activity data |
| GET | `/api/stats/range` | JWT | Stats for date range |
| GET | `/api/search` | JWT | Global search |
| GET | `/api/settings` | API key / JWT | Get system settings |
| PUT | `/api/settings` | JWT | Update system settings |
| GET | `/api/export/attendance` | JWT | CSV export |
| GET | `/api/export/visitors` | JWT | CSV export |
| GET | `/health` | None | Health check |
| WS | `/ws/dashboard` | Token query param | Real-time event stream |

Full interactive API docs available at `http://localhost:5001/docs` when the backend is running.

## Environment Variables

### Backend (`backend/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | API server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `DB_PATH` | `recognition.db` | SQLite database file path |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | `securesight2026` | Admin login password |
| `JWT_SECRET` | (auto-generated) | JWT signing key (set for production) |
| `JWT_EXPIRY_HOURS` | `24` | JWT token lifetime |
| `CAMERA_API_KEY` | (auto-generated) | API key for camera stations |
| `CORS_ORIGINS` | `https://localhost:3000` | Allowed CORS origins |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | (derived from origin) | Backend API URL override |
