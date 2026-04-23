import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env')


class Config:
    # Server
    PORT = int(os.getenv('PORT', '5001'))
    HOST = os.getenv('HOST', '0.0.0.0')

    # Database (MySQL)
    DB_HOST = os.getenv('DB_HOST', 'mysql')
    DB_PORT = int(os.getenv('DB_PORT', '3306'))
    DB_USER = os.getenv('DB_USER', 'securesight')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'securesight')
    DB_NAME = os.getenv('DB_NAME', 'securesight')

    # Auth
    ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'securesight2026')
    CAMERA_API_KEY = os.getenv('CAMERA_API_KEY', '')
    JWT_SECRET = os.getenv('JWT_SECRET', '')
    JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', '24'))
