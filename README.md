# SecureSight

Offline face recognition system for Fr. Saturnino Urios University (FSUU) school security. Camera stations in different departments detect and identify employees/guests via a central server. No cloud dependencies — everything runs on your LAN.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11, FastAPI, uvicorn |
| Face Recognition | InsightFace (ArcFace + RetinaFace, `antelopev2` model) |
| Database | MySQL 8.0 |
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
│   ├── Frontend           :3000  (HTTP) / :3443 (HTTPS)
│   └── MediaMTX           :8889  (WebRTC WHIP/WHEP)
├── Camera Stations (browser on tablet/laptop)
│   └── https://<server-ip>:3443/camera/<department-id>
└── Admin Dashboard (any browser)
    └── https://<server-ip>:3443/dashboard
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

---

## Docker Deployment Guide (Recommended)

This is the easiest way to run SecureSight on any machine. Everything is containerized — no need to install Python, Node.js, or MediaMTX manually.

### Prerequisites

You only need **Docker Desktop** installed on your machine. Nothing else.

#### Installing Docker Desktop

**macOS:**

1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Open the downloaded `.dmg` file and drag Docker to Applications
3. Launch Docker Desktop from Applications
4. Wait for the Docker icon in the menu bar to show "Docker Desktop is running"

Or install via Homebrew:
```bash
brew install --cask docker
```
Then launch Docker Desktop from Applications.

**Windows:**

1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Run the installer (`Docker Desktop Installer.exe`)
3. **Important:** During installation, ensure "Use WSL 2 instead of Hyper-V" is checked (recommended)
4. If prompted, install the WSL 2 Linux kernel update from the link provided
5. Restart your computer when prompted
6. Launch Docker Desktop from the Start Menu
7. Wait for the Docker icon in the system tray to show "Docker Desktop is running"

If you see "WSL 2 installation is incomplete":
```powershell
# Open PowerShell as Administrator and run:
wsl --install
# Restart your computer, then launch Docker Desktop again
```

**Linux (Ubuntu/Debian):**

```bash
# Remove old versions
sudo apt remove docker docker-engine docker.io containerd runc

# Install prerequisites
sudo apt update
sudo apt install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Docker Compose
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow running Docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

**Linux (Fedora):**

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
newgrp docker
```

#### Verify Docker is installed

Run this on any platform to confirm Docker is ready:

```bash
docker --version
docker compose version
```

You should see version numbers for both. If `docker compose` fails, you may have an older version — install the Docker Compose plugin or upgrade Docker Desktop.

---

### Step 1: Clone the Repository

**macOS / Linux:**
```bash
git clone https://github.com/Toki001/guest-reco.git
cd guest-reco
```

**Windows (Command Prompt):**
```cmd
git clone https://github.com/Toki001/guest-reco.git
cd guest-reco
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/Toki001/guest-reco.git
cd guest-reco
```

> If you don't have `git`, download it from https://git-scm.com/downloads or download the repository as a ZIP from GitHub and extract it.

---

### Step 2: Configure Environment Variables (Required)

Create a `.env` file from the example:

**macOS / Linux:**
```bash
cp .env.example .env
```

**Windows (Command Prompt):**
```cmd
copy .env.example .env
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

Now open `.env` in any text editor and fill in the **required** values:

```env
# Database
DB_USER=securesight
DB_PASSWORD=your-strong-db-password

# Auth
ADMIN_PASSWORD=your-admin-password
JWT_SECRET=your-secret-at-least-32-bytes-long
CAMERA_API_KEY=your-camera-api-key

# MySQL root password (used by docker-compose only)
MYSQL_ROOT_PASSWORD=your-mysql-root-password
```

You can generate secure random values with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

> **Important:** The app will **not start** if any required variable is missing or if `JWT_SECRET` is shorter than 32 bytes. See `.env.example` for all available options.

---

### Step 3: Build and Start

This single command builds all services (MySQL, backend, frontend, MediaMTX) and starts them:

**All platforms:**
```bash
docker compose up --build -d
```

The first build takes **5-10 minutes** because it:
- Installs Python dependencies and compiles native packages
- Downloads the face recognition model (~350MB) from GitHub
- Builds the React frontend
- Generates an SSL certificate

Subsequent builds are much faster due to Docker layer caching.

> **Note:** You need an internet connection for the first build. After that, the system runs fully offline.

#### Verify everything is running

```bash
docker compose ps
```

You should see four containers with status `Up` or `Up (healthy)`:

```
NAME                   STATUS
securesight_mysql      Up (healthy)
securesight_api        Up (healthy)
securesight_web        Up
securesight_mediamtx   Up
```

If the backend shows `Up (health: starting)`, wait 30 seconds and check again — it takes a moment to load the face recognition model.

#### Check the logs

```bash
docker compose logs backend
```

Look for:
- `"Model already cached"` or model loaded successfully
- `CAMERA_API_KEY` value confirmation — **copy this, you'll need it for camera stations**
- `Uvicorn running on http://0.0.0.0:5001`

---

### Quick Start Scripts

Instead of running `docker compose up -d` directly, you can use the start scripts to launch the app and see your access URLs printed automatically:

**macOS / Linux:**
```bash
./start.sh
```

**Windows:**
```cmd
start.bat
```

These scripts start all containers and print the HTTP/HTTPS URLs with your machine's LAN IP, so you know exactly where to access SecureSight from other devices.

---

### Step 4: Access the Application

Once all containers are running:

| URL | What | When to use |
|-----|------|-------------|
| `https://localhost:3443` | Admin dashboard (HTTPS) | From the same machine |
| `http://localhost:3000` | Admin dashboard (HTTP) | From the same machine (no camera access) |
| `https://localhost:3443/login` | Login page | First visit |
| `https://localhost:3443/camera/department-name` | Camera station | Setting up a scanning station |

**Default login credentials:**

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | Whatever you set as `ADMIN_PASSWORD` in `.env` |

> **Browser SSL warning:** You will see a "Your connection is not private" warning because the SSL certificate is self-signed. This is expected and safe for LAN use.
>
> - **Chrome:** Click "Advanced" then "Proceed to localhost (unsafe)"
> - **Firefox:** Click "Advanced" then "Accept the Risk and Continue"
> - **Edge:** Click "Advanced" then "Continue to localhost (unsafe)"

> **Important:** Use `https://` (port 3443), not `http://` (port 3000), if you need camera/webcam access. Browsers block camera access on non-HTTPS origins (except localhost).

---

### Step 5: Access from Other Devices on Your Network

To open SecureSight from a phone, tablet, or another computer on the same Wi-Fi/LAN network, you need the server machine's local IP address.

#### Find your machine's local IP address

**macOS:**
```bash
ipconfig getifaddr en0
```

**Windows (Command Prompt or PowerShell):**
```cmd
ipconfig
```
Look for **"Wireless LAN adapter Wi-Fi"** (or "Ethernet adapter" if using a cable) and find the **IPv4 Address** line. It will look like `192.168.1.100` or `10.0.0.50`.

**Linux:**
```bash
hostname -I | awk '{print $1}'
```

#### Update CORS to allow your IP

Edit your `.env` file and add your IP to `CORS_ORIGINS`:

```env
CORS_ORIGINS=http://localhost:3000,https://localhost:3443,https://YOUR_IP_HERE:3443
```

For example, if your IP is `192.168.1.100`:
```env
CORS_ORIGINS=http://localhost:3000,https://localhost:3443,https://192.168.1.100:3443
```

Then restart the backend to apply:

```bash
docker compose restart backend
```

#### Access from the other device

On the other device's browser, go to:

```
https://192.168.1.100:3443
```

(Replace `192.168.1.100` with your actual IP)

You will see the SSL warning again on the other device — click through it the same way.

> **Camera stations** must use the HTTPS URL (`https://YOUR_IP:3443/camera/department-name`) for the webcam to work. HTTP will not allow camera access from non-localhost devices.

---

### Step 6: Windows Firewall Setup

If you're running SecureSight on Windows and other devices on your network can't connect, you need to allow the ports through Windows Firewall.

#### Add firewall rules (Admin PowerShell required)

```powershell
New-NetFirewallRule -DisplayName "SecureSight Web HTTP" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Any
New-NetFirewallRule -DisplayName "SecureSight Web HTTPS" -Direction Inbound -LocalPort 3443 -Protocol TCP -Action Allow -Profile Any
New-NetFirewallRule -DisplayName "SecureSight API" -Direction Inbound -LocalPort 5001 -Protocol TCP -Action Allow -Profile Any
New-NetFirewallRule -DisplayName "SecureSight WebRTC" -Direction Inbound -LocalPort 8889 -Protocol TCP -Action Allow -Profile Any
```

#### Verify rules are active

```powershell
Get-NetFirewallRule -DisplayName "SecureSight*" | Format-Table DisplayName, Enabled, Action
```

#### Remove rules (when no longer needed)

```powershell
Remove-NetFirewallRule -DisplayName "SecureSight Web HTTP"
Remove-NetFirewallRule -DisplayName "SecureSight Web HTTPS"
Remove-NetFirewallRule -DisplayName "SecureSight API"
Remove-NetFirewallRule -DisplayName "SecureSight WebRTC"
```

#### Check your network profile

If firewall rules are in place but other devices still can't connect, your network may be set to "Public" (which blocks most inbound traffic). Check with:

```powershell
Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory
```

If it shows `Public`, change it to `Private` (Admin PowerShell required):

```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

> **Note:** All commands that create, remove, or modify rules/profiles require an **Administrator PowerShell**. The `Get-` commands work without admin.

---

### Step 7: Set Up Camera Stations

Camera stations are tablets, laptops, or any device with a webcam that will be placed in each department for scanning.

#### Option A: Manual URL

1. On the camera device, open Chrome and go to:
   ```
   https://<server-ip>:3443/camera/<department-id>
   ```
   Examples:
   - `https://192.168.1.100:3443/camera/engineering`
   - `https://192.168.1.100:3443/camera/main-lobby`
   - `https://192.168.1.100:3443/camera/it-department`

2. Enter the **Camera API Key** when prompted (from backend logs or your `.env` file)

3. Allow camera access when the browser asks

4. Click the green **Play** button to start scanning

#### Option B: URL with Pre-configured Key

Include the API key in the URL so the camera connects automatically:

```
https://192.168.1.100:3443/camera/engineering?key=YOUR_CAMERA_API_KEY
```

#### Option C: QR Code (from Admin Dashboard)

1. Log into the admin dashboard
2. Go to the **Cameras** page
3. Click **"Add Camera"**
4. Enter the department name and API key
5. Scan the generated QR code from the camera device

#### Kiosk Mode (Prevent Users from Closing the App)

**Chrome on macOS:**
```bash
open -a "Google Chrome" --args --kiosk "https://192.168.1.100:3443/camera/engineering?key=YOUR_KEY"
```

**Chrome on Windows:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "https://192.168.1.100:3443/camera/engineering?key=YOUR_KEY"
```

**Chrome on Linux:**
```bash
google-chrome --kiosk "https://192.168.1.100:3443/camera/engineering?key=YOUR_KEY"
```

---

### Manual Model Download (If Auto-Download Fails)

The backend automatically downloads the **antelopev2** face recognition model (~350MB) on first startup. If the download times out or fails (e.g. slow internet, GitHub rate limits), you can download it manually.

**1. Download the model ZIP:**

Download from: `https://github.com/deepinsight/insightface/releases/download/v0.7/antelopev2.zip`

**2. Extract the ZIP.** It should contain these 4 `.onnx` files:

```
antelopev2/
├── 1k3d68.onnx
├── 2d106det.onnx
├── genderage.onnx
└── scrfd_10g_bnkps.onnx
```

**3. Copy into the Docker container's model volume:**

First, make sure the containers are running (`docker compose up -d`), then:

**macOS / Linux:**
```bash
docker exec securesight_api mkdir -p /root/.insightface/models/antelopev2
docker cp ./antelopev2/. securesight_api:/root/.insightface/models/antelopev2/
docker compose restart backend
```

**Windows (Command Prompt / PowerShell):**
```cmd
docker exec securesight_api mkdir -p /root/.insightface/models/antelopev2
docker cp antelopev2\. securesight_api:/root/.insightface/models/antelopev2/
docker compose restart backend
```

The model is stored in the `model-cache` Docker volume, so it persists across container restarts and rebuilds. You only need to do this once.

> **Verify the model loaded:** Run `docker compose logs backend` and look for `"Model already cached"`.

---

### Common Docker Commands

| Command | What it does |
|---------|--------------|
| `docker compose up --build -d` | Build and start all services in the background |
| `docker compose down` | Stop and remove all containers |
| `docker compose restart` | Restart all services |
| `docker compose restart backend` | Restart only the backend |
| `docker compose logs backend` | View backend logs |
| `docker compose logs -f` | Follow all logs in real-time (Ctrl+C to stop) |
| `docker compose ps` | Check status of all containers |
| `docker compose build --no-cache` | Rebuild everything from scratch |

---

### Stopping and Starting

**Stop all services (keeps data):**
```bash
docker compose down
```

**Start again (no rebuild needed):**
```bash
docker compose up -d
```

**Full reset (delete all data and rebuild):**
```bash
docker compose down -v
docker compose up --build -d
```

> **Warning:** `docker compose down -v` deletes all Docker volumes, including the MySQL database. All registered employees, visitors, and scan history will be permanently lost.

---

### Updating

When a new version is available:

```bash
git pull
docker compose up --build -d
```

Your data is safe — it's stored in Docker volumes that persist across rebuilds.

---

### Backup and Restore

#### Backup the database

**macOS / Linux:**
```bash
mkdir -p backup
docker exec securesight_mysql mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" securesight > ./backup/securesight-$(date +%Y%m%d).sql
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path backup
docker exec securesight_mysql mysqldump -u root -p"$env:MYSQL_ROOT_PASSWORD" securesight > ./backup/securesight-$(Get-Date -Format yyyyMMdd).sql
```

#### Backup avatar images

```bash
docker cp securesight_api:/app/avatars ./backup/avatars
```

#### Restore from backup

```bash
docker compose stop backend
docker exec -i securesight_mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" securesight < ./backup/securesight-YYYYMMDD.sql
docker cp ./backup/avatars/. securesight_api:/app/avatars/
docker compose start backend
```

---

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `docker compose` command not found | Install Docker Desktop (see Prerequisites). On older systems, try `docker-compose` (with hyphen). |
| Build fails downloading the model | Check your internet connection. The 350MB model downloads from GitHub during build. Retry with `docker compose build --no-cache backend`. |
| Backend container keeps restarting | Run `docker compose logs backend` to see the error. Usually a missing model file — rebuild with `docker compose build --no-cache backend`. |
| Camera shows "Stream Offline" | Make sure you clicked the green Play button. Check that the browser allowed camera access. Use HTTPS (port 3443), not HTTP. |
| Camera works on localhost but not from other devices | You need to add the server's LAN IP to `CORS_ORIGINS` in `.env` and restart. See Step 5. |
| "Invalid API key" on camera page | Copy the correct key from `docker compose logs backend` or your `.env` file. |
| Images/avatars not loading | Verify the frontend container is running: `docker compose ps`. Try `docker compose restart frontend`. |
| SSL certificate warning | Expected for self-signed certificates. Click "Advanced" > "Proceed" in your browser. This only needs to be done once per device. |
| WebRTC stream not connecting | Ensure MediaMTX is running: `docker compose ps`. Check that ports 8889 and 8189/udp are not blocked by a firewall. |
| Very slow first scan after restart | The face recognition model loads on the first request. This takes 10-30 seconds. Subsequent scans are fast. |
| "Too many requests" error | Rate limiter triggered. Wait 60 seconds and try again. |
| Port already in use | Another application is using port 3000, 3443, or 5001. Stop the other app, or change the port in `docker-compose.yml` under `ports`. |
| Docker build fails on Windows | Make sure Docker Desktop is running and WSL 2 is properly installed. Run `wsl --update` in PowerShell as Administrator. |
| `permission denied` on Linux | Run `sudo usermod -aG docker $USER` then log out and back in. |

---

## Development Setup (Manual, Without Docker)

Use this if you want to modify the code and see changes immediately without rebuilding containers.

### Prerequisites

| Requirement | Why |
|-------------|-----|
| Python 3.11+ | Backend runtime |
| Node.js 20+ | Frontend build/dev |
| MediaMTX binary | WebRTC video relay ([download here](https://github.com/bluenviron/mediamtx/releases)) |

**macOS:**
```bash
brew install python@3.11 node
```

**Windows:**
- Python: https://www.python.org/downloads/ (check "Add to PATH" during install)
- Node.js: https://nodejs.org/ (LTS version)

**Ubuntu/Debian:**
```bash
sudo apt install python3.11 python3.11-venv nodejs npm
```

### Running the three services

You need **3 terminal processes** running simultaneously:

#### 1. MediaMTX (WebRTC relay)

Download the [MediaMTX binary](https://github.com/bluenviron/mediamtx/releases) for your platform and place it in the project root.

```bash
./mediamtx mediamtx.yml
```

#### 2. Backend

**macOS / Linux:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt  # First time only
cp .env.example .env             # First time only (in project root)
python app.py
```

**Windows:**
```cmd
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Runs on `http://localhost:5001`. Prints the camera API key on startup.

#### 3. Frontend

```bash
cd frontend
npm install    # First time only
npm run dev
```

Runs on `https://localhost:3000` (self-signed SSL via `@vitejs/plugin-basic-ssl` — required for camera access in browsers).

---

## Credentials

| What | Where |
|------|-------|
| Admin username | `ADMIN_USERNAME` in `.env` (default: `admin`) |
| Admin password | `ADMIN_PASSWORD` in `.env` (required, no default) |
| Camera API key | `CAMERA_API_KEY` in `.env` (required, no default) |

All sensitive credentials must be set in the `.env` file. See `.env.example` for all options.

## Project Structure

```
guest-reco/
├── backend/
│   ├── app.py              # FastAPI setup, lifespan, WebSocket, static mounts
│   ├── auth.py             # JWT + API key authentication
│   ├── config.py           # Environment config loader
│   ├── database/           # Database package (6 modules)
│   │   ├── connection.py   # MySQL connection pool, schema init
│   │   ├── users.py        # User CRUD, multi-embedding management
│   │   ├── access_logs.py  # Logging, stats, attendance, search, auto-clock-out
│   │   ├── cameras.py      # Camera CRUD, heartbeat, per-camera data
│   │   ├── settings.py     # System settings (camera + face recognition thresholds)
│   │   └── export.py       # CSV export queries
│   ├── routes/             # FastAPI routers (12 modules)
│   ├── services/
│   │   ├── face_engine.py  # InsightFace model, embedding matching
│   │   ├── websocket.py    # ConnectionManager for broadcast
│   │   └── rate_limiter.py # In-memory rate limiting
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/
│   ├── src/
│   │   ├── pages/          # React page components
│   │   └── components/     # Reusable UI components
│   ├── public/
│   │   ├── mediapipe-wasm/ # Bundled MediaPipe face detection
│   │   └── models/         # ML model files
│   ├── nginx.conf          # Production reverse proxy config
│   ├── vite.config.ts      # Dev server + proxy config
│   ├── Dockerfile          # Multi-stage build (Node -> nginx + SSL)
│   └── .dockerignore
├── mediamtx.yml            # MediaMTX config (WebRTC ports, ICE servers)
├── docker-compose.yml      # Full stack: MySQL + backend + frontend + MediaMTX
├── .env.example            # Environment variable template
├── start.sh                # macOS/Linux start script (prints LAN URLs)
├── start.bat               # Windows start script (prints LAN URLs)
└── README.md
```

## Key URLs

| URL | What |
|-----|------|
| `https://localhost:3443/login` | Admin login |
| `https://localhost:3443/dashboard` | Live dashboard with charts |
| `https://localhost:3443/camera/<dept-id>` | Camera station (e.g. `/camera/engineering`) |
| `https://localhost:3443/employees` | Employee management |
| `https://localhost:3443/attendance` | Who's In / Who's Not In |
| `https://localhost:3443/visitors` | Visitor tracking |
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

### All settings (`.env` in project root)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `5001` | No | API server port |
| `HOST` | `0.0.0.0` | No | Server bind address |
| `DB_HOST` | `mysql` | No | MySQL host |
| `DB_PORT` | `3306` | No | MySQL port |
| `DB_USER` | — | **Yes** | MySQL username |
| `DB_PASSWORD` | — | **Yes** | MySQL password |
| `DB_NAME` | `securesight` | No | MySQL database name |
| `ADMIN_USERNAME` | `admin` | No | Admin login username |
| `ADMIN_PASSWORD` | — | **Yes** | Admin login password |
| `JWT_SECRET` | — | **Yes** | JWT signing key (min 32 bytes) |
| `JWT_EXPIRY_HOURS` | `24` | No | JWT token lifetime |
| `CAMERA_API_KEY` | — | **Yes** | API key for camera stations |
| `MYSQL_ROOT_PASSWORD` | — | **Yes** | MySQL root password (docker-compose only) |
| `CORS_ORIGINS` | `*` | No | Allowed CORS origins (comma-separated) |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | (derived from origin) | Backend API URL override |
