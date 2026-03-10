import io
import numpy as np
import face_recognition
from config import Config

FACE_DISTANCE_THRESHOLD = getattr(Config, 'FACE_DISTANCE_THRESHOLD', 0.6)

def index_face(image_bytes):
    """Extract 128-d face encoding from image bytes.
    Returns encoding as numpy bytes (.tobytes()), or None if no face found.
    """
    try:
        image = face_recognition.load_image_file(io.BytesIO(image_bytes))
        encodings = face_recognition.face_encodings(image)
        if not encodings:
            return None
        return encodings[0].tobytes()
    except Exception as e:
        print(f"❌ Face indexing error: {e}")
        return None

def search_face(image_bytes, known_users):
    """Compare image against all known face encodings.

    Args:
        image_bytes: Raw image bytes
        known_users: List of dicts with 'id', 'face_encoding' (bytes), etc.

    Returns:
        - {"user_id": str, "confidence": float} if match found
        - {"no_face": True} if no face detected in image
        - None if face detected but no match above threshold
    """
    try:
        image = face_recognition.load_image_file(io.BytesIO(image_bytes))
        encodings = face_recognition.face_encodings(image)

        if not encodings:
            return {"no_face": True}

        unknown_encoding = encodings[0]

        # Filter users that have valid face encodings
        valid_users = []
        known_encodings = []
        for user in known_users:
            if user.get("face_encoding"):
                try:
                    enc = np.frombuffer(user["face_encoding"], dtype=np.float64)
                    if enc.shape == (128,):
                        known_encodings.append(enc)
                        valid_users.append(user)
                except Exception:
                    continue

        if not known_encodings:
            return None  # No known faces to compare against

        distances = face_recognition.face_distance(known_encodings, unknown_encoding)
        best_idx = np.argmin(distances)
        best_distance = distances[best_idx]

        if best_distance < FACE_DISTANCE_THRESHOLD:
            confidence = round((1 - best_distance) * 100, 1)
            return {"user_id": valid_users[best_idx]["id"], "confidence": confidence}

        return None  # Face found but no match above threshold

    except Exception as e:
        print(f"❌ Face search error: {e}")
        return {"no_face": True}
