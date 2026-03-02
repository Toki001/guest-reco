import boto3
import botocore.exceptions

# Assuming your config code is saved in a file named 'config.py'
from config import Config

def update_face_id(old_face_id, image_bytes, new_external_id):
    """
    Deletes an old face ID and re-indexes a new image with a new External ID.
    Pulls AWS credentials and Collection ID directly from the Config class.
    """
    # Initialize the Rekognition client using settings from Config
    client = boto3.client(
        'rekognition',
        region_name=Config.AWS_REGION,
        aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY
    )

    # Pull the collection ID from your config
    collection_id = Config.COLLECTION_ID

    # Step 1: Delete the old face
    print(f"Attempting to delete old face ID: {old_face_id} from collection '{collection_id}'...")
    try:
        delete_response = client.delete_faces(
            CollectionId=collection_id,
            FaceIds=[old_face_id] 
        )
        
        if old_face_id in delete_response.get('DeletedFaces', []):
            print(f"✅ Successfully deleted old face ID: {old_face_id}")
        else:
            print(f"⚠️ Old face ID '{old_face_id}' was not found. Proceeding to index anyway.")

    except botocore.exceptions.ClientError as e:
        print(f"⚠️ AWS API Error during delete: {e.response['Error']['Message']}")

    # Step 2: Re-Index the image with the NEW ID
    print(f"Indexing new face as: {new_external_id}...")
    try:
        index_response = client.index_faces(
            CollectionId=collection_id,
            Image={'Bytes': image_bytes}, 
            ExternalImageId=new_external_id,
            MaxFaces=1,                  # STRICT ENFORCEMENT: Only index 1 face
            QualityFilter="AUTO",
            DetectionAttributes=['DEFAULT'] 
        )
        
        face_records = index_response.get('FaceRecords', [])
        
        if face_records:
            new_face_id = face_records[0]['Face']['FaceId']
            print(f"✅ Success! New FaceId generated: {new_face_id}")
            return new_face_id
        else:
            print("❌ Failed: No faces were detected in the provided image.")
            return None

    except botocore.exceptions.ClientError as e:
        print(f"❌ AWS API Error during indexing: {e.response['Error']['Message']}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")
        return None

# --- USAGE ---
if __name__ == "__main__":
    image_path = '/Users/jameskierdoliguez/Downloads/Unknown-20.jpg'

    try:
        with open(image_path, "rb") as image_file:
            image_bytes = image_file.read()

        # Notice we no longer need to pass the collection_id here
        update_face_id(
            old_face_id="EMP-105", 
            image_bytes=image_bytes,      
            new_external_id="EMP-105" 
        )
    except FileNotFoundError:
        print(f"❌ Error: Could not find the image file at '{image_path}'.")