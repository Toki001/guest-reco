import boto3
import os
from dotenv import load_dotenv

load_dotenv('.env.local')

def delete_specific_face(collection_id, face_id):
    client = boto3.client(
        'rekognition',
        region_name=os.getenv('AWS_REGION', 'us-east-1'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
    )

    print(f"🗑️ Attempting to delete FaceID: {face_id}...")

    try:
        response = client.delete_faces(
            CollectionId=collection_id,
            FaceIds=[face_id]  # You can add multiple IDs here if needed
        )
        
        deleted_faces = response.get('DeletedFaces', [])
        if deleted_faces:
            print(f"✅ Successfully deleted: {deleted_faces[0]}")
        else:
            print("⚠️ No face deleted. Check if the FaceID is correct.")

    except Exception as e:
        print(f"❌ Error: {e}")

# --- USAGE ---
# Replace this with the actual FaceID you found using the 'list_faces' script
target_face_id = "d7c105b5-85d2-4b0b-9865-c5fb59f2275a" 
delete_specific_face("office_personnel", target_face_id)