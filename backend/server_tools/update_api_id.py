import boto3
import os
from dotenv import load_dotenv

# 1. Load your environment variables (so it finds your keys)
load_dotenv('.env.local') 

# 2. Get the config from the env file
REGION = os.getenv('AWS_REGION', 'us-east-1') # Default to us-east-1 if missing
AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')

def update_face_id(collection_id, old_face_id, image_bytes, new_external_id):
    # 3. Pass the region and keys explicitly here
    client = boto3.client(
        'rekognition', 
        region_name=REGION,
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY
    )

    # Step 1: Delete the old face
    print(f"Deleting old face ID: {old_face_id}...")
    try:
        # Note: DeleteFaces expects a LIST of strings
        client.delete_faces(
            CollectionId=collection_id,
            FaceIds=[old_face_id] 
        )
    except Exception as e:
        print(f"⚠️ Warning during delete (maybe ID doesn't exist?): {e}")
        # We continue anyway to re-index the new one

    # Step 2: Re-Index the image with the NEW ID
    print(f"Re-indexing face as: {new_external_id}...")
    try:
        response = client.index_faces(
            CollectionId=collection_id,
            Image={'Bytes': image_bytes}, 
            ExternalImageId=new_external_id,
            MaxFaces=1,
            QualityFilter="AUTO",
            DetectionAttributes=['ALL']
        )
        
        if response['FaceRecords']:
            new_face_id = response['FaceRecords'][0]['Face']['FaceId']
            print(f"✅ Success! New FaceId: {new_face_id}")
            return new_face_id
        else:
            print("❌ No face detected in the image.")
            return None

    except Exception as e:
        print(f"Error re-indexing face: {e}")
        return None

# --- USAGE ---
image_path = '/Users/jameskierdoliguez/Downloads/EMP-104.jpg'

with open(image_path, "rb") as image_file:
    image_bytes = image_file.read()

update_face_id(
    collection_id="office_personnel",
    old_face_id="jess", 
    image_bytes=image_bytes,      
    new_external_id="EMP-104" 
)