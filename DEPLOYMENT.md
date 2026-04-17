# SecureSight Deployment Guide

## Architecture

```
School LAN (no internet required)
    |
    +-- Central Server (this machine)
    |     - Backend API on port 5001
    |     - Frontend on port 3000 (nginx in production)
    |     - MediaMTX on port 8889 (WebRTC relay)
    |     - SQLite database + local avatar/snapshot storage
    |
    +-- Camera Station A (tablet/laptop in Engineering)
    |     - Opens browser to https://<server-ip>:3000/camera/engineering
    |
    +-- Camera Station B (tablet/laptop in IT)
    |     - Opens browser to https://<server-ip>:3000/camera/it-department
    |
    +-- Admin Dashboard (any PC)
          - Opens browser to https://<server-ip>:3000/dashboard
```

## Quick Start (Docker)

```bash
git clone https://github.com/Toki001/guest-reco.git && cd guest-reco

# Optional: set secure credentials
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PASSWORD=your_secure_password

docker compose up --build -d
```

This starts all three services:
- **Backend** at `http://localhost:5001`
- **Frontend** (nginx) at `http://localhost:3000`
- **MediaMTX** at `http://localhost:8889`

Check logs: `docker compose logs -f`

## Manual Setup (Development)

### 1. MediaMTX

Download from [github.com/bluenviron/mediamtx/releases](https://github.com/bluenviron/mediamtx/releases) and place in the project root.

```bash
./mediamtx mediamtx.yml
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env.local       # Edit credentials
python app.py
```

The camera API key is printed on startup — copy it for camera station setup.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

HTTPS is required for camera access. The Vite dev server uses a self-signed certificate — accept the browser warning on first visit.

## Camera Station Setup

Each department needs a device with a webcam and a web browser (Chrome recommended).

### Option A: QR Code (Recommended)

1. Log into the admin dashboard
2. Go to **Cameras** page
3. Click **"Add Camera"**
4. Enter the department name and the API key (from backend console)
5. Scan the generated QR code from the camera device

### Option B: Manual URL

Navigate to: `https://<server-ip>:3000/camera/<department-id>`

URL format — use lowercase, hyphenated names:
- Engineering: `/camera/engineering`
- IT Department: `/camera/it-department`
- Main Lobby: `/camera/main-lobby`

On first visit, enter the camera API key when prompted.

### Option C: URL with Key

Pre-configure by including the key in the URL:
```
https://<server-ip>:3000/camera/engineering?key=YOUR_API_KEY
```

### Kiosk Mode

To prevent users from closing the camera app:

**Chrome (Linux):**
```bash
google-chrome --kiosk https://<server-ip>:3000/camera/engineering?key=YOUR_KEY
```

**Chrome (macOS):**
```bash
open -a "Google Chrome" --args --kiosk https://<server-ip>:3000/camera/engineering?key=YOUR_KEY
```

### Camera Permissions

On first load, the browser asks for camera access. Click "Allow" and check "Remember this decision."

## Registering Employees

### Single Registration

1. Go to **Employees** page
2. Click **"Add Employee"**
3. Fill in Employee ID, name, and role
4. Take a photo with webcam or upload an image
5. Click **"Register Employee"**

### Batch Registration

1. Go to **Employees** > **Add Employee** > **Batch Upload** tab
2. Select multiple face photos
3. Edit the auto-generated IDs and names for each entry
4. Click **"Register All"**

## System Settings

Go to **Settings** (gear icon in sidebar) to configure:

### Camera Detection
- Movement threshold, countdown timers, scan cooldown, face size thresholds

### Face Recognition
- **Match threshold** (0.2–0.7) — lower = stricter matching
- **Confidence floor** (20–95%) — minimum confidence to accept a match
- **Uncertain zone** — distance range where context signals are used
- **Embedding diversity** — how different a face must look to store a new variant

## Auto Clock-Out

Users who forget to clock out are automatically clocked out at midnight. This runs:
- On every attendance page load (catches stale entries immediately)
- As a background task at midnight (safety net)

Records show `camera_id: system-auto` for automatic clock-outs.

## Data Export

- **Attendance CSV**: Attendance page > Export button
- **Visitors CSV**: Visitors page > Export button

Both support date range filtering via URL parameters.

## Environment Variables

### Backend (`backend/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | API server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `DB_PATH` | `recognition.db` | SQLite database path |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | `securesight2026` | Admin login password |
| `JWT_SECRET` | (auto-generated) | JWT signing secret (set for production!) |
| `JWT_EXPIRY_HOURS` | `24` | Token lifetime in hours |
| `CAMERA_API_KEY` | (auto-generated) | API key for camera auth |
| `CORS_ORIGINS` | `https://localhost:3000` | Comma-separated allowed origins |

### Docker (`docker-compose.yml` environment)

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | (auto-generated) | Set via env for persistence across restarts |
| `ADMIN_PASSWORD` | `securesight2026` | Override in production |
| `CAMERA_API_KEY` | (auto-generated) | Set for predictable camera config |

## Backup

The SQLite database at `backend/recognition.db` (or Docker volume `recognition-data`) contains all face data and logs. Back it up regularly:

```bash
# Manual
cp backend/recognition.db backup/recognition-$(date +%Y%m%d).db

# Docker
docker cp securesight_api:/app/data/recognition.db ./backup/
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Camera shows blank | Accept the self-signed SSL certificate in the browser |
| "Invalid API key" on camera | Copy the key from backend startup logs |
| WebRTC stream not connecting | Ensure MediaMTX is running and ports 8889/8189 are accessible |
| Employee list empty after restructure | The trailing-slash redirect was fixed — clear browser cache |
| Face not detected | Ensure adequate lighting and face is within camera frame |
| "Too many requests" | Rate limiter triggered — wait 60 seconds |
