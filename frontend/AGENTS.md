<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-11 | Updated: 2026-03-11 -->

# frontend

## Purpose
React + TypeScript SPA that serves two modes via URL routing: camera station mode (`/camera/:id`) for department devices, and admin dashboard mode (`/dashboard`) for monitoring. Built with Vite, styled with Tailwind CSS. MediaPipe WASM bundled locally.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Dependencies: React 19, react-router-dom, MediaPipe (pinned version) |
| `vite.config.ts` | Vite config with React plugin, dev server on port 3000 |
| `tsconfig.json` | TypeScript config targeting ES2022 |
| `index.html` | HTML entry point |
| `Dockerfile` | Container config for frontend |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Application source code (see `src/AGENTS.md`) |
| `public/mediapipe-wasm/` | Bundled MediaPipe WASM files (offline face detection) |
| `public/models/` | Bundled face detection model (blaze_face_short_range.tflite) |

## For AI Agents

### Working In This Directory
- `npm install` after modifying `package.json`
- Dev server on port 3000 with `npm run dev`
- `VITE_API_URL` env var configures backend server address
- No Supabase or cloud dependencies — fully offline
- MediaPipe WASM and model files are bundled in `public/`

### Testing Requirements
- Run: `npm run dev`
- Build: `npm run build`
- TypeScript: `npx tsc --noEmit`

## Dependencies

### External
- `react` 19.x + `react-dom` — UI framework
- `react-router-dom` — URL-based routing for camera/dashboard modes
- `@mediapipe/tasks-vision` 0.10.32 — Client-side face detection (pinned, bundled)
- `vite` 6.x — Build tool

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
