import os
from dotenv import load_dotenv

load_dotenv('.env.local')

class Config:
    # Server
    PORT = int(os.getenv('PORT', '5001'))
    HOST = os.getenv('HOST', '0.0.0.0')

    # Database
    DB_PATH = os.getenv('DB_PATH', 'recognition.db')

    # Storage
    AVATARS_DIR = os.getenv('AVATARS_DIR', 'avatars')
    SNAPSHOTS_DIR = os.getenv('SNAPSHOTS_DIR', 'snapshots')

    # Face Recognition
    FACE_DISTANCE_THRESHOLD = float(os.getenv('FACE_DISTANCE_THRESHOLD', '0.6'))

    # Camera & Detection Tuning
    REQUIRED_STILL_TIME = 3.0
    MOVEMENT_THRESHOLD = 50
    SUCCESS_LOCK_TIME = 3.0
    PADDING = 60

    # Auth
    ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'securesight2026')
    CAMERA_API_KEY = os.getenv('CAMERA_API_KEY', '')
    JWT_SECRET = os.getenv('JWT_SECRET', '')
    JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', '24'))
