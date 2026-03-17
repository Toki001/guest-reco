# SecureSight Deployment Guide

## Architecture

```
School LAN (no internet required)
    |
    +-- Central Server (this machine)
    |     - Backend API on port 5001
    |     - Frontend on port 3000
    |     - SQLite database + local storage
    |
    +-- Camera Station A (tablet/laptop in Engineering)
    |     - Opens browser to http://<server-ip>:3000/camera/engineering
    |
    +-- Camera Station B (tablet/laptop in IT)
    |     - Opens browser to http://<server-ip>:3000/camera/it-department
    |
    +-- Admin Dashboard (any PC)
          - Opens browser to http://<server-ip>:3000/dashboard
```

## Central Server Setup

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone <repo-url> && cd guest-reco

# Start the full stack
docker compose up --build -d

# Verify it's running
curl http://localhost:5001/api/stats
```

### Option 2: Manual

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python app.py
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Camera Station Setup

Each department needs a device (tablet, laptop, or Raspberry Pi with a screen) with:
- A webcam (built-in or USB)
- A web browser (Chrome recommended)
- Network access to the central server

### Steps

1. Find the central server's IP address (e.g., `192.168.1.100`)
2. Open Chrome on the department device
3. Navigate to: `http://<server-ip>:3000/camera/<department-id>`

**URL format:** `/camera/<department-id>` where department-id is a URL-friendly name:
- Engineering: `http://192.168.1.100:3000/camera/engineering`
- IT Department: `http://192.168.1.100:3000/camera/it-department`
- Main Lobby: `http://192.168.1.100:3000/camera/main-lobby`

### Kiosk Mode (Recommended)

To prevent users from closing the camera app:

**Chrome:**
```bash
# Linux
google-chrome --kiosk http://192.168.1.100:3000/camera/engineering

# macOS
open -a "Google Chrome" --args --kiosk http://192.168.1.100:3000/camera/engineering
```

### Grant Camera Permissions

On first load, the browser will ask for camera access. Click "Allow" and check "Remember this decision."

## Admin Dashboard

Open `http://<server-ip>:3000/dashboard` on any device to see:
- Real-time recognition events via WebSocket
- Camera online/offline status per department
- Total scans, employee matches, guest alerts

## Registering Employees

1. Open `http://<server-ip>:3000/admin/add-employee`
2. Enter employee ID and name
3. Take a photo or upload an image
4. Click "Register Employee"

## Environment Variables

### Backend (.env.local)
| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 5001 | API server port |
| HOST | 0.0.0.0 | Server bind address |
| DB_PATH | recognition.db | SQLite database file path |
| AVATARS_DIR | avatars | Avatar image directory |
| SNAPSHOTS_DIR | snapshots | Snapshot image directory |
| FACE_DISTANCE_THRESHOLD | 0.6 | Face match strictness (lower = stricter) |

### Frontend
| Variable | Default | Description |
|----------|---------|-------------|
| VITE_API_URL | (derived from origin) | Backend API URL for camera stations |
