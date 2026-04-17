import datetime
import logging
from database.connection import get_connection

logger = logging.getLogger(__name__)

# In-memory caches
USER_STATE_CACHE: dict = {}
KNOWN_USERS_CACHE: set = set()

MAX_EMBEDDINGS_PER_USER = 5


def get_user_profile(user_id):
    conn = get_connection()
    row = conn.execute("SELECT id, name, image_path, role FROM users WHERE id = ?", (user_id,)).fetchone()
    if row:
        return {"id": row["id"], "name": row["name"], "image_url": row["image_path"], "role": row["role"]}
    return None


def get_all_users():
    conn = get_connection()
    rows = conn.execute("SELECT id, name, image_path, role FROM users").fetchall()
    return [{"id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"]} for r in rows]


def get_all_users_with_encodings():
    conn = get_connection()
    rows = conn.execute("SELECT id, name, face_encoding, image_path, role FROM users").fetchall()
    return [{"id": r["id"], "name": r["name"], "face_encoding": r["face_encoding"], "image_url": r["image_path"], "role": r["role"]} for r in rows]


def user_exists(user_id):
    conn = get_connection()
    row = conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone()
    return row is not None


def insert_user(user_id, name, face_encoding_bytes, image_path, role="Employee"):
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO users (id, name, face_encoding, image_path, role) VALUES (?, ?, ?, ?, ?)",
        (user_id, name, face_encoding_bytes, image_path, role)
    )
    conn.commit()
    KNOWN_USERS_CACHE.add(user_id)
    if face_encoding_bytes:
        add_embedding(user_id, face_encoding_bytes, condition="initial")


def delete_user(user_id):
    conn = get_connection()
    conn.execute("DELETE FROM face_embeddings WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM access_logs WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    USER_STATE_CACHE.pop(user_id, None)
    KNOWN_USERS_CACHE.discard(user_id)


def update_user(user_id, name=None, role=None):
    conn = get_connection()
    if name is not None:
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
    if role is not None:
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    conn.commit()
    USER_STATE_CACHE.pop(user_id, None)


def update_user_face(user_id, face_encoding_bytes, image_path):
    conn = get_connection()
    conn.execute("UPDATE users SET face_encoding = ?, image_path = ? WHERE id = ?",
                 (face_encoding_bytes, image_path, user_id))
    conn.commit()
    if face_encoding_bytes:
        add_embedding(user_id, face_encoding_bytes, condition="reface")


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


def get_users_with_last_seen(role=None):
    conn = get_connection()
    role_filter = ""
    params = []
    if role and role != "all":
        role_filter = "WHERE u.role = ?"
        params = [role]
    rows = conn.execute(f"""
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
    """, params).fetchall()
    return [{
        "id": r["id"], "name": r["name"], "image_url": r["image_path"], "role": r["role"],
        "last_status": r["last_status"], "last_seen": r["last_seen"], "last_camera": r["last_camera"],
        "entries_count": r["entries_count"], "exits_count": r["exits_count"]
    } for r in rows]


# --- MULTI-EMBEDDING FUNCTIONS ---

def get_all_embeddings():
    conn = get_connection()
    rows = conn.execute("""
        SELECT fe.user_id, fe.embedding, u.name, u.image_path, u.role
        FROM face_embeddings fe
        JOIN users u ON fe.user_id = u.id
        ORDER BY fe.user_id, fe.created_at DESC
    """).fetchall()
    return [{"user_id": r["user_id"], "embedding": r["embedding"], "name": r["name"], "image_url": r["image_path"], "role": r["role"]} for r in rows]


def add_embedding(user_id, embedding_bytes, condition="auto"):
    conn = get_connection()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        conn.execute("BEGIN IMMEDIATE")
    except Exception:
        pass
    try:
        count = conn.execute(
            "SELECT COUNT(*) as c FROM face_embeddings WHERE user_id = ?", (user_id,)
        ).fetchone()["c"]
        if count >= MAX_EMBEDDINGS_PER_USER:
            oldest = conn.execute(
                "SELECT id FROM face_embeddings WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
                (user_id,)
            ).fetchone()
            if oldest:
                conn.execute("DELETE FROM face_embeddings WHERE id = ?", (oldest["id"],))
        conn.execute(
            "INSERT INTO face_embeddings (user_id, embedding, condition, created_at) VALUES (?, ?, ?, ?)",
            (user_id, embedding_bytes, condition, now)
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def get_user_embedding_count(user_id):
    conn = get_connection()
    return conn.execute(
        "SELECT COUNT(*) as c FROM face_embeddings WHERE user_id = ?", (user_id,)
    ).fetchone()["c"]


def get_recent_activity_for_camera(camera_id, minutes=120):
    conn = get_connection()
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes)).isoformat()
    rows = conn.execute("""
        SELECT DISTINCT a.user_id, u.name, a.status, a.timestamp
        FROM access_logs a
        JOIN users u ON a.user_id = u.id
        WHERE a.camera_id = ? AND a.timestamp >= ?
        ORDER BY a.timestamp DESC
    """, (camera_id, cutoff)).fetchall()
    return [{"user_id": r["user_id"], "name": r["name"], "status": r["status"], "timestamp": r["timestamp"]} for r in rows]
