import boto3
import botocore.exceptions
from config import Config  # Imports your centralized settings

def delete_specific_face(face_id):
    """
    Deletes a specific Face ID from the AWS Rekognition Collection.
    Pulls AWS credentials and Collection ID directly from the Config class.
    """
    # 1. Initialize the Rekognition client using Config secrets
    client = boto3.client(
        'rekognition',
        region_name=Config.AWS_REGION,
        aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY
    )

    # 2. Pull the target collection from config
    collection_id = Config.COLLECTION_ID

    print(f"🗑️ Attempting to delete FaceID: {face_id} from collection '{collection_id}'...")

    try:
        response = client.delete_faces(
            CollectionId=collection_id,
            FaceIds=[face_id]  # Expects a list of strings
        )
        
        deleted_faces = response.get('DeletedFaces', [])
        if deleted_faces:
            print(f"✅ Successfully deleted FaceID: {deleted_faces[0]}")
        else:
            print("⚠️ No face deleted. It might not exist in this collection.")

    except botocore.exceptions.ClientError as e:
        print(f"❌ AWS API Error: {e.response['Error']['Message']}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

# --- USAGE ---
if __name__ == "__main__":
    # Replace this with the actual FaceID you want to delete
    target_face_id = "c4c3276a-916b-43b6-8fff-92db56c28198" 
    
    # We only need to pass the face_id now
    delete_specific_face(target_face_id)