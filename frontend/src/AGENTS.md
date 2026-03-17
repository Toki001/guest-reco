<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-11 | Updated: 2026-03-11 -->

# src

## Purpose
Core application source with React Router-based mode routing, shared config, type definitions, and page components.

## Key Files

| File | Description |
|------|-------------|
| `index.tsx` | React entry point — wraps App in BrowserRouter |
| `App.tsx` | Top-level router: `/camera/:cameraId` → CameraStationPage, `/*` → MainApp |
| `config.ts` | Shared API configuration — exports `API_BASE` and `WS_BASE` |
| `types.ts` | TypeScript interfaces: `UserProfile`, `AccessLog`, `CameraStats` |
| `vite-env.d.ts` | Vite client type definitions |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `pages/` | Page-level components: CameraStationPage, MainApp |
| `components/` | Reusable UI components (see `components/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- `App.tsx` uses React Router `<Routes>` for mode selection
- Camera stations render `CameraStationPage` (fullscreen, no sidebar)
- Admin views render `MainApp` (sidebar + nested routes for dashboard/add-employee)
- `config.ts` derives API_BASE from `VITE_API_URL` env var or `window.location.origin`
- No state management library — React hooks with prop drilling

### Common Patterns
- Functional components with hooks
- URL-based routing instead of tab state
- WebSocket hook (`useDashboardWebSocket`) for real-time dashboard data
- All fetch calls use `API_BASE` from `config.ts`

## Dependencies

### Internal
- `components/` — All UI components
- `pages/` — Page-level route components
- `config.ts` — Shared API/WS base URLs
- `types.ts` — Shared type definitions

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
