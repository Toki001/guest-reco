import io
import logging
import threading
import numpy as np
from PIL import Image
from config import Config

logger = logging.getLogger(__name__)

# Default thresholds (overridden by settings API)
MATCH_THRESHOLD = 0.45
UNCERTAIN_LOWER = 0.35
UNCERTAIN_UPPER = 0.55
CONFIDENCE_FLOOR = 50.0
EMBEDDING_DIVERSITY_MIN = 0.15

# InsightFace model (lazy-loaded, thread-safe)
_model = None
_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        import insightface
        _model = insightface.app.FaceAnalysis(
            name="antelopev2",
            providers=["CPUExecutionProvider"]
        )
        _model.prepare(ctx_id=-1, det_size=(640, 640))
        logger.info("InsightFace model loaded (antelopev2 / ArcFace + RetinaFace)")
    return _model


def _bytes_to_cv2(image_bytes, pad_for_detection=True):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)
    if pad_for_detection:
        h, w = arr.shape[:2]
        pad_y, pad_x = h // 2, w // 2
        padded = np.full((h + 2 * pad_y, w + 2 * pad_x, 3), 128, dtype=np.uint8)
        padded[pad_y:pad_y + h, pad_x:pad_x + w] = arr
        arr = padded
    return arr[:, :, ::-1].copy()


def index_face(image_bytes):
    """Extract 512-d ArcFace embedding from image bytes."""
    with _lock:
        try:
            model = _get_model()
            img = _bytes_to_cv2(image_bytes, pad_for_detection=True)
            faces = model.get(img)
            if not faces:
                return None
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            return face.normed_embedding.astype(np.float64).tobytes()
        except Exception as e:
            logger.error("Face indexing error: %s", e)
            return None


def search_face_multi(image_bytes, all_embeddings, context=None, thresholds=None):
    """Multi-embedding face matching with uncertain zone + context signals.

    Args:
        image_bytes: JPEG/PNG image bytes
        all_embeddings: list of {"user_id", "embedding" (bytes), "name", "role"}
            Multiple entries per user (up to 5 embeddings each)
        context: optional dict with {"camera_id", "recent_users": [...]}
            for uncertain-zone resolution

    Returns:
        - {"user_id", "confidence", "is_new_embedding": bool} if match found
        - {"no_face": True} if no face detected
        - None if no match (register as new guest)
    """
    t = thresholds or {}
    match_thresh = t.get("match_threshold", MATCH_THRESHOLD)
    conf_floor = t.get("confidence_floor", CONFIDENCE_FLOOR)
    unc_lower = t.get("uncertain_lower", UNCERTAIN_LOWER)
    unc_upper = t.get("uncertain_upper", UNCERTAIN_UPPER)
    div_min = t.get("embedding_diversity_min", EMBEDDING_DIVERSITY_MIN)

    with _lock:
        try:
            model = _get_model()
            img = _bytes_to_cv2(image_bytes, pad_for_detection=True)
            faces = model.get(img)

            if not faces:
                return {"no_face": True}

            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            unknown_emb = face.normed_embedding.astype(np.float64)

            # Build per-user best similarity (best of N embeddings)
            user_best = {}  # user_id -> (best_similarity, name, role)

            for entry in all_embeddings:
                uid = entry["user_id"]
                enc_bytes = entry.get("embedding")
                if not enc_bytes:
                    continue
                try:
                    enc = np.frombuffer(enc_bytes, dtype=np.float64)
                    if enc.shape != (512,):
                        continue
                except Exception:
                    continue

                sim = float(np.dot(enc, unknown_emb))

                if uid not in user_best or sim > user_best[uid][0]:
                    user_best[uid] = (sim, entry.get("name", uid), entry.get("role", "Guest"))

            if not user_best:
                return None

            # Find the best match across all users
            best_uid = max(user_best, key=lambda uid: user_best[uid][0])
            best_sim, best_name, best_role = user_best[best_uid]
            best_dist = 1.0 - best_sim
            confidence = round(best_sim * 100, 1)

            # --- ZONE 1: Strong match ---
            if best_dist < match_thresh and confidence >= conf_floor:
                is_new = _is_diverse_embedding(unknown_emb, all_embeddings, best_uid, div_min)
                logger.info("Strong match: %s (sim=%.3f, conf=%.1f%%, new_emb=%s)", best_name, best_sim, confidence, is_new)
                return {
                    "user_id": best_uid,
                    "confidence": confidence,
                    "is_new_embedding": is_new,
                    "new_embedding_bytes": unknown_emb.tobytes() if is_new else None,
                }

            # --- ZONE 2: Uncertain match (use context) ---
            if unc_lower <= best_dist <= unc_upper and context:
                recent_users = context.get("recent_users", [])
                recent_ids = {u["user_id"] for u in recent_users}

                if best_uid in recent_ids and confidence >= conf_floor:
                    # The best match was recently active at this camera — likely the same person
                    # Check diversity before storing as new embedding
                    is_new = _is_diverse_embedding(unknown_emb, all_embeddings, best_uid, div_min)
                    logger.info("Context match: %s (sim=%.3f, context: recently active, new_emb=%s)", best_name, best_sim, is_new)
                    return {
                        "user_id": best_uid,
                        "confidence": confidence,
                        "is_new_embedding": is_new,
                        "new_embedding_bytes": unknown_emb.tobytes() if is_new else None,
                    }

            # --- ZONE 3: No match ---
            if best_sim > 0.3:
                logger.info("No match (best: %s, sim=%.3f, dist=%.3f)", best_name, best_sim, best_dist)
            return None

        except Exception as e:
            logger.exception("Face search error")
            # Distinguish system error from "no face" — raise so caller can handle
            raise


def _is_diverse_embedding(new_emb, all_embeddings, user_id, diversity_min=EMBEDDING_DIVERSITY_MIN):
    """Check if new_emb is different enough from existing embeddings for this user."""
    user_embs = []
    for entry in all_embeddings:
        if entry["user_id"] != user_id or not entry.get("embedding"):
            continue
        try:
            enc = np.frombuffer(entry["embedding"], dtype=np.float64)
            if enc.shape == (512,):
                user_embs.append(enc)
        except Exception:
            continue

    if not user_embs:
        return True

    # Check minimum distance from all existing embeddings
    for existing in user_embs:
        dist = 1.0 - float(np.dot(existing, new_emb))
        if dist < diversity_min:
            return False  # Too similar to an existing embedding

    return True


# Legacy compatibility — falls back to single-embedding matching
def search_face(image_bytes, known_users):
    """Single-embedding matching (backward compatible). Wraps search_face_multi."""
    # Convert known_users format to all_embeddings format
    all_embs = []
    for user in known_users:
        if user.get("face_encoding"):
            all_embs.append({
                "user_id": user["id"],
                "embedding": user["face_encoding"],
                "name": user.get("name", user["id"]),
                "role": user.get("role", "Guest"),
            })
    result = search_face_multi(image_bytes, all_embs)
    if result and "user_id" in result:
        return {"user_id": result["user_id"], "confidence": result["confidence"]}
    return result
