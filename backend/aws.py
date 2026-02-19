import boto3
from config import Config

# --- INITIALIZE AWS ---
try:
    rekognition = boto3.client('rekognition', region_name=Config.AWS_REGION,
                               aws_access_key_id=Config.AWS_ACCESS_KEY_ID, 
                               aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY)
    print("✅ AWS Rekognition Connected")
except Exception as e:
    print(f"⚠️ AWS Rekognition Failed: {e}")
    rekognition = None

def search_face(image_bytes):
    """Sends the image bytes to AWS and returns the match response."""
    if not rekognition:
        return None # Simulation mode handled in app.py

    return rekognition.search_faces_by_image(
        CollectionId=Config.COLLECTION_ID,
        Image={'Bytes': image_bytes},
        FaceMatchThreshold=Config.FACE_MATCH_THRESHOLD,
        MaxFaces=1
    )