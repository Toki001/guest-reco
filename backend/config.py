import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env')


def _require(name: str, min_length: int = 0) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    if min_length and len(value.encode()) < min_length:
        raise RuntimeError(
            f"{name} must be at least {min_length} bytes (currently {len(value.encode())})"
        )
    return value


class Config:
    # Server
    PORT = int(os.getenv('PORT', '5001'))
    HOST = os.getenv('HOST', '0.0.0.0')

    # Database (MySQL)
    DB_HOST = os.getenv('DB_HOST', 'mysql')
    DB_PORT = int(os.getenv('DB_PORT', '3306'))
    DB_USER = _require('DB_USER')
    DB_PASSWORD = _require('DB_PASSWORD')
    DB_NAME = os.getenv('DB_NAME', 'securesight')

    # Auth
    ADMIN_USERNAME = _require('ADMIN_USERNAME')
    ADMIN_PASSWORD = _require('ADMIN_PASSWORD')
    CAMERA_API_KEY = _require('CAMERA_API_KEY')
    JWT_SECRET = _require('JWT_SECRET', min_length=32)
    JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', '24'))
