# UX & Reliability Improvements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate employees from guests, improve camera scanning reliability, enhance the dashboard with today's stats and thumbnails, and polish the camera kiosk experience.

**Architecture:** Four independent improvements. Sections 1 and 3 add backend endpoints + frontend pages. Section 2 is frontend-only changes to CameraFeed.tsx. Section 4 depends on Section 2 and rewrites the camera station page.

**Tech Stack:** FastAPI + SQLite (backend), React 18 + TypeScript + Tailwind CSS (frontend), MediaPipe (client-side detection), InsightFace/ArcFace (server-side recognition), Web Audio API (kiosk sounds).

**Spec:** `docs/superpowers/specs/2026-03-12-ux-reliability-improvements-design.md`

---

## Task 1: Backend — Visitors Endpoint + Employee Role Filter + Today Stats

**Files:**
- Modify: `backend/database.py` (add 2 functions, modify 1)
- Modify: `backend/app.py` (add 2 endpoints, modify 1)

### database.py changes

- [ ] **Step 1: Modify `get_users_with_last_seen` to accept role filter**

At `backend/database.py:194`, change the function signature and add a WHERE clause:

```python
def get_users_with_last_seen(role=None):
    conn = get_connection()
    role_filter = ""
    params = []
    if role and role != "all":
        role_filter = "WHERE u.role = ?"
        params = [role]
    rows = conn.execute(f"""
        SELECT u.id, u.name, u.image_path, u.role,
               a.status as last_status, a.timestamp as last_seen, a.camera_id as last_camera
        FROM users u
        LEFT JOIN access_logs a ON a.user_id = u.id
            AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
        {role_filter}
        ORDER BY u.name
    """, params).fetchall()
    return [{
        "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
        "last_status": r["last_status"], "last_seen": r["last_seen"], "last_camera": r["last_camera"]
    } for r in rows]
```

- [ ] **Step 2: Add `get_visitors_aggregated` function**

Add after `get_users_with_last_seen` in `backend/database.py`:

```python
def get_visitors_aggregated(page=1, per_page=50, date_from=None, date_to=None):
    conn = get_connection()
    conditions = ["u.role = 'Guest'"]
    params = []
    if date_from:
        conditions.append("a.timestamp >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("a.timestamp <= ?")
        params.append(date_to)

    where = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * per_page

    total = conn.execute(f"""
        SELECT COUNT(DISTINCT u.id) as c
        FROM users u LEFT JOIN access_logs a ON a.user_id = u.id
        {where}
    """, params).fetchone()["c"]

    rows = conn.execute(f"""
        SELECT u.id, u.name, u.image_path,
               MIN(a.timestamp) as first_seen,
               MAX(a.timestamp) as last_seen,
               COUNT(a.id) as total_visits,
               (SELECT camera_id FROM access_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as last_camera
        FROM users u
        LEFT JOIN access_logs a ON a.user_id = u.id
        {where}
        GROUP BY u.id
        ORDER BY last_seen DESC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": [{
            "id": r["id"], "name": r["name"], "image_url": r["image_path"],
            "first_seen": r["first_seen"], "last_seen": r["last_seen"],
            "total_visits": r["total_visits"], "last_camera": r["last_camera"]
        } for r in rows]
    }
```

- [ ] **Step 3: Add `get_today_stats` function**

Add after `get_visitors_aggregated` in `backend/database.py`:

```python
def get_today_stats():
    conn = get_connection()
    today_start = conn.execute("SELECT date('now', 'localtime', 'start of day')").fetchone()[0]

    scans = conn.execute(
        "SELECT COUNT(*) as c FROM access_logs WHERE timestamp >= ?", (today_start,)
    ).fetchone()["c"]

    unique = conn.execute(
        "SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE timestamp >= ?", (today_start,)
    ).fetchone()["c"]

    emp_in = conn.execute("""
        SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
        JOIN users u ON a.user_id = u.id
        WHERE a.timestamp >= ? AND u.role = 'Employee'
    """, (today_start,)).fetchone()["c"]

    guest_in = conn.execute("""
        SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
        JOIN users u ON a.user_id = u.id
        WHERE a.timestamp >= ? AND u.role = 'Guest'
    """, (today_start,)).fetchone()["c"]

    on_site = len(get_active_users())

    return {
        "scans_today": scans,
        "unique_people_today": unique,
        "employees_in_today": emp_in,
        "guests_today": guest_in,
        "currently_on_site": on_site
    }
```

### app.py changes

- [ ] **Step 4: Update imports in `backend/app.py`**

Add to the database import block (line 14-22):
```python
    get_visitors_aggregated, get_today_stats
```

- [ ] **Step 5: Modify `/api/employees` endpoint**

At `backend/app.py:398`, change:

```python
@app.get('/api/employees')
async def list_employees(role: str = Query("Employee"), user=Depends(require_admin)):
    return await asyncio.to_thread(get_users_with_last_seen, role=role)
```

- [ ] **Step 6: Add `/api/visitors` endpoint**

Add after the employees section in `backend/app.py`:

```python
@app.get('/api/visitors')
async def list_visitors(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    date_from: str = Query(None),
    date_to: str = Query(None),
    user=Depends(require_admin)
):
    return await asyncio.to_thread(get_visitors_aggregated, page, per_page, date_from, date_to)
```

- [ ] **Step 7: Add `/api/stats/today` endpoint**

Add after the existing `/api/stats` endpoint in `backend/app.py`:

```python
@app.get('/api/stats/today')
async def get_today_dashboard_stats(user=Depends(require_admin)):
    return await asyncio.to_thread(get_today_stats)
```

- [ ] **Step 8: Commit**

```bash
git add backend/database.py backend/app.py
git commit -m "feat: add visitors endpoint, employee role filter, today stats API"
```

---

## Task 2: Frontend — Visitors Page + Employee/Guest Separation

**Files:**
- Create: `frontend/src/pages/VisitorsPage.tsx`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/pages/MainApp.tsx`

- [ ] **Step 1: Create VisitorsPage.tsx**

Create `frontend/src/pages/VisitorsPage.tsx` — a read-only paginated table of guest visits. Pattern matches AttendancePage.tsx structure (pagination, filters, authFetch).

Key elements:
- Fetch from `GET /api/visitors?page=N&per_page=50`
- Table columns: Photo (circular avatar), Name/ID, First Seen, Last Seen, Total Visits, Last Camera
- Date range filters (date_from, date_to)
- Pagination (Previous/Next)
- Image URLs resolved with `API_BASE` prefix for paths starting with `/`
- No edit/delete actions — read-only
- Refresh button

- [ ] **Step 2: Modify EmployeesPage.tsx**

At `frontend/src/pages/EmployeesPage.tsx`, change the API call to filter by role:

Find the `fetchEmployees` function (around line 25-35). Change the fetch URL from `/api/employees` to `/api/employees?role=Employee`.

For the promote-guest search, when searching, call `/api/employees?role=all` so guests appear in search results for promotion.

- [ ] **Step 3: Update Sidebar.tsx**

At `frontend/src/components/Sidebar.tsx:23-28`, add Visitors to mainLinks:

```typescript
const mainLinks = [
    { path: '/dashboard', label: 'Dashboard', icon: 'grid_view' },
    { path: '/cameras', label: 'Cameras', icon: 'videocam' },
    { path: '/employees', label: 'Employees', icon: 'group' },
    { path: '/visitors', label: 'Visitors', icon: 'person_search' },
    { path: '/attendance', label: 'Attendance', icon: 'schedule' },
];
```

- [ ] **Step 4: Update MainApp.tsx routes**

At `frontend/src/pages/MainApp.tsx`, add lazy import and route:

```typescript
const VisitorsPage = lazy(() => import('./VisitorsPage'));
```

Add route before the catch-all:
```tsx
<Route path="visitors" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>}><VisitorsPage /></Suspense>} />
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/VisitorsPage.tsx frontend/src/pages/EmployeesPage.tsx frontend/src/components/Sidebar.tsx frontend/src/pages/MainApp.tsx
git commit -m "feat: add visitors page, separate employees from guests"
```

---

## Task 3: Camera Feed Reliability Overhaul

**Files:**
- Modify: `frontend/src/components/CameraFeed.tsx`

This is a single-file change but touches multiple sections of the render loop.

- [ ] **Step 1: Add constants and state**

Near the top of the component (after line 28), add:

```typescript
const MIN_FACE_WIDTH = 80; // minimum face bounding box width in video pixels
const LARGE_FACE_THRESHOLD = 150; // faces wider than this get faster still-time
const STILL_TIME_SHORT = 1; // seconds for large faces
const STILL_TIME_LONG = 2; // seconds for small faces
```

Replace `const REQUIRED_STILL_TIME = 1;` with a ref that changes dynamically:
```typescript
const requiredStillTimeRef = useRef(STILL_TIME_SHORT);
```

Add scan feedback state:
```typescript
const [scanFeedback, setScanFeedback] = useState<'idle' | 'move-closer' | 'hold-still' | 'counting' | 'analyzing'>('idle');
```

- [ ] **Step 2: Update the render loop detection logic**

In the renderLoop function (around line 140-200), replace the detection processing with:

1. Filter detections to only faces >= `MIN_FACE_WIDTH`:
   ```typescript
   const validDetections = detections.filter(det => det.boundingBox!.width >= MIN_FACE_WIDTH);
   const tooSmallDetections = detections.filter(det => det.boundingBox!.width < MIN_FACE_WIDTH);
   ```

2. Draw yellow "MOVE CLOSER" boxes for too-small faces.

3. For valid detections, compute adaptive still-time using the smallest face:
   ```typescript
   const smallestWidth = Math.min(...validDetections.map(d => d.boundingBox!.width));
   requiredStillTimeRef.current = smallestWidth >= LARGE_FACE_THRESHOLD ? STILL_TIME_SHORT : STILL_TIME_LONG;
   ```

4. Use `requiredStillTimeRef.current` instead of `REQUIRED_STILL_TIME` for the countdown.

5. Update `scanFeedback` state based on what's happening:
   - No faces at all → `'idle'`
   - Only too-small faces → `'move-closer'`
   - Valid faces, moving → `'hold-still'`
   - Valid faces, stable → `'counting'`

6. Change overlay text:
   - Moving: "HOLD STILL" (red) instead of "MOVEMENT"
   - Counting: just the number (green) instead of "HOLD STILL: N"

- [ ] **Step 3: Add retry logic to captureAndSendAll**

In `captureAndSendAll` (around line 280), after the fetch response handling:

```typescript
if (response.ok && Array.isArray(data.results)) {
    const validResults = data.results.filter((r: any) => r && !r.skipped && r.status);
    if (validResults.length > 0) {
        onSnap(validResults.map((r: any) => ({...})));
    } else if (!retryRef.current) {
        // Zero valid results despite sending faces — retry once
        retryRef.current = true;
        isAnalyzingRef.current = false;
        setScanStatus('idle');
        setTimeout(() => {
            retryRef.current = false;
            // Re-trigger capture from current detections if still scanning
            if (isScanningRef.current) {
                // Will be picked up by next render loop cycle
                anchorsRef.current = [];
                stillStartTimeRef.current = null;
            }
        }, 500);
        return;
    }
}
```

Add `retryRef` near other refs:
```typescript
const retryRef = useRef(false);
```

- [ ] **Step 4: Update control bar status text**

In the control bar JSX (around line 320), replace the status text to use `scanFeedback`:

```typescript
{scanFeedback === 'analyzing' ? 'ANALYZING...' :
 scanFeedback === 'move-closer' ? 'MOVE CLOSER' :
 scanFeedback === 'hold-still' ? 'HOLD STILL' :
 scanFeedback === 'counting' ? 'CAPTURING...' :
 isScanning ? 'READY TO SCAN' : 'SYSTEM PAUSED'}
```

Update control bar accent colors based on feedback state.

- [ ] **Step 5: Expose scanFeedback to parent**

Add a new optional prop to `CameraFeedProps`:
```typescript
onFeedbackChange?: (feedback: 'idle' | 'move-closer' | 'hold-still' | 'counting' | 'analyzing') => void;
```

Call it when `scanFeedback` changes (useEffect). This lets CameraStationPage know when faces are being detected (for the idle overlay in Task 5).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CameraFeed.tsx
git commit -m "feat: camera reliability — min face size, adaptive timing, feedback states, retry"
```

---

## Task 4: Dashboard — Today Stats, Thumbnails, Last Updated

**Files:**
- Modify: `frontend/src/components/DashboardTab.tsx`

- [ ] **Step 1: Add today stats state and fetching**

In the DashboardTab component (around line 127), add:

```typescript
const [todayStats, setTodayStats] = useState({ scans_today: 0, unique_people_today: 0, currently_on_site: 0 });
```

In `refreshData`, add a 4th fetch:
```typescript
authFetch('/api/stats/today').then(r => r.ok ? r.json() : null).then(data => { if (data) setTodayStats(data); }),
```

- [ ] **Step 2: Add "Today" summary pills row**

Before the 4 metric cards grid (around line 192), add:

```tsx
{/* Today Summary */}
<div className="flex flex-wrap gap-3 mb-4">
    <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full text-sm font-bold text-blue-600 dark:text-blue-400">
        {todayStats.scans_today} scans today
    </div>
    <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-full text-sm font-bold text-emerald-600 dark:text-emerald-400">
        {todayStats.unique_people_today} unique people
    </div>
    <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-full text-sm font-bold text-purple-600 dark:text-purple-400">
        {todayStats.currently_on_site} on site now
    </div>
</div>
```

- [ ] **Step 3: Add face thumbnails to activity feed**

In the activity feed rendering (around line 249-264), replace the icon placeholder with an image-first approach:

```tsx
{det.image_url ? (
    <img src={det.image_url.startsWith('/') ? `${API_BASE}${det.image_url}` : det.image_url}
         alt={det.name}
         className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-600" />
) : (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${det.type === 'guest' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
        <span className="material-symbols-outlined text-lg">{det.type === 'guest' ? 'person_alert' : 'badge'}</span>
    </div>
)}
```

Add `import { API_BASE } from '../config';` at the top if not already imported.

- [ ] **Step 4: Add "Last updated" indicator**

Add state:
```typescript
const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
```

Set it in the WebSocket `onmessage` handler and in `refreshData`:
```typescript
setLastUpdated(new Date());
```

Render near the Live/Disconnected badge:
```tsx
{lastUpdated && (
    <span className="text-[10px] text-slate-400 font-medium">
        Updated {formatTime(lastUpdated.toISOString())}
    </span>
)}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardTab.tsx
git commit -m "feat: dashboard today stats, face thumbnails, last-updated indicator"
```

---

## Task 5: Kiosk Polish — Header, Banners, Idle State, Audio

**Files:**
- Create: `frontend/src/components/RecognitionBanner.tsx`
- Modify: `frontend/src/pages/CameraStationPage.tsx`
- Delete: `frontend/src/components/RecognitionToast.tsx`

**Depends on:** Task 3 (CameraFeed reliability must be done first — uses `onFeedbackChange` prop)

- [ ] **Step 1: Create RecognitionBanner.tsx**

Create `frontend/src/components/RecognitionBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { API_BASE } from '../config';

export interface BannerData {
  id: string;
  name: string;
  type: 'employee' | 'guest';
  status: 'in' | 'out';
  confidence: number;
  imageUrl: string;
}

interface Props {
  banner: BannerData;
  onDismiss: (id: string) => void;
}

export function RecognitionBanner({ banner, onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setExiting(true), 3500);
    const removeTimer = setTimeout(() => onDismiss(banner.id), 4000);
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, [banner.id, onDismiss]);

  const isIn = banner.status === 'in';
  const isGuest = banner.type === 'guest';

  const bgColor = isGuest ? 'bg-amber-900/95 border-amber-500/50' :
                  isIn ? 'bg-emerald-900/95 border-emerald-500/50' :
                         'bg-red-900/95 border-red-500/50';

  const statusText = isGuest ? 'Visitor Detected' :
                     isIn ? 'Welcome! Clocked In' : 'Goodbye! Clocked Out';

  const imgSrc = banner.imageUrl && banner.imageUrl !== 'placeholder'
    ? (banner.imageUrl.startsWith('/') ? `${API_BASE}${banner.imageUrl}` : banner.imageUrl)
    : null;

  return (
    <div className={`flex items-center gap-4 px-6 py-4 border-b backdrop-blur-md shadow-2xl
      transition-all duration-500 w-full
      ${bgColor} ${exiting ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}`}>
      {imgSrc ? (
        <img src={imgSrc} alt={banner.name} className="w-16 h-16 rounded-full object-cover border-2 border-white/30 shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center border-2 border-white/30 shrink-0">
          <span className="material-symbols-outlined text-slate-400 text-2xl">person</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-lg truncate">{banner.name}</p>
        <p className={`text-sm font-bold uppercase tracking-wider ${
          isGuest ? 'text-amber-400' : isIn ? 'text-emerald-400' : 'text-red-400'
        }`}>{statusText}</p>
      </div>
      <div className="text-right shrink-0">
        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${
          isGuest ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
        }`}>{banner.type === 'guest' ? 'Guest' : 'Employee'}</span>
        <p className="text-white/60 text-xs font-mono mt-1">{banner.confidence.toFixed(1)}%</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite CameraStationPage.tsx**

Major changes to `frontend/src/pages/CameraStationPage.tsx`:

**Imports:** Replace `RecognitionToast, ToastData` with `RecognitionBanner, BannerData`. Remove the toast import.

**State changes:**
- Replace `toasts: ToastData[]` with `banners: BannerData[]`
- Add: `const [currentTime, setCurrentTime] = useState(new Date())`
- Add: `const [isIdle, setIsIdle] = useState(false)`
- Add: `const [isMuted, setIsMuted] = useState(true)`
- Add: `const idleTimerRef = useRef<number>(0)`
- Add: `const audioCtxRef = useRef<AudioContext | null>(null)`

**Clock:** useEffect with `setInterval(() => setCurrentTime(new Date()), 1000)`.

**Idle state:** Track time since last face activity:
```typescript
const handleFeedbackChange = useCallback((feedback: string) => {
    if (feedback !== 'idle') {
        setIsIdle(false);
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = window.setTimeout(() => setIsIdle(true), 10000);
    }
}, []);
```
Start the idle timer on mount. Clear on face activity.

**Audio:**
```typescript
const playTone = useCallback((frequency: number, duration: number) => {
    if (isMuted) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
}, [isMuted]);
```

Unlock AudioContext on first user interaction (key submit or scan toggle).

**handleResult:** Same logic as current, but:
- Use `BannerData` instead of `ToastData`
- Queue banners (max 3 visible, rest wait)
- Call `playTone(880, 0.15)` for clock-in, `playTone(440, 0.2)` for clock-out

**Header JSX:** Add clock, "FSUU" branding, mute toggle button.

**Camera feed section:**
- Pass `onFeedbackChange={handleFeedbackChange}` to CameraFeed
- Replace toast stack with banner stack at the top of the feed area
- Add idle overlay when `isIdle` is true

- [ ] **Step 3: Delete RecognitionToast.tsx**

```bash
rm frontend/src/components/RecognitionToast.tsx
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RecognitionBanner.tsx frontend/src/pages/CameraStationPage.tsx
git rm frontend/src/components/RecognitionToast.tsx
git commit -m "feat: kiosk polish — recognition banners, clock, idle state, audio feedback"
```

---

## Task 6: Cleanup + Integration Verification

**Files:** Various

- [ ] **Step 1: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Fix any errors.

- [ ] **Step 2: Verify backend imports**

```bash
cd backend && .venv/bin/python -c "from app import app; print('OK')"
```

- [ ] **Step 3: Verify no dangling imports**

```bash
grep -r "RecognitionToast" frontend/src/ --include="*.tsx" --include="*.ts"
```

Should return no results.

- [ ] **Step 4: Final commit if needed**

```bash
git add -A && git commit -m "chore: cleanup dangling imports and type errors"
```

---

## Task Dependencies

```
Task 1 (backend) ──→ Task 2 (visitors + employee page)
                 ──→ Task 4 (dashboard)

Task 3 (camera reliability) ──→ Task 5 (kiosk polish)

Task 6 (cleanup) ── after all others
```

Tasks 1+2 and Tasks 3 can run in parallel. Task 4 depends on Task 1. Task 5 depends on Task 3. Task 6 is last.
