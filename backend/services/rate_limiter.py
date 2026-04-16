import time
from collections import defaultdict

RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_REQUESTS = 120
RATE_LIMIT_CLEANUP_INTERVAL = 300

_store: dict[str, list[float]] = defaultdict(list)
_last_cleanup: float = 0.0


def check_rate_limit(key: str) -> bool:
    """Return True if the request is within rate limits."""
    global _last_cleanup
    now = time.monotonic()

    if now - _last_cleanup > RATE_LIMIT_CLEANUP_INTERVAL:
        stale = [k for k, v in _store.items() if not v or now - v[-1] > RATE_LIMIT_WINDOW]
        for k in stale:
            del _store[k]
        _last_cleanup = now

    _store[key] = [t for t in _store[key] if now - t < RATE_LIMIT_WINDOW]
    if len(_store[key]) >= RATE_LIMIT_MAX_REQUESTS:
        return False
    _store[key].append(now)
    return True
