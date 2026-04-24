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
            pool_size=32,
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

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS event_cameras (
                event_id INT NOT NULL,
                camera_id VARCHAR(255) NOT NULL,
                PRIMARY KEY (event_id, camera_id),
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                FOREIGN KEY (camera_id) REFERENCES cameras(camera_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

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
