# SecureSight Deployment Guide

For full setup instructions including Docker installation for macOS, Windows, and Linux, see the main [README.md](README.md).

This document covers production deployment details and operational procedures.

## Architecture

```
School LAN (no internet required)
    |
    +-- Central Server (this machine)
    |     - Backend API on port 5001
    |     - Frontend on port 3000 (HTTP) / 3443 (HTTPS)
    |     - MediaMTX on port 8889 (WebRTC relay)
    |     - SQLite database + local avatar/snapshot storage
    |
    +-- Camera Station A (tablet/laptop in Engineering)
    |     - Opens browser to https://<server-ip>:3443/camera/engineering
    |
    +-- Camera Station B (tablet/laptop in IT)
    |     - Opens browser to https://<server-ip>:3443/camera/it-department
    |
    +-- Admin Dashboard (any PC)
          - Opens browser to https://<server-ip>:3443/dashboard
```

## Quick Start (Docker)

```bash
git clone https://github.com/Toki001/guest-reco.git && cd guest-reco

# Optional: configure credentials
cp .env.example .env
# Edit .env to set JWT_SECRET, CAMERA_API_KEY, ADMIN_PASSWORD

docker compose up --build -d
```

This starts all three services:
- **Backend** at `http://localhost:5001`
- **Frontend** at `http://localhost:3000` (HTTP) and `https://localhost:3443` (HTTPS)
- **MediaMTX** at `http://localhost:8889`

Check logs: `docker compose logs -f`

## Network Access (LAN)

To access from other devices (phones, tablets, other PCs) on the same network:

1. Find the server's LAN IP:
   - **macOS:** `ipconfig getifaddr en0`
   - **Windows:** `ipconfig` (look for IPv4 Address under Wi-Fi)
   - **Linux:** `hostname -I | awk '{print $1}'`

2. Add the IP to CORS in your `.env` file:
   ```env
   CORS_ORIGINS=http://localhost:3000,https://localhost:3443,https://192.168.1.100:3443
   ```

3. Restart: `docker compose restart backend`

4. Access from other devices: `https://192.168.1.100:3443`

> Camera stations **must** use HTTPS (port 3443) for webcam access to work.

## Camera Station Setup

Each department needs a device with a webcam and a web browser (Chrome recommended).

### Option A: QR Code (Recommended)

1. Log into the admin dashboard
2. Go to **Cameras** page
3. Click **"Add Camera"**
4. Enter the department name and the API key (from backend console)
5. Scan the generated QR code from the camera device

### Option B: Manual URL

Navigate to: `https://<server-ip>:3443/camera/<department-id>`

URL format — use lowercase, hyphenated names:
- Engineering: `/camera/engineering`
- IT Department: `/camera/it-department`
- Main Lobby: `/camera/main-lobby`

On first visit, enter the camera API key when prompted.

### Option C: URL with Key

Pre-configure by including the key in the URL:
```
https://<server-ip>:3443/camera/engineering?key=YOUR_API_KEY
```

### Kiosk Mode

To prevent users from closing the camera app:

**Chrome (macOS):**
```bash
open -a "Google Chrome" --args --kiosk "https://<server-ip>:3443/camera/engineering?key=YOUR_KEY"
```

**Chrome (Windows):**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "https://<server-ip>:3443/camera/engineering?key=YOUR_KEY"
```

**Chrome (Linux):**
```bash
google-chrome --kiosk "https://<server-ip>:3443/camera/engineering?key=YOUR_KEY"
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
- **Match threshold** (0.2-0.7) — lower = stricter matching
- **Confidence floor** (20-95%) — minimum confidence to accept a match
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

## Ports Reference

| Port | Protocol | Service | Required |
|------|----------|---------|----------|
| 3000 | TCP | Frontend (HTTP) | Yes |
| 3443 | TCP | Frontend (HTTPS) | Yes (for camera access) |
| 5001 | TCP | Backend API | Yes |
| 8889 | TCP | MediaMTX WebRTC | Yes (for live camera grid) |
| 8189 | UDP | MediaMTX ICE | Yes (for WebRTC) |
| 9997 | TCP | MediaMTX API | Optional |

Ensure these ports are not blocked by your firewall. On Windows, Docker Desktop usually handles firewall rules automatically.

## Backup

The SQLite database and avatar images are stored in Docker volumes.

### Backup

```bash
mkdir -p backup
docker cp securesight_api:/app/data/recognition.db ./backup/recognition.db
docker cp securesight_api:/app/avatars ./backup/avatars
```

### Restore

```bash
docker compose stop backend
docker cp ./backup/recognition.db securesight_api:/app/data/recognition.db
docker cp ./backup/avatars/. securesight_api:/app/avatars/
docker compose start backend
```

## Environment Variables

### Docker (`.env` in project root)

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | (auto-generated) | Set for token persistence across restarts |
| `ADMIN_PASSWORD` | `securesight2026` | Override in production |
| `CAMERA_API_KEY` | (auto-generated) | Set for predictable camera config |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Add LAN IPs for network access |

### Backend (`.env` in project root)

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

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Camera shows blank / "Stream Offline" | Use HTTPS (port 3443), not HTTP. Accept the SSL certificate warning. Click the Play button. |
| Camera works locally but not from other devices | Add server LAN IP to `CORS_ORIGINS` in `.env` and restart backend |
| "Invalid API key" on camera | Copy the key from `docker compose logs backend` or your `.env` file |
| WebRTC stream not connecting | Ensure MediaMTX is running and ports 8889/8189 are accessible |
| Face not detected | Ensure adequate lighting and face is within camera frame |
| "Too many requests" | Rate limiter triggered — wait 60 seconds |
| SSL certificate warning | Expected for self-signed certs — click through once per device |
| Build fails downloading model | Check internet. Retry: `docker compose build --no-cache backend` |
| Docker build fails on Windows | Ensure WSL 2 is installed: `wsl --update` in admin PowerShell |
