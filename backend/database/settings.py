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
