<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-11 | Updated: 2026-03-11 -->

# components

## Purpose
React UI components for camera feed, dashboard, employee registration, navigation, and result display.

## Key Files

| File | Description |
|------|-------------|
| `CameraFeed.tsx` | Live video with MediaPipe face detection, stillness tracking, and face capture. Sends to configurable backend via `API_BASE`. Accepts optional `cameraId` prop. |
| `DashboardTab.tsx` | WebSocket-driven dashboard with `useDashboardWebSocket` hook — live stats, camera status grid, recent detections table |
| `AddEmployeeTab.tsx` | Employee registration form with webcam capture, file upload, sends to `API_BASE` |
| `ResultModal.tsx` | Modal overlay displaying recognition results with employee/guest classification |
| `Sidebar.tsx` | React Router-based navigation sidebar with `<Link>` components and `useLocation()` for active state |
| `Header.tsx` | Top navigation bar for admin dashboard |

## For AI Agents

### Working In This Directory
- Each component is a single file
- `CameraFeed.tsx` uses bundled MediaPipe WASM (no CDN) from `/mediapipe-wasm/` and `/models/`
- `DashboardTab.tsx` connects to `WS_BASE/ws/dashboard` via WebSocket with auto-reconnect
- `Sidebar.tsx` uses React Router `<Link>` and `useLocation()` — no more `activeTab`/`setActiveTab` props
- All API calls use `API_BASE` from `../config.ts` (not hardcoded localhost)

### Key Interactions
- Camera station: `CameraFeed` → captures face → POST to backend → `ResultModal` (auto-dismiss 5s)
- Dashboard: WebSocket → `useDashboardWebSocket` hook → stats, cameras, detections state
- Registration: `AddEmployeeTab` → POST to backend `/api/employees/add`
- Navigation: `Sidebar` `<Link>` → React Router → renders matching `<Route>` in MainApp

## Dependencies

### Internal
- `../config.ts` — `API_BASE`, `WS_BASE`
- `../types.ts` — `AccessLog` interface

### External
- `@mediapipe/tasks-vision` — Face detection in `CameraFeed.tsx` (bundled WASM)
- `react-router-dom` — Navigation in `Sidebar.tsx`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
