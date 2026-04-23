# SQLite to MySQL Migration Design

## Context

The project currently uses SQLite for all data storage (users, face embeddings, access logs, cameras, events, settings). The university's on-premises server runs MySQL, so the database layer needs to be migrated from SQLite to MySQL 8.0+. This is a MySQL-only migration — no SQLite fallback.

## Approach

Raw SQL conversion (no ORM). Replace `sqlite3` with `mysql-connector-python`, convert SQLite-specific syntax to MySQL equivalents, and add a MySQL container to Docker Compose. Same code structure, different dialect.

## Docker Compose Changes

### New MySQL Service
- Image: `mysql:8.0`
- Named volume: `mysql-data` for persistence
- Environment: `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- Healthcheck: `mysqladmin ping`
- Backend `depends_on` MySQL with `condition: service_healthy`

### Backend Environment Variables
Replace `DB_PATH` with:
- `DB_HOST` (default: `mysql`)
- `DB_PORT` (default: `3306`)
- `DB_USER` (default: `securesight`)
- `DB_PASSWORD` (default: `securesight`)
- `DB_NAME` (default: `securesight`)

### Volume Changes
- Remove `recognition-data` volume (no more SQLite file)
- Add `mysql-data` volume

## Connection Layer (`connection.py`)

- Replace `sqlite3` with `mysql.connector.pooling.MySQLConnectionPool`
- Pool size: 10 connections
- `get_connection()` returns a connection from the pool
- Use `cursor(dictionary=True)` for dict-like row access (replaces `sqlite3.Row`)
- Remove: WAL mode, `check_same_thread`, `row_factory`, `PRAGMA` statements, thread-local storage
- Foreign keys enforced by InnoDB engine by default

## SQL Syntax Conversion

| SQLite | MySQL |
|--------|-------|
| `AUTOINCREMENT` | `AUTO_INCREMENT` |
| `TEXT` (for dates) | `DATETIME` or `VARCHAR` |
| `BLOB` | `LONGBLOB` |
| `strftime('%H', timestamp)` | `HOUR(timestamp)` |
| `strftime('%w', timestamp)` | `DAYOFWEEK(timestamp) - 1` |
| `strftime('%Y-%m-%d %H:00', ts)` | `DATE_FORMAT(ts, '%Y-%m-%d %H:00')` |
| `date('now', 'localtime', 'start of day')` | `CURDATE()` |
| `COLLATE NOCASE` | Remove (MySQL default collation is case-insensitive) |
| `BEGIN IMMEDIATE` | `START TRANSACTION` |
| `?` placeholders | `%s` placeholders |
| `conn.execute(sql, params)` | `cursor.execute(sql, params)` + `cursor.fetchall()` |

## Schema (MySQL)

```sql
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    face_encoding LONGBLOB,
    image_path VARCHAR(500),
    role VARCHAR(50) DEFAULT 'Employee'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(255),
    status VARCHAR(10),
    confidence DOUBLE,
    timestamp DATETIME,
    snapshot_path VARCHAR(500),
    camera_id VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cameras (
    camera_id VARCHAR(255) PRIMARY KEY,
    department VARCHAR(255) NOT NULL,
    last_heartbeat DATETIME,
    is_online TINYINT DEFAULT 0,
    registered_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS face_embeddings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(255) NOT NULL,
    embedding LONGBLOB NOT NULL,
    `condition` VARCHAR(50) DEFAULT 'initial',
    created_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    location VARCHAR(255),
    start_date DATE,
    end_date DATE,
    start_time VARCHAR(10),
    end_time VARCHAR(10),
    category VARCHAR(100) DEFAULT 'general'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Reserved Word Quoting
`condition` and `key` are MySQL reserved words — must use backticks in all queries.

### Indexes
```sql
CREATE INDEX idx_face_embeddings_user ON face_embeddings(user_id);
CREATE INDEX idx_access_logs_user_timestamp ON access_logs(user_id, timestamp DESC);
CREATE INDEX idx_access_logs_camera ON access_logs(camera_id, timestamp DESC);
CREATE INDEX idx_access_logs_status ON access_logs(user_id, status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_events_start_date ON events(start_date);
```

## Files Modified

### Database layer (7 files):
- `database/connection.py` — MySQL connection pool, init_db with MySQL schema
- `database/users.py` — All queries converted to MySQL syntax
- `database/access_logs.py` — All queries converted, strftime → MySQL date functions
- `database/cameras.py` — All queries converted
- `database/events.py` — All queries converted
- `database/settings.py` — All queries converted, backtick `key`
- `database/export.py` — All queries converted

### Infrastructure (4 files):
- `docker-compose.yml` — Add MySQL service, update backend env vars
- `backend/requirements.txt` — Add `mysql-connector-python`
- `backend/config.py` — Read new DB_* env vars
- `backend/start.sh` — Add MySQL readiness wait loop

## Cursor/Connection Pattern

Every database function follows this pattern:
```python
conn = get_connection()
cursor = conn.cursor(dictionary=True)
try:
    cursor.execute(sql, params)
    result = cursor.fetchall()
    conn.commit()  # for writes
    return result
finally:
    cursor.close()
    conn.close()  # returns to pool
```

## Data Migration

No automated migration. University deployment starts fresh with an empty database. Existing SQLite data on the development laptop remains in its Docker volume but is unused.
