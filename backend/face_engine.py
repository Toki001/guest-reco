import io
import threading
import numpy as np
from PIL import Image
from config import Config

FACE_DISTANCE_THRESHOLD = getattr(Config, 'FACE_DISTANCE_THRESHOLD', 0.45)
CONFIDENCE_FLOOR = 55.0

# InsightFace model (lazy-loaded, thread-safe with lock)
_model = None
_lock = threading.Lock()


def _get_model():
    """Lazy-load the InsightFace analysis model."""
    global _model
    if _model is None:
        import insightface  # pyright: ignore[reportMissingImports]
        _model = insightface.app.FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"]
        )
        _model.prepare(ctx_id=-1, det_size=(640, 640))
        print("InsightFace model loaded (buffalo_l / ArcFace + RetinaFace)")
    return _model


def _bytes_to_cv2(image_bytes):
    """Convert image bytes to numpy array (BGR format for InsightFace)."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)
    # RGB to BGR
    return arr[:, :, ::-1].copy()


def index_face(image_bytes):
    """Extract 512-d ArcFace embedding from image bytes.
    Returns embedding as numpy bytes (.tobytes()), or None if no face found.
    """
    with _lock:
        try:
            model = _get_model()
            img = _bytes_to_cv2(image_bytes)
            faces = model.get(img)
            if not faces:
                return None
            # Use the largest face (by bounding box area)
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            return face.normed_embedding.astype(np.float64).tobytes()
        except Exception as e:
            print(f"Face indexing error: {e}")
            return None


def search_face(image_bytes, known_users):
    """Compare image against all known face encodings using ArcFace cosine similarity.

    Returns:
        - {"user_id": str, "confidence": float} if match found
        - {"no_face": True} if no face detected in image
        - None if face detected but no match (safe to register as new guest)
    """
    with _lock:
        try:
            model = _get_model()
            img = _bytes_to_cv2(image_bytes)
            faces = model.get(img)

            if not faces:
                return {"no_face": True}

            # Use the largest detected face
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            unknown_embedding = face.normed_embedding.astype(np.float64)

            # Build known embeddings
            valid_users = []
            known_embeddings = []
            for user in known_users:
                if user.get("face_encoding"):
                    try:
                        enc = np.frombuffer(user["face_encoding"], dtype=np.float64)
                        if enc.shape == (512,):
                            known_embeddings.append(enc)
                            valid_users.append(user)
                        elif enc.shape == (128,):
                            # Legacy dlib encoding — skip (incompatible)
                            continue
                    except Exception:
                        continue

            if not known_embeddings:
                return None

            # Cosine similarity (embeddings are already L2-normalized by InsightFace)
            known_matrix = np.array(known_embeddings)
            similarities = np.dot(known_matrix, unknown_embedding)

            best_idx = int(np.argmax(similarities))
            best_similarity = float(similarities[best_idx])

            # Convert similarity to distance-like metric for threshold comparison
            # similarity range: -1 to 1, where 1 = identical
            # We use 1 - similarity as "distance" so existing threshold logic works
            best_distance = 1.0 - best_similarity

            if best_distance >= FACE_DISTANCE_THRESHOLD:
                return None

            confidence = round(best_similarity * 100, 1)
            if confidence < CONFIDENCE_FLOOR:
                return None

            print(f"ArcFace match: {valid_users[best_idx]['id']} (similarity={best_similarity:.3f}, confidence={confidence}%)")
            return {"user_id": valid_users[best_idx]["id"], "confidence": confidence}

        except Exception as e:
            print(f"Face search error: {e}")
            return {"no_face": True}
