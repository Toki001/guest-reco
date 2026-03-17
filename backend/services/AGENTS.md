<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-11 | Updated: 2026-03-11 -->

# services

## Purpose
Standalone utility scripts for batch face enrollment and data management. These run independently from the main API server.

## Key Files

| File | Description |
|------|-------------|
| `batch_image_uplaod.py` | Bulk-indexes images from `employee_images/` folder (legacy, needs update for local face_recognition) |
| `upload.py` | Single employee face upload utility (legacy, needs update) |
| `update_api_id.py` | Updates a face record (legacy, needs update) |

## For AI Agents

### Working In This Directory
- These scripts still reference the old AWS/Supabase APIs and need updating to use the new `face_engine.py` and `database.py`
- Note the typo in `batch_image_uplaod.py` filename — preserve unless explicitly asked to rename
- Run individually with `python <script>.py`

## Dependencies

### Internal
- `../config.py` — Configuration
- `../face_engine.py` — Local face encoding (after migration)
- `../database.py` — SQLite database operations (after migration)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
