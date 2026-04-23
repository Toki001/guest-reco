import sqlite3
import logging
import threading
from config import Config

logger = logging.getLogger(__name__)

DB_PATH = getattr(Config, 'DB_PATH', 'recognition.db')

_local = threading.local()


def get_connection():
    """Get a thread-local SQLite connection."""
    if not hasattr(_local, 'connection') or _local.connection is None:
        _local.connection = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.connection.row_factory = sqlite3.Row
        _local.connection.execute("PRAGMA journal_mode=WAL")
        _local.connection.execute("PRAGMA foreign_keys = ON")
    return _local.connection


def init_db():
    """Initialize database schema."""
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            face_encoding BLOB,
            image_path TEXT,
            role TEXT DEFAULT 'Employee'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT REFERENCES users(id),
            status TEXT,
            confidence REAL,
            timestamp TEXT,
            snapshot_path TEXT,
            camera_id TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cameras (
            camera_id TEXT PRIMARY KEY,
            department TEXT NOT NULL,
            last_heartbeat TEXT,
            is_online INTEGER DEFAULT 0,
            registered_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS face_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            embedding BLOB NOT NULL,
            condition TEXT DEFAULT 'initial',
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_face_embeddings_user ON face_embeddings(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_access_logs_user_timestamp ON access_logs(user_id, timestamp DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_access_logs_camera ON access_logs(camera_id, timestamp DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_access_logs_status ON access_logs(user_id, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            location TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT,
            start_time TEXT,
            end_time TEXT,
            category TEXT DEFAULT 'General',
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date)")
    conn.commit()
    logger.info("SQLite Database Initialized")
