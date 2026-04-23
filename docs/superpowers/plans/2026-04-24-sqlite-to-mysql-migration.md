# SQLite to MySQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite with MySQL across the entire backend database layer.

**Architecture:** Swap `sqlite3` for `mysql-connector-python` with connection pooling. Convert all raw SQL queries from SQLite dialect to MySQL dialect. Add MySQL 8.0 container to Docker Compose.

**Tech Stack:** Python 3.11, mysql-connector-python, MySQL 8.0, Docker Compose

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/requirements.txt` | Modify | Add mysql-connector-python |
| `backend/config.py` | Modify | Replace DB_PATH with DB_HOST/PORT/USER/PASSWORD/NAME |
| `backend/database/connection.py` | Rewrite | MySQL connection pool + schema init |
| `backend/database/users.py` | Modify | Convert all queries to MySQL syntax |
| `backend/database/access_logs.py` | Modify | Convert all queries + date functions |
| `backend/database/cameras.py` | Modify | Convert all queries |
| `backend/database/events.py` | Modify | Convert all queries |
| `backend/database/settings.py` | Modify | Convert all queries + backtick `key` |
| `backend/database/export.py` | Modify | Convert all queries |
| `backend/database/__init__.py` | Modify | Minor — init_db now handles MySQL |
| `backend/start.sh` | Modify | Add MySQL wait loop |
| `docker-compose.yml` | Modify | Add MySQL service, update backend env |

---

### Task 1: Infrastructure — requirements.txt, config.py, docker-compose.yml

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.py`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add mysql-connector-python to requirements.txt**

Add `mysql-connector-python` after `bcrypt` in `backend/requirements.txt`:

```
fastapi
uvicorn[standard]
python-multipart
python-dotenv
insightface==0.7.3
onnxruntime==1.17.1
numpy<2
Pillow
websockets
PyJWT
bcrypt
openpyxl
mysql-connector-python
```

- [ ] **Step 2: Update config.py — replace DB_PATH with MySQL vars**

Replace the entire `backend/config.py` with:

```python
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env')


class Config:
    # Server
    PORT = int(os.getenv('PORT', '5001'))
    HOST = os.getenv('HOST', '0.0.0.0')

    # Database (MySQL)
    DB_HOST = os.getenv('DB_HOST', 'mysql')
    DB_PORT = int(os.getenv('DB_PORT', '3306'))
    DB_USER = os.getenv('DB_USER', 'securesight')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'securesight')
    DB_NAME = os.getenv('DB_NAME', 'securesight')

    # Auth
    ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'securesight2026')
    CAMERA_API_KEY = os.getenv('CAMERA_API_KEY', '')
    JWT_SECRET = os.getenv('JWT_SECRET', '')
    JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', '24'))
```

- [ ] **Step 3: Update docker-compose.yml — add MySQL service, update backend env**

Replace the entire `docker-compose.yml` with:

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: securesight_mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-securesight_root}
      MYSQL_DATABASE: securesight
      MYSQL_USER: securesight
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-securesight}
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD:-securesight_root}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: securesight_api
    ports:
      - "5001:5001"
    restart: unless-stopped
    volumes:
      - avatars-data:/app/avatars
      - snapshots-data:/app/snapshots
      - model-cache:/root/.insightface
    environment:
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_USER=securesight
      - DB_PASSWORD=${MYSQL_PASSWORD:-securesight}
      - DB_NAME=securesight
      - AVATARS_DIR=/app/avatars
      - SNAPSHOTS_DIR=/app/snapshots
      - CORS_ORIGINS=*
      - JWT_SECRET=${JWT_SECRET:-}
      - CAMERA_API_KEY=${CAMERA_API_KEY:-}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-securesight2026}
    depends_on:
      mysql:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')"]
      interval: 15s
      timeout: 5s
      retries: 20
      start_period: 300s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: securesight_web
    ports:
      - "3000:3000"
      - "3443:3443"
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy

  mediamtx:
    image: bluenviron/mediamtx:latest
    container_name: securesight_mediamtx
    ports:
      - "8889:8889"
      - "8189:8189/udp"
      - "9997:9997"
    restart: unless-stopped
    volumes:
      - ./mediamtx.yml:/mediamtx.yml:ro

volumes:
  mysql-data:
  avatars-data:
  snapshots-data:
  model-cache:
```

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt backend/config.py docker-compose.yml
git commit -m "infra: add MySQL service and update config for MySQL migration"
```

---

### Task 2: Connection Layer — connection.py

**Files:**
- Rewrite: `backend/database/connection.py`

- [ ] **Step 1: Rewrite connection.py with MySQL connection pool and schema**

Replace the entire `backend/database/connection.py` with:

```python
import logging
import mysql.connector
from mysql.connector import pooling
from config import Config

logger = logging.getLogger(__name__)

_pool = None


def _get_pool():
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="securesight",
            pool_size=10,
            pool_reset_session=True,
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            database=Config.DB_NAME,
            charset='utf8mb4',
            collation='utf8mb4_general_ci',
            autocommit=False,
        )
    return _pool


def get_connection():
    return _get_pool().get_connection()


def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                face_encoding LONGBLOB,
                image_path VARCHAR(500),
                role VARCHAR(50) DEFAULT 'Employee'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS access_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id VARCHAR(255),
                status VARCHAR(10),
                confidence DOUBLE,
                timestamp DATETIME,
                snapshot_path VARCHAR(500),
                camera_id VARCHAR(255),
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cameras (
                camera_id VARCHAR(255) PRIMARY KEY,
                department VARCHAR(255) NOT NULL,
                last_heartbeat DATETIME,
                is_online TINYINT DEFAULT 0,
                registered_at DATETIME
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS face_embeddings (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id VARCHAR(255) NOT NULL,
                embedding LONGBLOB NOT NULL,
                `condition` VARCHAR(50) DEFAULT 'initial',
                created_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                `key` VARCHAR(255) PRIMARY KEY,
                value TEXT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INT PRIMARY KEY AUTO_INCREMENT,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                location VARCHAR(255),
                start_date DATE NOT NULL,
                end_date DATE,
                start_time VARCHAR(10),
                end_time VARCHAR(10),
                category VARCHAR(100) DEFAULT 'General',
                created_at DATETIME NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # Indexes — MySQL ignores IF NOT EXISTS for indexes, so use a helper
        indexes = [
            ("idx_face_embeddings_user", "face_embeddings", "(user_id)"),
            ("idx_access_logs_user_timestamp", "access_logs", "(user_id, timestamp DESC)"),
            ("idx_access_logs_camera", "access_logs", "(camera_id, timestamp DESC)"),
            ("idx_access_logs_status", "access_logs", "(user_id, status)"),
            ("idx_users_role", "users", "(role)"),
            ("idx_events_start_date", "events", "(start_date)"),
        ]
        for idx_name, table, cols in indexes:
            cursor.execute(f"""
                SELECT COUNT(1) FROM information_schema.statistics
                WHERE table_schema = %s AND table_name = %s AND index_name = %s
            """, (Config.DB_NAME, table, idx_name))
            if cursor.fetchone()[0] == 0:
                cursor.execute(f"CREATE INDEX {idx_name} ON {table} {cols}")

        conn.commit()
        logger.info("MySQL Database Initialized")
    finally:
        cursor.close()
        conn.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/database/connection.py
git commit -m "feat: rewrite connection.py for MySQL connection pooling"
```

---

### Task 3: Settings Module — settings.py

**Files:**
- Modify: `backend/database/settings.py`

- [ ] **Step 1: Convert settings.py to MySQL syntax**

Replace the entire `backend/database/settings.py` with:

```python
import json
from database.connection import get_connection

DEFAULT_SETTINGS = {
    "movement_threshold": 160,
    "still_time_short": 1.0,
    "still_time_long": 2.0,
    "cooldown_seconds": 10,
    "min_face_width": 80,
    "large_face_threshold": 150,
    "match_threshold": 0.45,
    "confidence_floor": 50.0,
    "uncertain_lower": 0.35,
    "uncertain_upper": 0.55,
    "embedding_diversity_min": 0.15,
}


def get_settings():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT value FROM settings WHERE `key` = %s", ("system",))
        row = cursor.fetchone()
        if row:
            stored = json.loads(row["value"])
            return {**DEFAULT_SETTINGS, **stored}
        return dict(DEFAULT_SETTINGS)
    finally:
        cursor.close()
        conn.close()


def update_settings(new_settings):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        current = get_settings()
        for k, default_val in DEFAULT_SETTINGS.items():
            if k in new_settings:
                try:
                    current[k] = type(default_val)(new_settings[k])
                except (TypeError, ValueError):
                    pass
        cursor.execute(
            "REPLACE INTO settings (`key`, value) VALUES (%s, %s)",
            ("system", json.dumps(current))
        )
        conn.commit()
        return current
    finally:
        cursor.close()
        conn.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/database/settings.py
git commit -m "feat: convert settings.py to MySQL syntax"
```

---

### Task 4: Users Module — users.py

**Files:**
- Modify: `backend/database/users.py`

- [ ] **Step 1: Convert users.py to MySQL syntax**

Replace the entire `backend/database/users.py` with:

```python
import datetime
import logging
from database.connection import get_connection

logger = logging.getLogger(__name__)

USER_STATE_CACHE: dict = {}
KNOWN_USERS_CACHE: set = set()

MAX_EMBEDDINGS_PER_USER = 5


def get_user_profile(user_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, name, image_path, role FROM users WHERE id = %s", (user_id,))
        row = cursor.fetchone()
        if row:
            return {"id": row["id"], "name": row["name"], "image_url": row["image_path"], "role": row["role"]}
        return None
    finally:
        cursor.close()
        conn.close()


def get_all_users():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, name, image_path, role FROM users")
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_all_users_with_encodings():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, name, face_encoding, image_path, role FROM users")
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "face_encoding": r["face_encoding"], "image_url": r["image_path"], "role": r["role"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def user_exists(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT 1 FROM users WHERE id = %s", (user_id,))
        return cursor.fetchone() is not None
    finally:
        cursor.close()
        conn.close()


def insert_user(user_id, name, face_encoding_bytes, image_path, role="Employee"):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "REPLACE INTO users (id, name, face_encoding, image_path, role) VALUES (%s, %s, %s, %s, %s)",
            (user_id, name, face_encoding_bytes, image_path, role)
        )
        conn.commit()
        KNOWN_USERS_CACHE.add(user_id)
    finally:
        cursor.close()
        conn.close()
    if face_encoding_bytes:
        add_embedding(user_id, face_encoding_bytes, condition="initial")


def delete_user(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM face_embeddings WHERE user_id = %s", (user_id,))
        cursor.execute("DELETE FROM access_logs WHERE user_id = %s", (user_id,))
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        USER_STATE_CACHE.pop(user_id, None)
        KNOWN_USERS_CACHE.discard(user_id)
    finally:
        cursor.close()
        conn.close()


def update_user(user_id, name=None, role=None):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if name is not None:
            cursor.execute("UPDATE users SET name = %s WHERE id = %s", (name, user_id))
        if role is not None:
            cursor.execute("UPDATE users SET role = %s WHERE id = %s", (role, user_id))
        conn.commit()
        USER_STATE_CACHE.pop(user_id, None)
    finally:
        cursor.close()
        conn.close()


def update_user_face(user_id, face_encoding_bytes, image_path):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET face_encoding = %s, image_path = %s WHERE id = %s",
                        (face_encoding_bytes, image_path, user_id))
        conn.commit()
    finally:
        cursor.close()
        conn.close()
    if face_encoding_bytes:
        add_embedding(user_id, face_encoding_bytes, condition="reface")


def get_user_detail(user_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, name, image_path, role FROM users WHERE id = %s", (user_id,))
        row = cursor.fetchone()
        if not row:
            return None
        cursor.execute("SELECT MIN(timestamp) as ts FROM access_logs WHERE user_id = %s", (user_id,))
        first_seen = cursor.fetchone()["ts"]
        cursor.execute(
            "SELECT status, timestamp, camera_id FROM access_logs WHERE user_id = %s ORDER BY timestamp DESC LIMIT 1",
            (user_id,)
        )
        last_log = cursor.fetchone()
        return {
            "id": row["id"], "name": row["name"], "image_url": row["image_path"], "role": row["role"],
            "first_seen": str(first_seen) if first_seen else None,
            "last_status": last_log["status"] if last_log else None,
            "last_seen": str(last_log["timestamp"]) if last_log else None,
            "last_camera": last_log["camera_id"] if last_log else None,
        }
    finally:
        cursor.close()
        conn.close()


def get_users_with_last_seen(role=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        role_filter = ""
        params = []
        if role and role.lower() != "all":
            role_filter = "WHERE u.role = %s"
            params = [role]
        cursor.execute(f"""
            SELECT u.id, u.name, u.image_path, u.role,
                   a.status as last_status, a.timestamp as last_seen, a.camera_id as last_camera,
                   COALESCE(counts.entries_count, 0) as entries_count,
                   COALESCE(counts.exits_count, 0) as exits_count
            FROM users u
            LEFT JOIN access_logs a ON a.user_id = u.id
                AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
            LEFT JOIN (
                SELECT user_id, SUM(status = 'in') as entries_count, SUM(status = 'out') as exits_count
                FROM access_logs GROUP BY user_id
            ) counts ON counts.user_id = u.id
            {role_filter}
            ORDER BY u.name
        """, params)
        rows = cursor.fetchall()
        return [{
            "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
            "last_status": r["last_status"], "last_seen": str(r["last_seen"]) if r["last_seen"] else None,
            "last_camera": r["last_camera"],
            "entries_count": int(r["entries_count"]), "exits_count": int(r["exits_count"])
        } for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_all_embeddings():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT fe.user_id, fe.embedding, u.name, u.image_path, u.role
            FROM face_embeddings fe
            JOIN users u ON fe.user_id = u.id
            ORDER BY fe.user_id, fe.created_at DESC
        """)
        rows = cursor.fetchall()
        return [{"user_id": r["user_id"], "embedding": bytes(r["embedding"]), "name": r["name"], "image_url": r["image_path"], "role": r["role"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def add_embedding(user_id, embedding_bytes, condition="auto"):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    try:
        cursor.execute(
            "SELECT COUNT(*) as c FROM face_embeddings WHERE user_id = %s", (user_id,)
        )
        count = cursor.fetchone()["c"]
        if count >= MAX_EMBEDDINGS_PER_USER:
            cursor.execute(
                "SELECT id FROM face_embeddings WHERE user_id = %s ORDER BY created_at ASC LIMIT 1",
                (user_id,)
            )
            oldest = cursor.fetchone()
            if oldest:
                cursor.execute("DELETE FROM face_embeddings WHERE id = %s", (oldest["id"],))
        cursor.execute(
            "INSERT INTO face_embeddings (user_id, embedding, `condition`, created_at) VALUES (%s, %s, %s, %s)",
            (user_id, embedding_bytes, condition, now)
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def get_user_embedding_count(user_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT COUNT(*) as c FROM face_embeddings WHERE user_id = %s", (user_id,))
        return cursor.fetchone()["c"]
    finally:
        cursor.close()
        conn.close()


def get_recent_activity_for_camera(camera_id, minutes=120):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes)).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            SELECT DISTINCT a.user_id, u.name, a.status, a.timestamp
            FROM access_logs a
            JOIN users u ON a.user_id = u.id
            WHERE a.camera_id = %s AND a.timestamp >= %s
            ORDER BY a.timestamp DESC
        """, (camera_id, cutoff))
        rows = cursor.fetchall()
        return [{"user_id": r["user_id"], "name": r["name"], "status": r["status"], "timestamp": str(r["timestamp"])} for r in rows]
    finally:
        cursor.close()
        conn.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/database/users.py
git commit -m "feat: convert users.py to MySQL syntax"
```

---

### Task 5: Cameras Module — cameras.py

**Files:**
- Modify: `backend/database/cameras.py`

- [ ] **Step 1: Convert cameras.py to MySQL syntax**

Replace the entire `backend/database/cameras.py` with:

```python
import datetime
from database.connection import get_connection


def register_camera(camera_id, department):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("SELECT camera_id FROM cameras WHERE camera_id = %s", (camera_id,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("UPDATE cameras SET department = %s, last_heartbeat = %s, is_online = 1 WHERE camera_id = %s", (department, now, camera_id))
        else:
            cursor.execute("INSERT INTO cameras (camera_id, department, last_heartbeat, is_online, registered_at) VALUES (%s, %s, %s, 1, %s)", (camera_id, department, now, now))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def update_camera_heartbeat(camera_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("UPDATE cameras SET last_heartbeat = %s, is_online = 1 WHERE camera_id = %s", (now, camera_id))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def get_all_cameras():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT camera_id, department, last_heartbeat, is_online, registered_at FROM cameras")
        rows = cursor.fetchall()
        return [{"camera_id": r["camera_id"], "department": r["department"],
                 "last_heartbeat": str(r["last_heartbeat"]) if r["last_heartbeat"] else None,
                 "is_online": r["is_online"],
                 "registered_at": str(r["registered_at"]) if r["registered_at"] else None} for r in rows]
    finally:
        cursor.close()
        conn.close()


def mark_camera_offline(camera_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE cameras SET is_online = 0 WHERE camera_id = %s", (camera_id,))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def delete_camera(camera_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM cameras WHERE camera_id = %s", (camera_id,))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def get_offline_cameras(timeout_seconds=30):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=timeout_seconds)).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("SELECT camera_id, department FROM cameras WHERE is_online = 1 AND last_heartbeat < %s", (cutoff,))
        rows = cursor.fetchall()
        return [{"camera_id": r["camera_id"], "department": r["department"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_faces_by_camera(camera_id, limit=50):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT u.id, u.name, u.image_path, u.role, COUNT(a.id) as visit_count,
                   MAX(a.timestamp) as last_seen, MIN(a.timestamp) as first_seen
            FROM access_logs a JOIN users u ON a.user_id = u.id
            WHERE a.camera_id = %s GROUP BY u.id ORDER BY last_seen DESC LIMIT %s
        """, (camera_id, limit))
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
                 "visit_count": r["visit_count"], "last_seen": str(r["last_seen"]) if r["last_seen"] else None,
                 "first_seen": str(r["first_seen"]) if r["first_seen"] else None} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_camera_stats(camera_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        today_start = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d 00:00:00')
        cursor.execute("SELECT COUNT(*) as c FROM access_logs WHERE camera_id = %s", (camera_id,))
        total_scans = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM access_logs WHERE camera_id = %s AND timestamp >= %s", (camera_id, today_start))
        scans_today = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE camera_id = %s", (camera_id,))
        unique_faces = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE camera_id = %s AND timestamp >= %s", (camera_id, today_start))
        unique_today = cursor.fetchone()["c"]
        cursor.execute("SELECT MAX(timestamp) as ts FROM access_logs WHERE camera_id = %s", (camera_id,))
        last_activity = cursor.fetchone()["ts"]
        return {"camera_id": camera_id, "total_scans": total_scans, "scans_today": scans_today,
                "unique_faces": unique_faces, "unique_faces_today": unique_today,
                "last_activity": str(last_activity) if last_activity else None}
    finally:
        cursor.close()
        conn.close()


def get_camera_activity(camera_id, limit=20):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.snapshot_path,
                   COALESCE(u.name, 'Unknown') as name, u.image_path, COALESCE(u.role, 'Guest') as role
            FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
            WHERE a.camera_id = %s ORDER BY a.timestamp DESC LIMIT %s
        """, (camera_id, limit))
        rows = cursor.fetchall()
        return [{"id": r["id"], "user_id": r["user_id"], "status": r["status"], "confidence": r["confidence"],
                 "timestamp": str(r["timestamp"]) if r["timestamp"] else None, "snapshot_path": r["snapshot_path"],
                 "name": r["name"], "image_url": r["image_path"], "role": r["role"]} for r in rows]
    finally:
        cursor.close()
        conn.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/database/cameras.py
git commit -m "feat: convert cameras.py to MySQL syntax"
```

---

### Task 6: Events Module — events.py

**Files:**
- Modify: `backend/database/events.py`

- [ ] **Step 1: Convert events.py to MySQL syntax**

Replace the entire `backend/database/events.py` with:

```python
import datetime
from database.connection import get_connection


def get_all_events():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM events ORDER BY start_date ASC, start_time ASC")
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


def get_event_by_id(event_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM events WHERE id = %s", (event_id,))
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()


def create_event(title, description, location, start_date, end_date, start_time, end_time, category):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        now = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            """INSERT INTO events (title, description, location, start_date, end_date, start_time, end_time, category, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (title, description or '', location or '', start_date, end_date or start_date,
             start_time or '', end_time or '', category or 'General', now),
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def update_event(event_id, **kwargs):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        fields = []
        values = []
        for key in ('title', 'description', 'location', 'start_date', 'end_date', 'start_time', 'end_time', 'category'):
            if key in kwargs and kwargs[key] is not None:
                fields.append(f"{key} = %s")
                values.append(kwargs[key])
        if not fields:
            return
        values.append(event_id)
        cursor.execute(f"UPDATE events SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def delete_event(event_id):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM events WHERE id = %s", (event_id,))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def bulk_insert_events(events_list):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        now = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        inserted = 0
        for ev in events_list:
            title = str(ev.get('title', '')).strip()
            if not title:
                continue
            cursor.execute(
                """INSERT INTO events (title, description, location, start_date, end_date, start_time, end_time, category, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    title,
                    str(ev.get('description', '')).strip(),
                    str(ev.get('location', '')).strip(),
                    str(ev.get('start_date', '')).strip(),
                    str(ev.get('end_date', '')).strip() or str(ev.get('start_date', '')).strip(),
                    str(ev.get('start_time', '')).strip(),
                    str(ev.get('end_time', '')).strip(),
                    str(ev.get('category', 'General')).strip() or 'General',
                    now,
                ),
            )
            inserted += 1
        conn.commit()
        return inserted
    finally:
        cursor.close()
        conn.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/database/events.py
git commit -m "feat: convert events.py to MySQL syntax"
```

---

### Task 7: Export Module — export.py

**Files:**
- Modify: `backend/database/export.py`

- [ ] **Step 1: Convert export.py to MySQL syntax**

Replace the entire `backend/database/export.py` with:

```python
from database.connection import get_connection


def export_attendance(date_from=None, date_to=None, camera_id=None, role=None, user_id=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = [], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        if camera_id: conditions.append("a.camera_id = %s"); params.append(camera_id)
        if role and role.lower() != "all": conditions.append("u.role = %s"); params.append(role)
        if user_id: conditions.append("(a.user_id = %s OR u.name LIKE %s)"); params.extend([user_id, f"%{user_id}%"])
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        cursor.execute(f"""
            SELECT a.timestamp, a.user_id, u.name, u.role, a.status, a.confidence, a.camera_id
            FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
            {where} ORDER BY a.timestamp DESC
        """, params)
        rows = cursor.fetchall()
        return [{"timestamp": str(r["timestamp"]) if r["timestamp"] else None, "user_id": r["user_id"],
                 "name": r["name"], "role": r["role"], "status": r["status"], "confidence": r["confidence"],
                 "camera_id": r["camera_id"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def export_visitors(date_from=None, date_to=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = ["u.role = 'Guest'"], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        where = "WHERE " + " AND ".join(conditions)
        cursor.execute(f"""
            SELECT u.id, u.name, MIN(a.timestamp) as first_seen, MAX(a.timestamp) as last_seen, COUNT(a.id) as total_visits
            FROM users u LEFT JOIN access_logs a ON a.user_id = u.id
            {where} GROUP BY u.id ORDER BY last_seen DESC
        """, params)
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"],
                 "first_seen": str(r["first_seen"]) if r["first_seen"] else None,
                 "last_seen": str(r["last_seen"]) if r["last_seen"] else None,
                 "total_visits": r["total_visits"]} for r in rows]
    finally:
        cursor.close()
        conn.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/database/export.py
git commit -m "feat: convert export.py to MySQL syntax"
```

---

### Task 8: Access Logs Module — access_logs.py (the biggest file)

**Files:**
- Modify: `backend/database/access_logs.py`

- [ ] **Step 1: Convert access_logs.py to MySQL syntax**

Replace the entire `backend/database/access_logs.py` with:

```python
import datetime
import logging
from database.connection import get_connection
from database.users import USER_STATE_CACHE, KNOWN_USERS_CACHE, get_user_profile

logger = logging.getLogger(__name__)


def auto_clock_out_stale():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        today_midnight = datetime.datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).strftime('%Y-%m-%d %H:%M:%S')
        now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            SELECT u.id
            FROM users u
            JOIN access_logs a ON a.user_id = u.id
                AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
            WHERE a.status = 'in' AND a.timestamp < %s
        """, (today_midnight,))
        rows = cursor.fetchall()
        clocked_out = []
        for r in rows:
            uid = r["id"]
            cursor.execute(
                "SELECT 1 FROM access_logs WHERE user_id = %s AND camera_id = 'system-auto' AND timestamp >= %s",
                (uid, today_midnight)
            )
            if cursor.fetchone():
                continue
            cursor.execute(
                "INSERT INTO access_logs (user_id, status, confidence, timestamp, snapshot_path, camera_id) VALUES (%s, 'out', 100.0, %s, NULL, 'system-auto')",
                (uid, now)
            )
            USER_STATE_CACHE[uid] = 'out'
            clocked_out.append(uid)
        if clocked_out:
            conn.commit()
            logger.info("Auto clock-out: %d users (last in before %s)", len(clocked_out), today_midnight)
        return clocked_out
    finally:
        cursor.close()
        conn.close()


def get_last_status(user_id):
    if user_id in USER_STATE_CACHE:
        return USER_STATE_CACHE[user_id]
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT status FROM access_logs WHERE user_id = %s ORDER BY timestamp DESC LIMIT 1",
            (user_id,)
        )
        row = cursor.fetchone()
        return row["status"] if row else None
    finally:
        cursor.close()
        conn.close()


def log_access_attempt(user_id, status_type, confidence, snapshot_path=None, camera_id=None):
    final_status = status_type
    if user_id:
        if user_id not in KNOWN_USERS_CACHE:
            existing = get_user_profile(user_id)
            if existing:
                KNOWN_USERS_CACHE.add(user_id)
        last = get_last_status(user_id)
        final_status = ('out' if last == 'in' else 'in') if last else 'in'
        USER_STATE_CACHE[user_id] = final_status
    else:
        final_status = 'in'

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO access_logs (user_id, status, confidence, timestamp, snapshot_path, camera_id) VALUES (%s, %s, %s, %s, %s, %s)",
            (user_id, final_status, float(confidence), datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S'), snapshot_path, camera_id)
        )
        conn.commit()
        logger.info("Logged: %s (%s)", user_id, final_status.upper())
        return final_status
    finally:
        cursor.close()
        conn.close()


def get_access_logs(limit=50):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.snapshot_path, a.camera_id,
                   u.name, u.image_path, u.role
            FROM access_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.timestamp DESC
            LIMIT %s
        """, (limit,))
        rows = cursor.fetchall()
        return [{
            "id": r["id"], "user_id": r["user_id"], "status": r["status"],
            "confidence": r["confidence"], "timestamp": str(r["timestamp"]) if r["timestamp"] else None,
            "snapshot_path": r["snapshot_path"], "camera_id": r["camera_id"],
            "name": r["name"], "image_url": r["image_path"], "role": r["role"]
        } for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_stats():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT COUNT(*) as c FROM access_logs")
        total = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id WHERE u.role = 'Employee'")
        employees = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id WHERE u.role = 'Guest'")
        guests = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM cameras WHERE is_online = 1")
        cameras_online = cursor.fetchone()["c"]
        return {"total_scans": total, "employee_matches": employees, "guest_alerts": guests, "cameras_online": cameras_online}
    finally:
        cursor.close()
        conn.close()


def get_today_stats():
    auto_clock_out_stale()
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        today_start = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d 00:00:00')
        cursor.execute("SELECT COUNT(*) as c FROM access_logs WHERE timestamp >= %s", (today_start,))
        scans = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE timestamp >= %s", (today_start,))
        unique = cursor.fetchone()["c"]
        cursor.execute("""
            SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
            JOIN users u ON a.user_id = u.id WHERE a.timestamp >= %s AND u.role = 'Employee'
        """, (today_start,))
        emp_in = cursor.fetchone()["c"]
        cursor.execute("""
            SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a
            JOIN users u ON a.user_id = u.id WHERE a.timestamp >= %s AND u.role = 'Guest'
        """, (today_start,))
        guest_in = cursor.fetchone()["c"]
        on_site = len(get_active_users())
        return {"scans_today": scans, "unique_people_today": unique, "employees_in_today": emp_in, "guests_today": guest_in, "currently_on_site": on_site}
    finally:
        cursor.close()
        conn.close()


def get_active_users():
    auto_clock_out_stale()
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT u.id, u.name, u.image_path, u.role, a.timestamp as clock_in_time, a.camera_id
            FROM users u
            JOIN access_logs a ON a.user_id = u.id
                AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
            WHERE a.status = 'in'
            ORDER BY a.timestamp DESC
        """)
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
                 "clock_in_time": str(r["clock_in_time"]) if r["clock_in_time"] else None, "camera_id": r["camera_id"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_inactive_users():
    auto_clock_out_stale()
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT u.id, u.name, u.image_path, u.role,
                   a.timestamp as last_seen, a.camera_id, a.status as last_status
            FROM users u
            LEFT JOIN access_logs a ON a.user_id = u.id
                AND a.timestamp = (SELECT MAX(timestamp) FROM access_logs WHERE user_id = u.id)
            WHERE a.status IS NULL OR a.status = 'out'
            ORDER BY u.name
        """)
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
                 "last_seen": str(r["last_seen"]) if r["last_seen"] else None, "camera_id": r["camera_id"],
                 "last_status": r["last_status"]} for r in rows]
    finally:
        cursor.close()
        conn.close()


def get_attendance_logs(page=1, per_page=50, date_from=None, date_to=None, camera_id=None, user_id=None, status=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = [], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        if camera_id: conditions.append("a.camera_id = %s"); params.append(camera_id)
        if user_id: conditions.append("a.user_id = %s"); params.append(user_id)
        if status: conditions.append("a.status = %s"); params.append(status)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        offset = (page - 1) * per_page
        cursor.execute(f"SELECT COUNT(*) as c FROM access_logs a {where}", params)
        total = cursor.fetchone()["c"]
        cursor.execute(f"""
            SELECT a.id, a.user_id, a.status, a.confidence, a.timestamp, a.camera_id,
                   COALESCE(u.name, 'Deleted User') as name, u.image_path, COALESCE(u.role, 'Unknown') as role
            FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
            {where} ORDER BY a.timestamp DESC LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        rows = cursor.fetchall()
        return {"total": total, "page": page, "per_page": per_page, "items": [{
            "id": r["id"], "user_id": r["user_id"], "status": r["status"], "confidence": r["confidence"],
            "timestamp": str(r["timestamp"]) if r["timestamp"] else None, "camera_id": r["camera_id"],
            "name": r["name"], "image_url": r["image_path"], "role": r["role"]
        } for r in rows]}
    finally:
        cursor.close()
        conn.close()


def get_user_attendance(user_id, limit=100):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, status, confidence, timestamp, camera_id
            FROM access_logs WHERE user_id = %s ORDER BY timestamp ASC
        """, (user_id,))
        rows = cursor.fetchall()
        sessions, pending_in = [], None
        for r in rows:
            if r["status"] == "in":
                pending_in = {"time_in": str(r["timestamp"]), "camera_in": r["camera_id"], "confidence": r["confidence"]}
            elif r["status"] == "out" and pending_in:
                duration = None
                try:
                    t_in = datetime.datetime.fromisoformat(pending_in["time_in"])
                    t_out = r["timestamp"] if isinstance(r["timestamp"], datetime.datetime) else datetime.datetime.fromisoformat(str(r["timestamp"]))
                    duration = int((t_out - t_in).total_seconds())
                except Exception:
                    pass
                sessions.append({"time_in": pending_in["time_in"], "time_out": str(r["timestamp"]),
                                 "camera_in": pending_in["camera_in"], "camera_out": r["camera_id"],
                                 "confidence": pending_in["confidence"], "duration_seconds": duration})
                pending_in = None
        if pending_in:
            sessions.append({"time_in": pending_in["time_in"], "time_out": None, "camera_in": pending_in["camera_in"],
                             "camera_out": None, "confidence": pending_in["confidence"], "duration_seconds": None})
        sessions.reverse()
        return sessions[:limit]
    finally:
        cursor.close()
        conn.close()


def get_visitors_aggregated(page=1, per_page=50, date_from=None, date_to=None, search=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = ["u.role = 'Guest'"], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        if search: conditions.append("(u.name LIKE %s OR u.id LIKE %s)"); params.extend([f"%{search}%", f"%{search}%"])
        where = "WHERE " + " AND ".join(conditions)
        offset = (page - 1) * per_page
        cursor.execute(f"SELECT COUNT(DISTINCT u.id) as c FROM users u LEFT JOIN access_logs a ON a.user_id = u.id {where}", params)
        total = cursor.fetchone()["c"]
        cursor.execute(f"""
            SELECT u.id, u.name, u.image_path, MIN(a.timestamp) as first_seen, MAX(a.timestamp) as last_seen,
                   COUNT(a.id) as total_visits,
                   SUM(CASE WHEN a.status = 'in' THEN 1 ELSE 0 END) as entries_count,
                   SUM(CASE WHEN a.status = 'out' THEN 1 ELSE 0 END) as exits_count,
                   (SELECT camera_id FROM access_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as last_camera,
                   (SELECT status FROM access_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as last_status
            FROM users u LEFT JOIN access_logs a ON a.user_id = u.id {where}
            GROUP BY u.id ORDER BY last_seen DESC LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        rows = cursor.fetchall()
        return {"total": total, "page": page, "per_page": per_page, "items": [{
            "id": r["id"], "name": r["name"], "image_url": r["image_path"],
            "first_seen": str(r["first_seen"]) if r["first_seen"] else None,
            "last_seen": str(r["last_seen"]) if r["last_seen"] else None,
            "total_visits": r["total_visits"],
            "entries_count": int(r["entries_count"] or 0), "exits_count": int(r["exits_count"] or 0),
            "last_camera": r["last_camera"], "last_status": r["last_status"]
        } for r in rows]}
    finally:
        cursor.close()
        conn.close()


def get_hourly_stats(date_from=None, date_to=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = [], []
        if date_from: conditions.append("timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("timestamp <= %s"); params.append(date_to)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        cursor.execute(f"""
            SELECT DATE_FORMAT(timestamp, '%%Y-%%m-%%d %%H:00') as hour, COUNT(*) as scans,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   SUM(CASE WHEN status = 'out' THEN 1 ELSE 0 END) as exits
            FROM access_logs {where} GROUP BY hour ORDER BY hour DESC LIMIT 168
        """, params)
        rows = cursor.fetchall()
        return [{"hour": r["hour"], "scans": r["scans"], "entries": int(r["entries"] or 0), "exits": int(r["exits"] or 0)} for r in reversed(rows)]
    finally:
        cursor.close()
        conn.close()


def get_stats_for_range(date_from=None, date_to=None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conditions, params = [], []
        if date_from: conditions.append("a.timestamp >= %s"); params.append(date_from)
        if date_to: conditions.append("a.timestamp <= %s"); params.append(date_to)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        role_join = f"{where}{' AND ' if conditions else ' WHERE '}"
        cursor.execute(f"SELECT COUNT(*) as c FROM access_logs a {where}", params)
        total = cursor.fetchone()["c"]
        cursor.execute(f"SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id {role_join}u.role = 'Employee'", params)
        employees = cursor.fetchone()["c"]
        cursor.execute(f"SELECT COUNT(*) as c FROM access_logs a JOIN users u ON a.user_id = u.id {role_join}u.role = 'Guest'", params)
        guests = cursor.fetchone()["c"]
        cursor.execute(f"SELECT COUNT(DISTINCT a.user_id) as c FROM access_logs a {where}", params)
        unique = cursor.fetchone()["c"]
        return {"total_scans": total, "employee_matches": employees, "guest_alerts": guests, "unique_people": unique}
    finally:
        cursor.close()
        conn.close()


def get_analytics(days=30):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')

        cursor.execute("""
            SELECT HOUR(timestamp) as hour,
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   SUM(CASE WHEN status = 'out' THEN 1 ELSE 0 END) as exits
            FROM access_logs WHERE timestamp >= %s
            GROUP BY hour ORDER BY hour
        """, (cutoff,))
        peak_hours = cursor.fetchall()
        peak_hours_data = [{"hour": r["hour"], "total": r["total"], "entries": int(r["entries"] or 0), "exits": int(r["exits"] or 0)} for r in peak_hours]

        # DAYOFWEEK returns 1=Sunday..7=Saturday; subtract 1 to match 0=Sunday
        cursor.execute("""
            SELECT (DAYOFWEEK(timestamp) - 1) as dow,
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   COUNT(DISTINCT DATE(timestamp)) as num_days
            FROM access_logs WHERE timestamp >= %s
            GROUP BY dow ORDER BY dow
        """, (cutoff,))
        dow_rows = cursor.fetchall()
        day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        dow_data = [{"day": day_names[r["dow"]], "dow": r["dow"], "total": r["total"], "entries": int(r["entries"] or 0),
                     "avg": round(r["total"] / max(r["num_days"], 1), 1)} for r in dow_rows]

        cursor.execute("""
            SELECT DATE(timestamp) as day,
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   SUM(CASE WHEN status = 'out' THEN 1 ELSE 0 END) as exits,
                   COUNT(DISTINCT user_id) as unique_people
            FROM access_logs WHERE timestamp >= %s
            GROUP BY day ORDER BY day
        """, (cutoff,))
        daily_rows = cursor.fetchall()
        daily_data = [{"day": str(r["day"]), "total": r["total"], "entries": int(r["entries"] or 0),
                       "exits": int(r["exits"] or 0), "unique_people": r["unique_people"]} for r in daily_rows]

        cursor.execute("""
            SELECT a.camera_id, COALESCE(c.department, a.camera_id) as department,
                   COUNT(*) as total,
                   SUM(CASE WHEN a.status = 'in' THEN 1 ELSE 0 END) as entries,
                   COUNT(DISTINCT a.user_id) as unique_people
            FROM access_logs a LEFT JOIN cameras c ON a.camera_id = c.camera_id
            WHERE a.timestamp >= %s AND a.camera_id IS NOT NULL
            GROUP BY a.camera_id ORDER BY total DESC
        """, (cutoff,))
        camera_rows = cursor.fetchall()
        camera_data = [{"camera_id": r["camera_id"], "department": r["department"], "total": r["total"],
                        "entries": int(r["entries"] or 0), "unique_people": r["unique_people"]} for r in camera_rows]

        cursor.execute("""
            SELECT COALESCE(u.role, 'Unknown') as role, COUNT(*) as total,
                   COUNT(DISTINCT a.user_id) as unique_people
            FROM access_logs a LEFT JOIN users u ON a.user_id = u.id
            WHERE a.timestamp >= %s
            GROUP BY role
        """, (cutoff,))
        role_rows = cursor.fetchall()
        role_data = [{"role": r["role"], "total": r["total"], "unique_people": r["unique_people"]} for r in role_rows]

        num_days = max(len(daily_data), 1)
        total_scans = sum(d["total"] for d in daily_data)
        total_entries = sum(d["entries"] for d in daily_data)
        cursor.execute("SELECT COUNT(DISTINCT user_id) as c FROM access_logs WHERE timestamp >= %s", (cutoff,))
        total_unique = cursor.fetchone()["c"]

        busiest_hour = max(peak_hours_data, key=lambda x: x["total"])["hour"] if peak_hours_data else 0
        busiest_day = max(dow_data, key=lambda x: x["avg"])["day"] if dow_data else "N/A"

        tomorrow = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)
        tomorrow_dow = int(tomorrow.strftime('%w'))
        cursor.execute("""
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'in' THEN 1 ELSE 0 END) as entries,
                   COUNT(DISTINCT user_id) as unique_people,
                   COUNT(DISTINCT DATE(timestamp)) as num_days
            FROM access_logs
            WHERE (DAYOFWEEK(timestamp) - 1) = %s AND timestamp >= %s
        """, (tomorrow_dow, cutoff))
        hist_row = cursor.fetchone()

        pred_days = max(hist_row["num_days"] or 0, 1)
        prediction = {
            "day_name": day_names[tomorrow_dow],
            "date": tomorrow.strftime('%Y-%m-%d'),
            "expected_scans": round((hist_row["total"] or 0) / pred_days),
            "expected_entries": round((hist_row["entries"] or 0) / pred_days),
            "expected_unique": round((hist_row["unique_people"] or 0) / pred_days),
            "based_on_days": hist_row["num_days"] or 0,
            "confidence": min(round((hist_row["num_days"] or 0) / max(num_days * 0.15, 1) * 100), 100),
        }

        return {
            "summary": {
                "total_scans": total_scans,
                "total_entries": total_entries,
                "total_unique": total_unique,
                "avg_daily_scans": round(total_scans / num_days, 1),
                "avg_daily_entries": round(total_entries / num_days, 1),
                "avg_daily_unique": round(total_unique / num_days, 1) if num_days > 1 else total_unique,
                "busiest_hour": busiest_hour,
                "busiest_day": busiest_day,
                "days_analyzed": num_days,
            },
            "peak_hours": peak_hours_data,
            "day_of_week": dow_data,
            "daily_trend": daily_data,
            "camera_traffic": camera_data,
            "role_breakdown": role_data,
            "prediction": prediction,
        }
    finally:
        cursor.close()
        conn.close()


def global_search(query, limit=20):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        q = f"%{query}%"
        results = []
        cursor.execute("SELECT id, name, image_path, role FROM users WHERE name LIKE %s OR id LIKE %s LIMIT %s", (q, q, limit))
        for r in cursor.fetchall():
            results.append({"type": "person", "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"]})
        cursor.execute("SELECT camera_id, department, is_online FROM cameras WHERE camera_id LIKE %s OR department LIKE %s LIMIT %s", (q, q, limit))
        for r in cursor.fetchall():
            results.append({"type": "camera", "id": r["camera_id"], "name": r["department"], "is_online": r["is_online"]})
        return results[:limit]
    finally:
        cursor.close()
        conn.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/database/access_logs.py
git commit -m "feat: convert access_logs.py to MySQL syntax"
```

---

### Task 9: __init__.py and start.sh

**Files:**
- Modify: `backend/database/__init__.py`
- Modify: `backend/start.sh`

- [ ] **Step 1: Update __init__.py — no changes needed to imports, just confirm it works**

The `__init__.py` calls `init_db()` and `auto_clock_out_stale()` on import. Since `connection.py` now returns MySQL connections and all modules use the new cursor pattern, this should work without changes. No edit needed.

- [ ] **Step 2: Update start.sh — add MySQL wait loop before model download**

Replace the entire `backend/start.sh` with:

```sh
#!/bin/sh

# Wait for MySQL to be ready
echo "Waiting for MySQL..."
python -c "
import time, mysql.connector
for i in range(30):
    try:
        conn = mysql.connector.connect(
            host='${DB_HOST:-mysql}',
            port=int('${DB_PORT:-3306}'),
            user='${DB_USER:-securesight}',
            password='${DB_PASSWORD:-securesight}',
            database='${DB_NAME:-securesight}',
        )
        conn.close()
        print('MySQL is ready!')
        break
    except Exception as e:
        print(f'MySQL not ready (attempt {i+1}/30): {e}')
        time.sleep(2)
else:
    print('WARNING: Could not connect to MySQL after 60 seconds')
"

# Download InsightFace model if needed
python -c "
import os, time, shutil, insightface

model_dir = os.path.expanduser('~/.insightface/models/antelopev2')
zip_path = os.path.expanduser('~/.insightface/models/antelopev2.zip')

def fix_nesting():
    nested = os.path.join(model_dir, 'antelopev2')
    if os.path.isdir(nested) and any(f.endswith('.onnx') for f in os.listdir(nested)):
        for f in os.listdir(nested):
            shutil.move(os.path.join(nested, f), os.path.join(model_dir, f))
        os.rmdir(nested)
        print('Fixed nested antelopev2 directory')

def model_ready():
    fix_nesting()
    return os.path.isdir(model_dir) and len([f for f in os.listdir(model_dir) if f.endswith('.onnx')]) >= 4

if not model_ready():
    for attempt in range(5):
        print(f'Downloading antelopev2 model (attempt {attempt + 1}/5)...')
        if os.path.exists(zip_path):
            os.remove(zip_path)
        if os.path.isdir(model_dir):
            shutil.rmtree(model_dir)
        try:
            app = insightface.app.FaceAnalysis(name='antelopev2', providers=['CPUExecutionProvider'])
            app.prepare(ctx_id=-1, det_size=(640, 640))
            print('Model downloaded successfully')
            break
        except Exception as e:
            print(f'Download failed: {e}')
            if attempt < 4:
                print('Retrying in 5 seconds...')
                time.sleep(5)
            else:
                print('WARNING: Could not download model after 5 attempts.')
else:
    print('Model already cached')
"
exec uvicorn app:app --host 0.0.0.0 --port 5001
```

- [ ] **Step 3: Commit**

```bash
git add backend/database/__init__.py backend/start.sh
git commit -m "feat: add MySQL wait loop to start.sh"
```

---

### Task 10: Smoke Test — Build and Verify

- [ ] **Step 1: Stop existing containers and remove old volumes**

```bash
docker compose down -v
```

- [ ] **Step 2: Rebuild and start all services**

```bash
docker compose up --build -d
```

- [ ] **Step 3: Verify MySQL is running**

```bash
docker exec securesight_mysql mysqladmin ping -u root -psecuresight_root
```

Expected: `mysqld is alive`

- [ ] **Step 4: Verify tables were created**

```bash
docker exec securesight_mysql mysql -u securesight -psecuresight securesight -e "SHOW TABLES;"
```

Expected output should list: `access_logs`, `cameras`, `events`, `face_embeddings`, `settings`, `users`

- [ ] **Step 5: Verify backend health**

```bash
curl http://localhost:5001/health
```

Expected: `200 OK`

- [ ] **Step 6: Check backend logs for errors**

```bash
docker logs securesight_api 2>&1 | tail -20
```

Expected: `MySQL Database Initialized` and `Uvicorn running on http://0.0.0.0:5001`

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete SQLite to MySQL migration"
```
