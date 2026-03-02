import os
from dotenv import load_dotenv

# Load secrets from the .env.local file
load_dotenv('.env.local')

class Config:
    # --- FLASK SERVER ---
    PORT = 5001
    HOST = '0.0.0.0'

    # --- AWS REKOGNITION ---
    AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
    COLLECTION_ID = os.getenv('COLLECTION_ID', 'office_personnel')
    FACE_MATCH_THRESHOLD = 80  # Minimum confidence to accept a match

    # --- SUPABASE ---
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    GUEST_BUCKET_NAME = "guest-captures"

    # --- CAMERA & DETECTION TUNING ---
    REQUIRED_STILL_TIME = 3.0      # Seconds user must hold still
    MOVEMENT_THRESHOLD = 50        # Pixels of movement allowed
    SUCCESS_LOCK_TIME = 3.0        # Seconds to pause after successful scan
    PADDING = 60                   # Pixels to add around the face box