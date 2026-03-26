# SecureSight

Offline face recognition system for school security. Camera stations in different departments detect and identify employees/guests via a central server. No cloud dependencies — everything runs on your LAN.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11, FastAPI, uvicorn |
| Face Recognition | dlib via `face_recognition`, multi-embedding adaptive learning |
| Database | SQLite (WAL mode) |
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite |
| Face Detection (client) | MediaPipe WASM (bundled in `public/`) |
| Video Streaming | MediaMTX (WebRTC via WHIP/WHEP) |
| Real-time | WebSocket (backend to dashboard) |
| Auth | JWT + API key for cameras |

## Architecture

```
School LAN (no internet required)
├── Central Server
│   ├── Backend API        :5001  (FastAPI)
│   ├── Frontend           :3000  (Vite dev / built SPA)
│   └── MediaMTX           :8889  (WebRTC WHIP/WHEP)
├── Camera Stations (browser on tablet/laptop)
│   └── https://<server-ip>:3000/camera/<department-id>
└── Admin Dashboard (any browser)
    └── https://<server-ip>:3000/dashboard
```

Camera browsers detect faces client-side (MediaPipe), crop them, and POST to the backend. The backend matches against stored face encodings and broadcasts results to the dashboard via WebSocket. Live video streams from cameras to the dashboard use MediaMTX (WHIP publish, WHEP subscribe).

## Prerequisites

| Requirement | Why |
|-------------|-----|
| Python 3.11+ | Backend runtime |
| Node.js 20+ | Frontend build/dev |
| cmake + C++ compiler | Required to build dlib (`face_recognition` dependency) |
| MediaMTX binary | WebRTC video relay ([download here](https://github.com/bluenviron/mediamtx/releases)) |

**macOS:**
```bash
brew install cmake python@3.11 node
```

**Ubuntu/Debian:**
```bash
sudo apt install cmake build-essential python3.11 python3.11-venv nodejs npm
```

## Quick Start (Docker)

```bash
git clone https://github.com/Toki001/guest-reco.git && cd guest-reco
docker compose up --build -d
```

Backend: `http://localhost:5001` | Frontend: `http://localhost:3000`

> Note: Docker setup does not include MediaMTX. Live video streaming requires the manual dev setup below.

## Development Setup (Manual)

You need **3 terminal processes** running simultaneously:

### 1. MediaMTX (WebRTC relay)

Download the [MediaMTX binary](https://github.com/bluenviron/mediamtx/releases) for your platform and place it in the project root.

```bash
./mediamtx mediamtx.yml
```

Runs on port 8889 (HTTP) and 8189 (ICE/UDP). The Vite dev server proxies `/whip` and `/whep` paths to it.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt  # First time only (dlib compile takes a few minutes)
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
│   ├── app.py              # FastAPI server (all API routes + WebSocket)
│   ├── config.py           # Environment config loader
│   ├── database.py         # SQLite database layer
│   ├── face_engine.py      # Face encoding, matching, multi-embedding search
│   ├── auth.py             # JWT + API key authentication
│   ├── services/           # Utility scripts for batch operations
│   ├── avatars/            # Stored face images (auto-created)
│   ├── snapshots/          # Recognition snapshots (auto-created)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── CameraStationPage.tsx   # Camera capture + face detection
│   │   │   ├── CameraGridPage.tsx      # Live camera grid (WHEP viewer)
│   │   │   ├── EmployeesPage.tsx       # Employee management
│   │   │   ├── AttendancePage.tsx       # Attendance log
│   │   │   ├── VisitorsPage.tsx        # Visitor tracking
│   │   │   └── LoginPage.tsx           # Admin login
│   │   └── components/
│   │       └── CameraFeed.tsx          # WHIP publish component
│   ├── public/
│   │   ├── mediapipe-wasm/    # Bundled MediaPipe face detection
│   │   └── models/            # ML model files
│   ├── vite.config.ts         # Dev server + proxy config (API, WS, MediaMTX)
│   ├── Dockerfile
│   └── package.json
├── mediamtx.yml           # MediaMTX config (WebRTC ports, ICE servers)
├── docker-compose.yml     # Full stack container orchestration
├── DEPLOYMENT.md          # Detailed deployment guide (kiosk mode, camera setup)
└── .gitignore
```

## Key URLs (Development)

| URL | What |
|-----|------|
| `https://localhost:3000/login` | Admin login |
| `https://localhost:3000/dashboard` | Live dashboard with camera grid |
| `https://localhost:3000/camera/<dept-id>` | Camera station (e.g. `/camera/engineering`) |
| `https://localhost:3000/employees` | Employee management |
| `https://localhost:3000/attendance` | Attendance logs |
| `https://localhost:3000/visitors` | Visitor tracking |
| `http://localhost:5001/docs` | FastAPI auto-generated API docs |

## API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | None | Get JWT token |
| POST | `/api/recognize` | API key / JWT | Recognize a single face |
| POST | `/api/recognize-batch` | API key / JWT | Recognize multiple face crops |
| POST | `/api/employees/add` | JWT | Register new employee |
| GET | `/api/employees` | JWT | List employees |
| GET | `/api/cameras` | JWT | List registered cameras |
| GET | `/api/attendance` | JWT | Attendance log (paginated) |
| GET | `/api/stats` | JWT | Dashboard statistics |
| WS | `/ws/dashboard` | Token query param | Real-time event stream |

Full API docs available at `http://localhost:5001/docs` when the backend is running.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup instructions including:
- Camera station kiosk mode configuration
- Network architecture for school LAN
- Environment variable reference
- Employee registration workflow
