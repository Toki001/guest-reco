import uuid
import datetime
import logging

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import Config

logger = logging.getLogger(__name__)

# --- Fail-fast: require JWT_SECRET in production ---
_jwt_secret = Config.JWT_SECRET
if not _jwt_secret:
    _jwt_secret = uuid.uuid4().hex
    logger.warning(
        "JWT_SECRET not set — generated a random one. "
        "Tokens will NOT survive server restarts. Set JWT_SECRET in .env.local for production."
    )

_camera_api_key = Config.CAMERA_API_KEY or uuid.uuid4().hex


def get_camera_api_key() -> str:
    return _camera_api_key


def _hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt())


def _check_password(password: str, hashed: bytes) -> bool:
    return bcrypt.checkpw(password.encode(), hashed)


_admin_password_hash = _hash_password(Config.ADMIN_PASSWORD)

# --- JWT ---
def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=Config.JWT_EXPIRY_HOURS),
        "iat": datetime.datetime.now(datetime.timezone.utc),
    }
    return jwt.encode(payload, _jwt_secret, algorithm="HS256")


def verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def check_login(username: str, password: str) -> str | None:
    if username == Config.ADMIN_USERNAME and _check_password(password, _admin_password_hash):
        return create_token(username)
    return None


# --- FastAPI Dependencies ---
_bearer = HTTPBearer(auto_error=False)


async def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = verify_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


async def require_camera_or_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    # Check Bearer token first
    if credentials and verify_token(credentials.credentials):
        return {"auth": "admin"}
    # Check X-API-Key header
    if x_api_key and x_api_key == _camera_api_key:
        return {"auth": "camera"}
    raise HTTPException(status_code=401, detail="Authentication required")


# --- WebSocket Auth ---
def verify_ws_auth(token: str | None = None, key: str | None = None) -> bool:
    if token and verify_token(token):
        return True
    if key and key == _camera_api_key:
        return True
    return False
