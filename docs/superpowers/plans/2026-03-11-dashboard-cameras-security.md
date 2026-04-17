# Dashboard Fix, Live Camera Grid, Admin Auth — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix dashboard analytics showing 0s, add live MJPEG camera grid page, and add admin login + camera API key auth.

**Architecture:** Three independent improvements layered onto the existing FastAPI + React stack. Auth is implemented first since the camera grid and dashboard both need it. The streaming system uses two new WebSocket endpoints (`/ws/camera-stream` for ingestion, `/ws/camera-view` for viewing) with an in-memory frame buffer on the server.

**Tech Stack:** FastAPI, PyJWT, SQLite, React, React Router, WebSocket, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-11-dashboard-cameras-security-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `backend/auth.py` | JWT creation/validation, password check, FastAPI dependencies (`require_admin`, `require_camera_or_admin`) |
| `backend/streaming.py` | In-memory frame buffer, camera-stream/camera-view WebSocket managers |
| `frontend/src/auth.ts` | `getToken()`, `setToken()`, `clearToken()`, `isAuthenticated()`, `authFetch()`, `getAuthWsUrl()` |
| `frontend/src/pages/LoginPage.tsx` | Dark centered card login form |
| `frontend/src/pages/CameraGridPage.tsx` | Auto-fit grid of live camera streams with fullscreen overlay |

### Modified Files
| File | Changes |
|------|---------|
| `backend/app.py` | Broadcast stats on camera register/offline; import auth deps and protect endpoints; mount streaming WebSocket endpoints |
| `backend/config.py` | Add `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CAMERA_API_KEY`, `JWT_SECRET` |
| `backend/requirements.txt` | Add `PyJWT` |
| `frontend/src/App.tsx` | Add `/login` route, wrap admin routes with auth guard |
| `frontend/src/pages/MainApp.tsx` | Add `/cameras` route to `CameraGridPage` |
| `frontend/src/pages/CameraStationPage.tsx` | Read API key from `?key=` query param, pass to CameraFeed and fetch headers |
| `frontend/src/components/CameraFeed.tsx` | Accept `apiKey` prop, add `X-API-Key` header to fetch calls, stream frames via WebSocket |
| `frontend/src/components/DashboardTab.tsx` | Use `authFetch` and `getAuthWsUrl` |
| `frontend/src/components/AddEmployeeTab.tsx` | Use `authFetch` instead of raw `fetch` |
| `frontend/src/components/Sidebar.tsx` | Add "Cameras" nav link, wire logout button |

---

## Chunk 1: Dashboard Analytics Fix + Auth Backend

### Task 1: Fix dashboard stats broadcasts

**Files:**
- Modify: `backend/app.py:220-234` (camera register/heartbeat endpoints)
- Modify: `backend/app.py:86-100` (camera_timeout_checker)

- [ ] **Step 1: Add stats broadcast after camera registration**

In `backend/app.py`, update `register_camera_endpoint` to broadcast `stats_update` after camera registration:

```python
@app.post('/api/camera/register')
async def register_camera_endpoint(camera_id: str = Form(...), department: str = Form(...)):
    await asyncio.to_thread(register_camera, camera_id, department)
    await manager.broadcast({
        "event": "camera_online",
        "data": {"camera_id": camera_id, "department": department,
                 "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    })
    await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
    return {"status": "registered", "camera_id": camera_id}
```

Also wrap `update_camera_heartbeat` in `asyncio.to_thread`:

```python
@app.post('/api/camera/heartbeat')
async def camera_heartbeat_endpoint(camera_id: str = Form(...)):
    await asyncio.to_thread(update_camera_heartbeat, camera_id)
    return {"status": "ok"}
```

- [ ] **Step 2: Add stats broadcast after camera timeout**

In `camera_timeout_checker`, add stats broadcast after marking cameras offline:

```python
async def camera_timeout_checker():
    while True:
        await asyncio.sleep(15)
        try:
            timed_out = await asyncio.to_thread(get_offline_cameras, timeout_seconds=30)
            for cam in timed_out:
                await asyncio.to_thread(mark_camera_offline, cam["camera_id"])
                await manager.broadcast({
                    "event": "camera_offline",
                    "data": {"camera_id": cam["camera_id"], "department": cam["department"],
                             "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
                })
            if timed_out:
                await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
        except Exception as e:
            print(f"Camera timeout checker error: {e}")
```

- [ ] **Step 3: Wrap remaining sync get_stats calls**

Lines 144 and 173 in `app.py` call `get_stats()` synchronously in the broadcast. Wrap them:

```python
# Line 144 (guest auto-register path):
await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

# Line 173 (match found path):
await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})
```

- [ ] **Step 4: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/backend && source .venv/bin/activate && python -c "import ast; ast.parse(open('app.py').read()); print('OK')"`

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app.py
git commit -m "fix: broadcast stats_update on camera register/offline events"
```

---

### Task 2: Create auth module

**Files:**
- Create: `backend/auth.py`
- Modify: `backend/config.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add auth config vars**

Add to `backend/config.py`:

```python
    # Auth
    ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'securesight2026')
    CAMERA_API_KEY = os.getenv('CAMERA_API_KEY', '')  # Auto-generated if empty
    JWT_SECRET = os.getenv('JWT_SECRET', '')  # Auto-generated if empty
    JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', '24'))
```

- [ ] **Step 2: Add PyJWT to requirements**

Add `PyJWT` to `backend/requirements.txt`.

- [ ] **Step 3: Install PyJWT**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/backend && source .venv/bin/activate && uv pip install PyJWT`

- [ ] **Step 4: Create backend/auth.py**

```python
import hashlib
import uuid
import datetime
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Header, WebSocket, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import Config

# --- Auto-generate secrets if not set ---
_jwt_secret = Config.JWT_SECRET or uuid.uuid4().hex
_camera_api_key = Config.CAMERA_API_KEY or uuid.uuid4().hex

def get_camera_api_key() -> str:
    return _camera_api_key

def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

_admin_password_hash = _hash_password(Config.ADMIN_PASSWORD)

# --- JWT ---
def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=Config.JWT_EXPIRY_HOURS),
        "iat": datetime.datetime.now(datetime.timezone.utc),
    }
    return jwt.encode(payload, _jwt_secret, algorithm="HS256")

def verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None

def check_login(username: str, password: str) -> str | None:
    if username == Config.ADMIN_USERNAME and _hash_password(password) == _admin_password_hash:
        return create_token(username)
    return None

# --- FastAPI Dependencies ---
_bearer = HTTPBearer(auto_error=False)

async def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = verify_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

async def require_camera_or_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    # Check Bearer token first
    if credentials and verify_token(credentials.credentials):
        return {"auth": "admin"}
    # Check X-API-Key header
    if x_api_key and x_api_key == _camera_api_key:
        return {"auth": "camera"}
    raise HTTPException(status_code=401, detail="Authentication required")

# --- WebSocket Auth ---
def verify_ws_auth(token: str | None = None, key: str | None = None) -> bool:
    if token and verify_token(token):
        return True
    if key and key == _camera_api_key:
        return True
    return False
```

- [ ] **Step 5: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/backend && source .venv/bin/activate && python -c "import ast; ast.parse(open('auth.py').read()); print('OK')"`

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/auth.py backend/config.py backend/requirements.txt
git commit -m "feat: add JWT auth module with admin login and camera API key"
```

---

### Task 3: Protect API endpoints + add login endpoint

**Files:**
- Modify: `backend/app.py`

- [ ] **Step 1: Add auth imports**

At top of `backend/app.py`, add:

```python
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, Depends, Header, Query
from auth import (
    check_login, require_admin, require_camera_or_admin,
    verify_ws_auth, get_camera_api_key
)
```

- [ ] **Step 2: Add login endpoint**

Add before the recognize endpoint:

```python
# --- API: AUTH ---
@app.post('/api/auth/login')
async def login(username: str = Form(...), password: str = Form(...)):
    token = check_login(username, password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": token, "username": username}

@app.get('/api/auth/me')
async def auth_me(user=Depends(require_admin)):
    return {"username": user["sub"]}
```

- [ ] **Step 3: Add auth dependencies to protected endpoints**

Add `Depends(require_admin)` to admin-only endpoints:

```python
@app.get('/api/users')
async def list_users(user=Depends(require_admin)):
    ...

@app.get('/api/access-logs')
async def list_access_logs(user=Depends(require_admin)):
    ...

@app.get('/api/stats')
async def get_dashboard_stats(user=Depends(require_admin)):
    ...

@app.get('/api/cameras')
async def list_cameras(user=Depends(require_admin)):
    ...

@app.post('/api/employees/add')
async def add_employee(
    employee_id: str = Form(...),
    name: str = Form(...),
    role: str = Form("Employee"),
    image: UploadFile = File(...),
    user=Depends(require_admin)
):
    ...
```

Add `require_camera_or_admin` to camera endpoints. For `recognize_face`, read `X-API-Key` from header:

```python
@app.post('/api/recognize')
async def recognize_face(
    image: UploadFile = File(...),
    camera_id: str = Form(None),
    x_api_key: str | None = Header(None),
    auth=Depends(require_camera_or_admin)
):
    ...
```

Similarly for camera register and heartbeat:

```python
@app.post('/api/camera/register')
async def register_camera_endpoint(
    camera_id: str = Form(...),
    department: str = Form(...),
    x_api_key: str | None = Header(None),
    auth=Depends(require_camera_or_admin)
):
    ...

@app.post('/api/camera/heartbeat')
async def camera_heartbeat_endpoint(
    camera_id: str = Form(...),
    x_api_key: str | None = Header(None),
    auth=Depends(require_camera_or_admin)
):
    ...
```

- [ ] **Step 4: Add WebSocket auth**

Update `/ws/dashboard` to validate auth:

```python
@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket, token: str | None = Query(None)):
    if not verify_ws_auth(token=token):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await manager.connect(websocket)
    ...
```

- [ ] **Step 5: Print camera API key on startup**

In `startup_event`:

```python
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(camera_timeout_checker())
    print(f"Camera API Key: {get_camera_api_key()}")
```

- [ ] **Step 6: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/backend && source .venv/bin/activate && python -c "import ast; ast.parse(open('app.py').read()); print('OK')"`

- [ ] **Step 7: Commit**

```bash
git add backend/app.py
git commit -m "feat: protect API endpoints with JWT and camera API key auth"
```

---

## Chunk 2: Frontend Auth + Login Page

### Task 4: Create frontend auth utility

**Files:**
- Create: `frontend/src/auth.ts`

- [ ] **Step 1: Create frontend/src/auth.ts**

```typescript
import { API_BASE, WS_BASE } from './config';

const TOKEN_KEY = 'securesight_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401) {
    clearToken();
    window.location.href = '/login';
  }
  return response;
}

export function getAuthWsUrl(path: string): string {
  const token = getToken();
  const sep = path.includes('?') ? '&' : '?';
  return `${WS_BASE}${path}${token ? `${sep}token=${token}` : ''}`;
}
```

- [ ] **Step 2: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth.ts
git commit -m "feat: add frontend auth utility with token management"
```

---

### Task 5: Create login page

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Create frontend/src/pages/LoginPage.tsx**

Dark centered card login page matching the sidebar aesthetic:

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';
import { setToken } from '../auth';

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || 'Login failed');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setToken(data.token);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Network error. Is the server running?');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
      <div className="w-full max-w-sm bg-[#1e293b] rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <span className="material-symbols-outlined text-4xl text-slate-200 mb-2 block">shield</span>
          <h1 className="text-white font-bold text-xl">SecureSight</h1>
          <p className="text-slate-500 text-[11px] uppercase tracking-[0.2em] mt-1 font-semibold">
            FSUU Facial Recognition
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 rounded-lg font-bold text-sm text-white transition-colors ${
              loading ? 'bg-blue-500/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
```

- [ ] **Step 2: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: add dark centered card login page"
```

---

### Task 6: Add route protection

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update App.tsx with auth guard**

```tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './auth';
import CameraStationPage from './pages/CameraStationPage';
import MainApp from './pages/MainApp';
import LoginPage from './pages/LoginPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/camera/:cameraId" element={<CameraStationPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <MainApp />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;
```

- [ ] **Step 2: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add route protection with redirect to login"
```

---

### Task 7: Update components to use authFetch

**Files:**
- Modify: `frontend/src/components/DashboardTab.tsx`
- Modify: `frontend/src/components/AddEmployeeTab.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Update DashboardTab.tsx**

Replace `WS_BASE` WebSocket URL with `getAuthWsUrl`:

```typescript
import { getAuthWsUrl } from '../auth';
// In useDashboardWebSocket connect():
const ws = new WebSocket(getAuthWsUrl('/ws/dashboard'));
```

Replace `fetch(${API_BASE}/api/access-logs)` with `authFetch`:

```typescript
import { authFetch } from '../auth';
// In useEffect:
authFetch('/api/access-logs')
  .then(res => res.json())
  .then(data => setInitialLogs(data))
  .catch(() => {});
```

Remove the `API_BASE` import if no longer used directly.

- [ ] **Step 2: Update AddEmployeeTab.tsx**

Replace `fetch(${API_BASE}/api/employees/add`, ...)` with `authFetch('/api/employees/add', ...)`:

```typescript
import { authFetch } from '../auth';
// In handleSubmit:
const response = await authFetch('/api/employees/add', {
  method: 'POST',
  body: formData,
});
```

Remove the `API_BASE` import if no longer used directly.

- [ ] **Step 3: Update Sidebar.tsx with logout and cameras link**

Add "Cameras" to `mainLinks`:

```typescript
const mainLinks = [
  { path: '/dashboard', label: 'Dashboard', icon: 'grid_view' },
  { path: '/cameras', label: 'Cameras', icon: 'videocam' },
  { path: '/admin/add-employee', label: 'Add Employee', icon: 'person_add' },
];
```

Wire the logout button:

```typescript
import { useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';

// Inside the component:
const navigate = useNavigate();

const handleLogout = () => {
  clearToken();
  navigate('/login', { replace: true });
};

// Replace the logout button onClick:
<button onClick={handleLogout} className="text-slate-500 hover:text-white transition-colors shrink-0">
  <span className="material-symbols-outlined text-xl">logout</span>
</button>
```

- [ ] **Step 4: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardTab.tsx frontend/src/components/AddEmployeeTab.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: update components to use authFetch and add cameras nav link"
```

---

### Task 8: Update CameraStationPage for API key auth

**Files:**
- Modify: `frontend/src/pages/CameraStationPage.tsx`
- Modify: `frontend/src/components/CameraFeed.tsx`

- [ ] **Step 1: Read API key from URL in CameraStationPage**

```typescript
import { useParams, useSearchParams } from 'react-router-dom';

// Inside the component:
const [searchParams] = useSearchParams();
const apiKey = searchParams.get('key') || '';
```

Pass `apiKey` to `CameraFeed` and use it in fetch calls:

```typescript
<CameraFeed
  isScanning={isScanning && !activeResults}
  onSnap={handleResult}
  onToggle={handleToggleScan}
  cameraId={cameraId}
  apiKey={apiKey}
>
```

Update the register and heartbeat fetch calls to include the API key header:

```typescript
const headers: HeadersInit = apiKey ? { 'X-API-Key': apiKey } : {};

await fetch(`${API_BASE}/api/camera/register`, { method: 'POST', body: formData, headers });
// ... same for heartbeat
```

- [ ] **Step 2: Update CameraFeed to accept and use apiKey prop**

Add `apiKey?: string` to `CameraFeedProps`. Use it in the recognize fetch call:

```typescript
const fetchHeaders: HeadersInit = apiKey ? { 'X-API-Key': apiKey } : {};

const response = await fetch(`${API_BASE}/api/recognize`, {
  method: 'POST',
  body: formData,
  headers: fetchHeaders,
});
```

- [ ] **Step 3: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CameraStationPage.tsx frontend/src/components/CameraFeed.tsx
git commit -m "feat: add API key auth to camera station requests"
```

---

## Chunk 3: Live Camera Streaming

### Task 9: Create streaming backend

**Files:**
- Create: `backend/streaming.py`
- Modify: `backend/app.py`

- [ ] **Step 1: Create backend/streaming.py**

```python
import asyncio
import json
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class StreamManager:
    """Manages camera frame ingestion and relay to viewers."""

    def __init__(self):
        self.latest_frames: dict[str, str] = {}  # camera_id -> base64 jpeg
        self.viewers: list[WebSocket] = []

    async def add_viewer(self, ws: WebSocket):
        await ws.accept()
        self.viewers.append(ws)
        # Send all current frames on connect
        for camera_id, frame in self.latest_frames.items():
            try:
                await ws.send_json({"camera_id": camera_id, "frame": frame})
            except Exception:
                pass

    def remove_viewer(self, ws: WebSocket):
        if ws in self.viewers:
            self.viewers.remove(ws)

    async def ingest_frame(self, camera_id: str, frame: str):
        """Store latest frame and relay to all viewers."""
        self.latest_frames[camera_id] = frame
        msg = {"camera_id": camera_id, "frame": frame}
        disconnected = []
        for viewer in self.viewers:
            try:
                await viewer.send_json(msg)
            except Exception:
                disconnected.append(viewer)
        for v in disconnected:
            self.remove_viewer(v)

    async def handle_camera_stream(self, ws: WebSocket):
        """Handle incoming frames from a camera station."""
        await ws.accept()
        try:
            while True:
                data = await ws.receive_text()
                msg = json.loads(data)
                await self.ingest_frame(msg["camera_id"], msg["frame"])
        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"Stream error: {e}")

    async def handle_camera_view(self, ws: WebSocket):
        """Handle a dashboard viewer connection."""
        await self.add_viewer(ws)
        try:
            while True:
                await ws.receive_text()  # keep alive
        except WebSocketDisconnect:
            self.remove_viewer(ws)


stream_manager = StreamManager()
```

- [ ] **Step 2: Mount streaming WebSocket endpoints in app.py**

Add imports and endpoints:

```python
from streaming import stream_manager
from auth import verify_ws_auth

@app.websocket("/ws/camera-stream")
async def ws_camera_stream(websocket: WebSocket, key: str | None = Query(None)):
    if not verify_ws_auth(key=key):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await stream_manager.handle_camera_stream(websocket)

@app.websocket("/ws/camera-view")
async def ws_camera_view(websocket: WebSocket, token: str | None = Query(None)):
    if not verify_ws_auth(token=token):
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await stream_manager.handle_camera_view(websocket)
```

Add `Query` to the FastAPI import line if not already there.

- [ ] **Step 3: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/backend && source .venv/bin/activate && python -c "import ast; ast.parse(open('streaming.py').read()); ast.parse(open('app.py').read()); print('OK')"`

- [ ] **Step 4: Commit**

```bash
git add backend/streaming.py backend/app.py
git commit -m "feat: add camera streaming WebSocket endpoints with frame relay"
```

---

### Task 10: Add frame streaming to CameraFeed

**Files:**
- Modify: `frontend/src/components/CameraFeed.tsx`

- [ ] **Step 1: Add frame capture and WebSocket streaming**

Add a `streamWsRef` and frame capture interval inside the `initializeSystem` effect. After the video starts playing, set up a 200ms interval that captures the canvas as JPEG and sends it via WebSocket:

```typescript
// Add to CameraFeedProps:
apiKey?: string;

// Inside the useEffect after video.onloadedmetadata:
// Set up frame streaming WebSocket
const streamWsUrl = `${WS_BASE}/ws/camera-stream?key=${apiKey || ''}`;
const streamWs = new WebSocket(streamWsUrl);
const streamInterval = setInterval(() => {
  if (streamWs.readyState === WebSocket.OPEN && video.videoWidth > 0) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const cx = c.getContext('2d');
    if (cx) {
      cx.drawImage(video, 0, 0, 320, 240);
      const frame = c.toDataURL('image/jpeg', 0.6).split(',')[1];
      streamWs.send(JSON.stringify({ camera_id: cameraId || 'default', frame }));
    }
  }
}, 200);

// In cleanup:
clearInterval(streamInterval);
streamWs.close();
```

Import `WS_BASE` from `../config` if not already imported.

- [ ] **Step 2: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CameraFeed.tsx
git commit -m "feat: stream camera frames to server via WebSocket"
```

---

### Task 11: Create CameraGridPage

**Files:**
- Create: `frontend/src/pages/CameraGridPage.tsx`
- Modify: `frontend/src/pages/MainApp.tsx`

- [ ] **Step 1: Create frontend/src/pages/CameraGridPage.tsx**

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthWsUrl } from '../auth';

interface CameraFrame {
  camera_id: string;
  frame: string;  // base64 jpeg
  lastUpdate: number;
  fps: number;
  frameCount: number;
}

function CameraGridPage() {
  const [cameras, setCameras] = useState<Map<string, CameraFrame>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const fpsIntervalRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(getAuthWsUrl('/ws/camera-view'));
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.camera_id && msg.frame) {
          setCameras(prev => {
            const next = new Map(prev);
            const existing = next.get(msg.camera_id);
            next.set(msg.camera_id, {
              camera_id: msg.camera_id,
              frame: msg.frame,
              lastUpdate: Date.now(),
              fps: existing?.fps || 0,
              frameCount: (existing?.frameCount || 0) + 1,
            });
            return next;
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (mountedRef.current) {
        setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  // FPS calculator — runs every second
  useEffect(() => {
    const prevCounts = new Map<string, number>();

    fpsIntervalRef.current = window.setInterval(() => {
      setCameras(prev => {
        const next = new Map(prev);
        for (const [id, cam] of next) {
          const prevCount = prevCounts.get(id) || 0;
          const fps = cam.frameCount - prevCount;
          prevCounts.set(id, cam.frameCount);
          next.set(id, { ...cam, fps });
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(fpsIntervalRef.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  // ESC to close fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const cameraList = Array.from(cameras.values());
  const isStale = (lastUpdate: number) => Date.now() - lastUpdate > 5000;

  return (
    <div className="flex flex-col h-full w-full bg-slate-50/50 dark:bg-slate-900 overflow-y-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Camera Grid</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Live feeds from all connected camera stations.
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
          isConnected ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          {isConnected ? `Live — ${cameraList.length} cameras` : 'Disconnected'}
        </div>
      </div>

      {/* Grid */}
      {cameraList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3 block">videocam_off</span>
            <p className="text-slate-500 dark:text-slate-400">No camera streams active.</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Open /camera/department-name on a device to start streaming.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gridAutoRows: 'minmax(200px, auto)' }}>
          {cameraList.map(cam => {
            const stale = isStale(cam.lastUpdate);
            return (
              <div
                key={cam.camera_id}
                className={`relative bg-slate-900 rounded-xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] ${
                  stale ? 'border-amber-500/50' : 'border-slate-700 hover:border-blue-500/50'
                }`}
                onClick={() => setFullscreen(cam.camera_id)}
              >
                {/* Video frame */}
                <img
                  src={`data:image/jpeg;base64,${cam.frame}`}
                  alt={cam.camera_id}
                  className="w-full h-full object-cover"
                />

                {/* Overlay info */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
                      <span className="text-white text-sm font-bold capitalize">
                        {cam.camera_id.replace(/-/g, ' ')}
                      </span>
                    </div>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      stale ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
                    }`}>
                      {stale ? 'OFFLINE' : `${cam.fps} fps`}
                    </span>
                  </div>
                </div>

                {/* Stale overlay */}
                {stale && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="text-center">
                      <span className="material-symbols-outlined text-amber-500 text-3xl">videocam_off</span>
                      <p className="text-amber-400 text-xs mt-1 font-bold">Stream Lost</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen overlay */}
      {fullscreen && cameras.has(fullscreen) && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setFullscreen(null)}
        >
          <img
            src={`data:image/jpeg;base64,${cameras.get(fullscreen)!.frame}`}
            alt={fullscreen}
            className="max-w-full max-h-full object-contain"
          />
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <span className="text-white font-bold text-lg capitalize">{fullscreen.replace(/-/g, ' ')}</span>
            <span className="bg-green-500/20 text-green-400 text-xs font-mono px-2 py-1 rounded">
              {cameras.get(fullscreen)!.fps} fps
            </span>
          </div>
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={() => setFullscreen(null)}
          >
            <span className="material-symbols-outlined text-white">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default CameraGridPage;
```

- [ ] **Step 2: Add cameras route to MainApp.tsx**

```typescript
import CameraGridPage from './CameraGridPage';

// In Routes:
<Route path="cameras" element={<CameraGridPage />} />
```

- [ ] **Step 3: Verify**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npx tsc --noEmit`

- [ ] **Step 4: Build**

Run: `cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CameraGridPage.tsx frontend/src/pages/MainApp.tsx
git commit -m "feat: add live camera grid page with fullscreen overlay"
```

---

## Chunk 4: Integration Verification

### Task 12: End-to-end verification

- [ ] **Step 1: Start backend**

```bash
cd /Users/jerichowenzel/Desktop/guest-reco/backend && source .venv/bin/activate && python app.py
```

Verify output includes:
- `SQLite Database Initialized`
- `Camera API Key: <some-uuid>`
- `Uvicorn running on http://0.0.0.0:5001`

- [ ] **Step 2: Start frontend**

```bash
cd /Users/jerichowenzel/Desktop/guest-reco/frontend && npm run dev
```

- [ ] **Step 3: Verify auth flow**

1. Open http://localhost:3000 — should redirect to /login
2. Enter wrong credentials — should show error
3. Enter `admin` / `securesight2026` — should redirect to /dashboard
4. Refresh page — should stay logged in (token in localStorage)

- [ ] **Step 4: Verify dashboard stats**

1. Open http://localhost:3000/camera/lobby?key=<CAMERA_API_KEY> in another tab
2. Dashboard should show `Cameras Online: 1` updating in real-time

- [ ] **Step 5: Verify camera grid**

1. Navigate to /cameras in the dashboard
2. Should show live stream from the lobby camera
3. Click tile — should open fullscreen
4. Press ESC — should close fullscreen

- [ ] **Step 6: Verify logout**

1. Click logout in sidebar
2. Should redirect to /login
3. Navigating to /dashboard should redirect back to /login
