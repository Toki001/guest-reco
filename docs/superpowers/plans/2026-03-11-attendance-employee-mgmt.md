# Attendance & Employee Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add kiosk-style clock in/out toasts, full employee CRUD with profiles, and an attendance log page with "Who's In" panel.

**Architecture:** Backend-first approach. Add new database functions and API endpoints first, then build the frontend pages. The camera station toast system is independent and can be built in parallel with the employee/attendance pages.

**Tech Stack:** FastAPI + SQLite (backend), React + TypeScript + Tailwind (frontend), WebSocket for real-time updates.

**Spec:** `docs/superpowers/specs/2026-03-11-attendance-employee-mgmt-design.md`

---

## File Structure

### Backend (modify)
- `backend/database.py` — Add: `delete_user`, `update_user`, `get_user_detail`, `get_users_with_last_seen`, `get_attendance_logs`, `get_active_users`, `get_user_attendance`. Add index on `access_logs(user_id, timestamp)`.
- `backend/app.py` — Add 7 new endpoints, modify `/api/recognize` for cooldown + `user_id` in response, modify `/api/employees/add` to reject duplicates.

### Frontend (create)
- `frontend/src/components/RecognitionToast.tsx` — Kiosk toast card component (single recognition result).
- `frontend/src/pages/EmployeesPage.tsx` — Employee management table with search/filter/actions.
- `frontend/src/pages/EmployeeProfilePage.tsx` — Individual employee profile with attendance history.
- `frontend/src/pages/AttendancePage.tsx` — "Who's In" panel + paginated event log.
- `frontend/src/components/AddEmployeeModal.tsx` — Extracted from AddEmployeeTab into a modal.

### Frontend (modify)
- `frontend/src/pages/CameraStationPage.tsx` — Replace ResultModal with toast system + client-side cooldown.
- `frontend/src/components/CameraFeed.tsx` — Update `onSnap` callback to include `user_id` and `status`.
- `frontend/src/pages/MainApp.tsx` — Add routes for `/employees`, `/employees/:id`, `/attendance`.
- `frontend/src/components/Sidebar.tsx` — Replace "Add Employee" link with "Employees" and add "Attendance".
- `frontend/src/types.ts` — Update types for new response shapes.

### Frontend (delete)
- `frontend/src/components/ResultModal.tsx` — Replaced by `RecognitionToast.tsx`.
- `frontend/src/components/AddEmployeeTab.tsx` — Replaced by `AddEmployeeModal.tsx` + `EmployeesPage.tsx`.

---

## Task 1: Database Layer — New Functions + Index

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: Add index on access_logs**

In `init_db()`, after the `cameras` table creation, add:

```python
conn.execute("CREATE INDEX IF NOT EXISTS idx_access_logs_user_timestamp ON access_logs(user_id, timestamp DESC)")
```

- [ ] **Step 2: Add `delete_user` function**

```python
def delete_user(user_id):
    conn = get_connection()
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    USER_STATE_CACHE.pop(user_id, None)
    KNOWN_USERS_CACHE.discard(user_id)
```

- [ ] **Step 3: Add `update_user` function**

```python
def update_user(user_id, name=None, role=None):
    conn = get_connection()
    if name is not None:
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
    if role is not None:
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    conn.commit()
```

- [ ] **Step 4: Add `update_user_face` function**

```python
def update_user_face(user_id, face_encoding_bytes, image_path):
    conn = get_connection()
    conn.execute("UPDATE users SET face_encoding = ?, image_path = ? WHERE id = ?",
                 (face_encoding_bytes, image_path, user_id))
    conn.commit()
```

- [ ] **Step 5: Add `get_user_detail` function**

Returns a single user with their first-seen date and last activity:

```python
def get_user_detail(user_id):
    conn = get_connection()
    row = conn.execute("SELECT id, name, image_path, role FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    first_seen = conn.execute(
        "SELECT MIN(timestamp) as ts FROM access_logs WHERE user_id = ?", (user_id,)
    ).fetchone()["ts"]
    last_log = conn.execute(
        "SELECT status, timestamp, camera_id FROM access_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    return {
        "id": row["id"], "name": row["name"], "image_url": row["image_path"], "role": row["role"],
        "first_seen": first_seen,
        "last_status": last_log["status"] if last_log else None,
        "last_seen": last_log["timestamp"] if last_log else None,
        "last_camera": last_log["camera_id"] if last_log else None,
    }
```

- [ ] **Step 6: Add `get_users_with_last_seen` function**

For the employees table — all users with their last activity joined in:

```python
def get_users_with_last_seen():
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id, u.name, u.image_path, u.role,
               a.status as last_status, a.timestamp as last_seen, a.camera_id as last_camera
        FROM users u
        LEFT JOIN access_logs a ON a.user_id = u.id
            AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
        ORDER BY u.name
    """).fetchall()
    return [{
        "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
        "last_status": r["last_status"], "last_seen": r["last_seen"], "last_camera": r["last_camera"]
    } for r in rows]
```

- [ ] **Step 7: Add `get_active_users` function**

People currently clocked in (last status = "in"):

```python
def get_active_users():
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id, u.name, u.image_path, u.role, a.timestamp as clock_in_time, a.camera_id
        FROM users u
        JOIN access_logs a ON a.user_id = u.id
            AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
        WHERE a.status = 'in'
        ORDER BY a.timestamp DESC
    """).fetchall()
    return [{
        "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
        "clock_in_time": r["clock_in_time"], "camera_id": r["camera_id"]
    } for r in rows]
```

- [ ] **Step 8: Add `get_attendance_logs` function**

Paginated, filterable attendance log:

```python
def get_attendance_logs(page=1, per_page=50, date_from=None, date_to=None,
                        camera_id=None, user_id=None, status=None):
    conn = get_connection()
    conditions = []
    params = []
    if date_from:
        conditions.append("a.timestamp >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("a.timestamp <= ?")
        params.append(date_to)
    if camera_id:
        conditions.append("a.camera_id = ?")
        params.append(camera_id)
    if user_id:
        conditions.append("a.user_id = ?")
        params.append(user_id)
    if status:
        conditions.append("a.status = ?")
        params.append(status)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * per_page

    total = conn.execute(f"SELECT COUNT(*) as c FROM access_logs a {where}", params).fetchone()["c"]

    rows = conn.execute(f"""
        SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.camera_id,
               COALESCE(u.name, 'Deleted User') as name, u.image_path, COALESCE(u.role, 'Unknown') as role
        FROM access_logs a
        LEFT JOIN users u ON a.user_id = u.id
        {where}
        ORDER BY a.timestamp DESC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": [{
            "id": r["id"], "user_id": r["user_id"], "status": r["status"],
            "confidence": r["confidence"], "timestamp": r["timestamp"], "camera_id": r["camera_id"],
            "name": r["name"], "image_url": r["image_path"], "role": r["role"]
        } for r in rows]
    }
```

- [ ] **Step 9: Add `get_user_attendance` function**

Attendance history for a single user, paired as in/out sessions with duration:

```python
def get_user_attendance(user_id, limit=100):
    conn = get_connection()
    rows = conn.execute("""
        SELECT id, status, confidence, timestamp, camera_id
        FROM access_logs WHERE user_id = ?
        ORDER BY timestamp ASC
    """, (user_id,)).fetchall()

    # Pair in/out events into sessions
    sessions = []
    pending_in = None
    for r in rows:
        if r["status"] == "in":
            pending_in = {"time_in": r["timestamp"], "camera_in": r["camera_id"], "confidence": r["confidence"]}
        elif r["status"] == "out" and pending_in:
            duration = None
            try:
                t_in = datetime.datetime.fromisoformat(pending_in["time_in"])
                t_out = datetime.datetime.fromisoformat(r["timestamp"])
                duration = int((t_out - t_in).total_seconds())
            except Exception:
                pass
            sessions.append({
                "time_in": pending_in["time_in"],
                "time_out": r["timestamp"],
                "camera_in": pending_in["camera_in"],
                "camera_out": r["camera_id"],
                "confidence": pending_in["confidence"],
                "duration_seconds": duration
            })
            pending_in = None

    # If there's a pending clock-in with no clock-out yet
    if pending_in:
        sessions.append({
            "time_in": pending_in["time_in"],
            "time_out": None,
            "camera_in": pending_in["camera_in"],
            "camera_out": None,
            "confidence": pending_in["confidence"],
            "duration_seconds": None
        })

    sessions.reverse()  # newest first
    return sessions[:limit]
```

- [ ] **Step 10: Add `user_exists` function**

For duplicate rejection:

```python
def user_exists(user_id):
    conn = get_connection()
    row = conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone()
    return row is not None
```

- [ ] **Step 11: Commit**

```bash
git add backend/database.py
git commit -m "feat: add employee CRUD, attendance queries, and access_logs index"
```

---

## Task 2: Backend API — New Endpoints + Recognize Changes

**Files:**
- Modify: `backend/app.py`

- [ ] **Step 1: Update database imports and add in-memory cooldown**

Add new imports at top of `app.py`:

```python
import time

from database import (
    get_user_profile, log_access_attempt, insert_user,
    get_access_logs, get_all_users, get_all_users_with_encodings, get_stats,
    register_camera, update_camera_heartbeat, get_all_cameras, mark_camera_offline,
    get_offline_cameras, delete_camera,
    # New imports:
    delete_user, update_user, update_user_face, get_user_detail,
    get_users_with_last_seen, get_active_users, get_attendance_logs,
    get_user_attendance, user_exists
)
```

Add in-memory cooldown cache after the `manager = ConnectionManager()` line:

```python
# In-memory cooldown: user_id -> last_logged_timestamp (monotonic)
_scan_cooldown: dict[str, float] = {}
COOLDOWN_SECONDS = 10
```

- [ ] **Step 2: Add GET /api/employees (replaces /api/users)**

```python
@app.get('/api/employees')
async def list_employees(user=Depends(require_admin)):
    return await asyncio.to_thread(get_users_with_last_seen)
```

- [ ] **Step 3: Add GET /api/employees/{employee_id}**

```python
@app.get('/api/employees/{employee_id}')
async def get_employee(employee_id: str, user=Depends(require_admin)):
    detail = await asyncio.to_thread(get_user_detail, employee_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Employee not found")
    return detail
```

- [ ] **Step 4: Add PUT /api/employees/{employee_id}**

```python
@app.put('/api/employees/{employee_id}')
async def update_employee(
    employee_id: str,
    name: str = Form(None),
    role: str = Form(None),
    user=Depends(require_admin)
):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    await asyncio.to_thread(update_user, employee_id, name=name, role=role)
    return {"status": "updated", "employee_id": employee_id}
```

- [ ] **Step 5: Add DELETE /api/employees/{employee_id}**

```python
@app.delete('/api/employees/{employee_id}')
async def remove_employee(employee_id: str, user=Depends(require_admin)):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    await asyncio.to_thread(delete_user, employee_id)
    return {"status": "deleted", "employee_id": employee_id}
```

- [ ] **Step 6: Add POST /api/employees/{employee_id}/reface**

```python
@app.post('/api/employees/{employee_id}/reface')
async def reface_employee(
    employee_id: str,
    image: UploadFile = File(...),
    user=Depends(require_admin)
):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    image_bytes = await image.read()
    encoding_bytes = await asyncio.to_thread(index_face, image_bytes)
    if encoding_bytes is None:
        raise HTTPException(status_code=400, detail="No face detected in the image.")
    filename = f"{employee_id}_reface_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
    avatar_path = save_image_locally(image_bytes, "avatars", filename)
    await asyncio.to_thread(update_user_face, employee_id, encoding_bytes, avatar_path)
    return {"status": "updated", "image_url": avatar_path}
```

- [ ] **Step 7: Add GET /api/employees/{employee_id}/attendance**

```python
@app.get('/api/employees/{employee_id}/attendance')
async def employee_attendance(employee_id: str, user=Depends(require_admin)):
    profile = await asyncio.to_thread(get_user_profile, employee_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Employee not found")
    logs = await asyncio.to_thread(get_user_attendance, employee_id)
    return logs
```

- [ ] **Step 8: Add GET /api/attendance**

```python
@app.get('/api/attendance')
async def attendance_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    date_from: str = Query(None),
    date_to: str = Query(None),
    camera_id: str = Query(None),
    user_id: str = Query(None),
    status: str = Query(None),
    user=Depends(require_admin)
):
    return await asyncio.to_thread(
        get_attendance_logs, page, per_page, date_from, date_to, camera_id, user_id, status
    )
```

- [ ] **Step 9: Add GET /api/attendance/active**

```python
@app.get('/api/attendance/active')
async def active_users(user=Depends(require_admin)):
    return await asyncio.to_thread(get_active_users)
```

- [ ] **Step 10: Modify /api/employees/add to reject duplicates**

In the `add_employee` function, before `image_bytes = await image.read()`, add:

```python
    if await asyncio.to_thread(user_exists, employee_id):
        raise HTTPException(status_code=409, detail="Employee ID already exists")
```

- [ ] **Step 11: Modify /api/recognize for cooldown + user_id in response**

In `recognize_face`, for Case 2 (guest auto-register), add `user_id` to the response:

```python
            return {"message": guest_name, "type": "guest", "confidence": 100.0,
                    "image_url": avatar_path, "status": final_status, "user_id": guest_id}
```

For Case 3 (match found), add in-memory cooldown check before logging. Replace the block from `user_id = result["user_id"]` through the return with:

```python
        user_id = result["user_id"]
        confidence = result["confidence"]

        # In-memory cooldown: skip if same user scanned within 10 seconds
        now = time.monotonic()
        last_scan = _scan_cooldown.get(user_id, 0)
        if now - last_scan < COOLDOWN_SECONDS:
            user_profile = await asyncio.to_thread(get_user_profile, user_id)
            return {"message": user_profile["name"] if user_profile else user_id,
                    "type": (user_profile.get("role", "Employee").lower() if user_profile else "employee"),
                    "confidence": confidence, "user_id": user_id, "skipped": True,
                    "image_url": user_profile.get("image_url", "") if user_profile else "",
                    "status": None}

        user_profile = await asyncio.to_thread(get_user_profile, user_id)
        if user_profile:
            name = user_profile["name"]
            image_url = user_profile.get("image_url", "")
            user_type = user_profile.get("role", "Employee").lower()
        else:
            name = f"ID: {user_id}"
            image_url = ""
            user_type = "employee"

        final_status = await asyncio.to_thread(lambda: log_access_attempt(user_id, "in", confidence, camera_id=camera_id))
        _scan_cooldown[user_id] = time.monotonic()
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] ✅ {user_type.title()} Identified: {name} (Clocking {final_status.upper()})")

        await manager.broadcast({
            "event": "recognition_result",
            "data": {"name": name, "type": user_type, "confidence": confidence,
                     "image_url": image_url, "status": final_status, "user_id": user_id,
                     "camera_id": camera_id, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        })
        await manager.broadcast({"event": "stats_update", "data": await asyncio.to_thread(get_stats)})

        return {"message": name, "type": user_type, "confidence": confidence,
                "image_url": image_url, "status": final_status, "user_id": user_id}
```

Also add `user_id` to the guest Case 2 broadcast and response. In Case 2, update the broadcast dict to include `"user_id": guest_id`:

```python
            await manager.broadcast({
                "event": "recognition_result",
                "data": {"name": guest_name, "type": "guest", "confidence": 100.0,
                         "image_url": avatar_path, "status": final_status, "user_id": guest_id,
                         "camera_id": camera_id, "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            })
```

And set cooldown for the newly registered guest:

```python
            _scan_cooldown[guest_id] = time.monotonic()
```

- [ ] **Step 12: Commit**

```bash
git add backend/app.py
git commit -m "feat: add employee CRUD endpoints, attendance API, recognition cooldown"
```

---

## Task 3: Camera Station — Kiosk Toast System

**Files:**
- Create: `frontend/src/components/RecognitionToast.tsx`
- Modify: `frontend/src/pages/CameraStationPage.tsx`
- Modify: `frontend/src/components/CameraFeed.tsx`

- [ ] **Step 1: Create RecognitionToast component**

Create `frontend/src/components/RecognitionToast.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { API_BASE } from '../config';

export interface ToastData {
  id: string;
  name: string;
  type: 'employee' | 'guest';
  status: 'in' | 'out';
  confidence: number;
  imageUrl: string;
  skipped?: boolean;
}

interface Props {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

export function RecognitionToast({ toast, onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 3500);
    const remove = setTimeout(() => onDismiss(toast.id), 4000);
    return () => { clearTimeout(timer); clearTimeout(remove); };
  }, [toast.id, onDismiss]);

  const isIn = toast.status === 'in';
  const isGuest = toast.type === 'guest';

  const bgColor = isGuest ? 'bg-amber-900/90 border-amber-500/50' :
                  isIn ? 'bg-emerald-900/90 border-emerald-500/50' :
                         'bg-red-900/90 border-red-500/50';

  const statusLabel = isGuest ? 'GUEST' : isIn ? 'CLOCK IN' : 'CLOCK OUT';
  const statusColor = isGuest ? 'text-amber-400' : isIn ? 'text-emerald-400' : 'text-red-400';

  const imgSrc = toast.imageUrl && toast.imageUrl !== 'placeholder'
    ? (toast.imageUrl.startsWith('/') ? `${API_BASE}${toast.imageUrl}` : toast.imageUrl)
    : null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-2xl
      transition-all duration-500 min-w-[280px] max-w-[340px]
      ${bgColor} ${exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'}`}>
      {imgSrc ? (
        <img src={imgSrc} alt={toast.name} className="w-12 h-12 rounded-full object-cover border-2 border-white/20 shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center border-2 border-white/20 shrink-0">
          <span className="material-symbols-outlined text-slate-400 text-xl">person</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm truncate">{toast.name}</p>
        <p className={`text-xs font-bold uppercase tracking-wider ${statusColor}`}>{statusLabel}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-white/70 text-xs font-mono">{toast.confidence.toFixed(1)}%</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update CameraFeed onSnap callback type**

In `frontend/src/components/CameraFeed.tsx`, update the `onSnap` prop type:

```typescript
onSnap: (results: { name: string; type: 'guest' | 'employee'; confidence: number; image_url?: string; status?: string; user_id?: string; skipped?: boolean }[]) => void;
```

In `captureAndSendAll`, update the resolve to include new fields from the API response:

```typescript
if (response.ok && data.status !== 'no_face_detected') {
  resolve({ name: data.message, type: data.type, confidence: data.confidence,
            image_url: data.image_url, status: data.status, user_id: data.user_id,
            skipped: data.skipped });
} else resolve(null);
```

- [ ] **Step 3: Rewrite CameraStationPage with toast system + client-side cooldown**

Replace `CameraStationPage.tsx`. Key changes:
- Remove `ResultModal` import and `activeResults` state
- Add toast list state: `const [toasts, setToasts] = useState<ToastData[]>([]);`
- Add cooldown map: `const cooldownRef = useRef<Map<string, number>>(new Map());`
- Keep scanning running — never pause for results
- `isScanning` stays true always (remove toggle for pause on result)
- Remove `handleDismiss` and the auto-dismiss `useEffect`

**Client-side cooldown logic** — the cooldown suppresses toasts for users already seen. Since `user_id` is only known after the first API call, the flow is:
1. First scan → API call goes through → server returns `user_id` + logs it → toast shown → `cooldownRef.set(user_id, Date.now())`
2. Subsequent scans → API call goes through → server returns `skipped: true` (server-side cooldown) + `user_id` → client checks `result.skipped` → no toast, update cooldown timestamp

In `handleResult`, for each result:
- If `result.skipped === true`, silently ignore (server already prevented logging)
- If `cooldownRef.current.has(userId) && Date.now() - cooldownRef.current.get(userId)! < 10000`, skip toast (extra safety)
- Otherwise, add toast and set cooldown: `cooldownRef.current.set(userId, Date.now())`

Also filter `skipped` results in `CameraFeed.tsx` `captureAndSendAll`: change the filter to exclude skipped results from triggering `onSnap`:

```typescript
const validResults = results.filter(r => r !== null && !r.skipped) as any[];
```

This way, skipped results never even reach `handleResult`, making the client-side cooldown a secondary guard only for edge cases (e.g., two cameras scanning same person simultaneously before the first call returns).

Render toasts as stacked list in bottom-right corner of camera feed:

```tsx
<div className="absolute bottom-24 right-4 z-40 flex flex-col gap-2">
  {toasts.map(t => (
    <RecognitionToast key={t.id} toast={t} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
  ))}
</div>
```

- [ ] **Step 4: Delete ResultModal**

Delete `frontend/src/components/ResultModal.tsx` — no longer used.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RecognitionToast.tsx frontend/src/pages/CameraStationPage.tsx frontend/src/components/CameraFeed.tsx
git rm frontend/src/components/ResultModal.tsx
git commit -m "feat: replace ResultModal with kiosk toast system and client-side cooldown"
```

---

## Task 4: Employee Management Page

**Files:**
- Create: `frontend/src/pages/EmployeesPage.tsx`
- Create: `frontend/src/components/AddEmployeeModal.tsx`
- Modify: `frontend/src/pages/MainApp.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Create AddEmployeeModal**

Extract the form from `AddEmployeeTab.tsx` into `frontend/src/components/AddEmployeeModal.tsx`. Wrap it in a modal overlay (fixed inset-0, bg-black/50, centered card). Add an `onClose` prop and an `onSuccess` callback that the parent uses to refresh the table.

- [ ] **Step 2: Create EmployeesPage**

Create `frontend/src/pages/EmployeesPage.tsx` with:

- Fetch from `GET /api/employees` via `authFetch`
- State: `search`, `roleFilter` (All/Employee/Guest), `showAddModal`, `editingId`, `deletingId`
- **Action bar**: search input, role dropdown, "Add Employee" button
- **Table**: Avatar (img or placeholder), Name, ID, Role (badge), Last Seen (timestamp + camera or "Never"), Status (IN green / OUT red / "—"), Actions column
- **Actions**: Edit button → inline edit (name + role fields become inputs, save/cancel). Delete button → confirm dialog → `DELETE /api/employees/:id`. View button → navigate to `/employees/:id`. Guest rows show "Promote" button → `PUT /api/employees/:id` with `role=Employee`.
- **Re-face**: In edit mode, show a "Re-capture Face" button that opens a file input → `POST /api/employees/:id/reface`.
- After any mutation, re-fetch the employee list.
- Image URLs: prepend `API_BASE` if they start with `/`.

- [ ] **Step 3: Update Sidebar**

In `frontend/src/components/Sidebar.tsx`, replace the "Add Employee" link:

```typescript
const mainLinks = [
  { path: '/dashboard', label: 'Dashboard', icon: 'grid_view' },
  { path: '/cameras', label: 'Cameras', icon: 'videocam' },
  { path: '/employees', label: 'Employees', icon: 'group' },
  { path: '/attendance', label: 'Attendance', icon: 'schedule' },
];
```

- [ ] **Step 4: Update MainApp routes**

**Note:** This step imports `EmployeeProfilePage` and `AttendancePage` which are created in Tasks 5 and 6. TypeScript will not compile until all tasks are complete. Use `React.lazy()` to defer imports, or simply accept the compile error as temporary.

In `frontend/src/pages/MainApp.tsx`, add imports and routes:

```tsx
import { lazy, Suspense } from 'react';
import EmployeesPage from './EmployeesPage';
const EmployeeProfilePage = lazy(() => import('./EmployeeProfilePage'));
const AttendancePage = lazy(() => import('./AttendancePage'));

// In Routes (wrap lazy components in Suspense):
<Route path="employees" element={<EmployeesPage />} />
<Route path="employees/:id" element={<Suspense fallback={<div>Loading...</div>}><EmployeeProfilePage /></Suspense>} />
<Route path="attendance" element={<Suspense fallback={<div>Loading...</div>}><AttendancePage /></Suspense>} />
```

Remove the `admin/add-employee` route and the `AddEmployeeTab` import. Keep the existing `CameraGridPage` import and route unchanged.

- [ ] **Step 5: Delete AddEmployeeTab**

Delete `frontend/src/components/AddEmployeeTab.tsx` — replaced by modal + page.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/EmployeesPage.tsx frontend/src/components/AddEmployeeModal.tsx \
       frontend/src/pages/MainApp.tsx frontend/src/components/Sidebar.tsx
git rm frontend/src/components/AddEmployeeTab.tsx
git commit -m "feat: add employee management page with CRUD, search, filters"
```

---

## Task 5: Employee Profile Page

**Files:**
- Create: `frontend/src/pages/EmployeeProfilePage.tsx`

- [ ] **Step 1: Create EmployeeProfilePage**

Create `frontend/src/pages/EmployeeProfilePage.tsx`:

- Get `id` from `useParams`
- Fetch `GET /api/employees/:id` for profile data
- Fetch `GET /api/employees/:id/attendance` for history
- **Profile card**: Avatar (large), name, role badge, first seen date, current status (in/out), last camera
- **Action buttons**: Edit, Re-face, Delete (with navigate back on success)
- **Attendance table**: Columns: Date, Time In, Time Out (or "Still In" badge), Camera, Duration (formatted as Xh Ym or "—" if still in). Uses paired session data from `GET /api/employees/:id/attendance`. Scroll within a max-height container.
- Back button → navigate to `/employees`
- Image URLs: prepend `API_BASE` if starting with `/`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/EmployeeProfilePage.tsx
git commit -m "feat: add employee profile page with attendance history"
```

---

## Task 6: Attendance Page

**Files:**
- Create: `frontend/src/pages/AttendancePage.tsx`

- [ ] **Step 1: Create AttendancePage**

Create `frontend/src/pages/AttendancePage.tsx`:

**"Who's In Right Now" panel (top):**
- Fetch `GET /api/attendance/active` on mount + refresh via WebSocket
- Listen to dashboard WebSocket `recognition_result` events to add/remove cards in real-time
- Grid of cards: avatar, name, role badge, clock-in time, camera name
- Empty state: "No one currently on site"
- Refresh button

**Event Log table (bottom):**
- Fetch `GET /api/attendance?page=1&per_page=50` via `authFetch`
- **Filters row**: date range (two date inputs), person search (text), camera dropdown (populated from `GET /api/cameras`), status dropdown (All/In/Out)
- Table columns: Person (avatar + name), Role, Status (IN green / OUT red badge), Camera, Confidence bar, Timestamp
- **Pagination**: Previous/Next buttons + "Page X of Y" display. Use `total` from response.
- Re-fetch when any filter changes or page changes.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AttendancePage.tsx
git commit -m "feat: add attendance page with who's-in panel and filterable log"
```

---

## Task 7: Cleanup + Integration Verification

**Files:**
- Modify: `frontend/src/types.ts` (if needed)
- Verify all routes and imports

- [ ] **Step 1: Clean up unused types and imports**

- Remove `AccessLog` type from `types.ts` if no longer used (CameraStationPage used to use it for ResultModal)
- Remove any dangling imports of `ResultModal` or `AddEmployeeTab`
- Verify `types.ts` still exports what's needed

- [ ] **Step 2: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Fix any errors.

- [ ] **Step 3: Verify backend starts**

```bash
cd backend && source .venv/bin/activate && python -c "from database import *; from app import app; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: cleanup unused types, imports, and verify integration"
```
