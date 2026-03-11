import io
import numpy as np
import face_recognition  # pyright: ignore[reportMissingImports]
from config import Config

FACE_DISTANCE_THRESHOLD = getattr(Config, 'FACE_DISTANCE_THRESHOLD', 0.45)
CONFIDENCE_FLOOR = 55.0  # Matches below this confidence are rejected


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
        print(f"Face indexing error: {e}")
        return None


def search_face(image_bytes, known_users):
    """Compare image against all known face encodings with double-verify.

    Two-pass verification:
    1. First pass: standard encoding + distance check
    2. Second pass: re-encode with num_jitters=2 (more accurate), verify same match

    Returns:
        - {"user_id": str, "confidence": float} if match confirmed by both passes
        - {"no_face": True} if no face detected in image
        - {"uncertain": True} if first pass matched but second pass disagreed (do NOT register as guest)
        - None if face detected but no match at all (safe to register as new guest)
    """
    try:
        image = face_recognition.load_image_file(io.BytesIO(image_bytes))

        # First pass: standard encoding
        encodings = face_recognition.face_encodings(image)
        if not encodings:
            return {"no_face": True}

        unknown_encoding = encodings[0]

        # Build known encodings list
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
            return None

        # First pass: find best match
        distances = face_recognition.face_distance(known_encodings, unknown_encoding)
        best_idx = int(np.argmin(distances))
        best_distance = distances[best_idx]

        if best_distance >= FACE_DISTANCE_THRESHOLD:
            return None  # No match above threshold

        confidence = round((1 - best_distance) * 100, 1)
        if confidence < CONFIDENCE_FLOOR:
            return None  # Gray zone — too uncertain

        # Second pass: re-encode with num_jitters=2 for higher accuracy
        verify_encodings = face_recognition.face_encodings(image, num_jitters=2)
        if not verify_encodings:
            return None  # Could not re-encode

        verify_encoding = verify_encodings[0]
        verify_distances = face_recognition.face_distance(known_encodings, verify_encoding)
        verify_best_idx = int(np.argmin(verify_distances))
        verify_best_distance = verify_distances[verify_best_idx]

        # Both passes must agree on the same person AND pass threshold
        if verify_best_idx != best_idx:
            print(f"Double-verify FAILED: pass1={valid_users[best_idx]['id']} pass2={valid_users[verify_best_idx]['id']}")
            return {"uncertain": True}

        if verify_best_distance >= FACE_DISTANCE_THRESHOLD:
            print(f"Double-verify FAILED: second pass distance {verify_best_distance:.3f} >= {FACE_DISTANCE_THRESHOLD}")
            return {"uncertain": True}

        # Average confidence from both passes
        avg_distance = (best_distance + verify_best_distance) / 2
        final_confidence = round((1 - avg_distance) * 100, 1)

        if final_confidence < CONFIDENCE_FLOOR:
            return None

        print(f"Double-verify OK: {valid_users[best_idx]['id']} (pass1={confidence}% pass2={round((1-verify_best_distance)*100,1)}% avg={final_confidence}%)")
        return {"user_id": valid_users[best_idx]["id"], "confidence": final_confidence}

    except Exception as e:
        print(f"Face search error: {e}")
        return {"no_face": True}
