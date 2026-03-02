import boto3
import botocore.exceptions
from config import Config  # Imports your centralized settings

def upload_single_employee_face(image_path, employee_id):
    """
    Reads a local image and adds the single largest face to your AWS Rekognition Collection.
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

    try:
        # Read the image as bytes
        with open(image_path, 'rb') as image_file:
            image_bytes = image_file.read()

        print(f"Uploading face for '{employee_id}' to collection '{collection_id}'...")
        
        # 3. Call the IndexFaces API
        response = client.index_faces(
            CollectionId=collection_id,
            Image={'Bytes': image_bytes},
            ExternalImageId=employee_id, 
            MaxFaces=1,                  # STRICT ENFORCEMENT: Only index 1 face
            QualityFilter="AUTO",        
            DetectionAttributes=['DEFAULT']
        )

        face_records = response.get('FaceRecords', [])
        
        if face_records:
            face_id = face_records[0]['Face']['FaceId']
            print(f"✅ Success! Employee '{employee_id}' indexed with FaceId: {face_id}")
            return face_id
        else:
            print("❌ Failed: No faces were detected in the provided image.")
            return None

    except botocore.exceptions.ClientError as e:
        print(f"AWS API Error: {e.response['Error']['Message']}")
        return None
    except FileNotFoundError:
        print(f"Error: Could not find the image file at '{image_path}'.")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None

# --- USAGE ---
if __name__ == "__main__":
    # Test the upload using a local image path
    TEST_IMAGE = '/Users/jameskierdoliguez/Downloads/Unknown-20.jpg'
    NEW_EMPLOYEE_ID = "EMP-106" 

    upload_single_employee_face(TEST_IMAGE, NEW_EMPLOYEE_ID)