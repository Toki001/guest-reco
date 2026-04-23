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
