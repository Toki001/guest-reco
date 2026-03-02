import boto3
import botocore.exceptions
from config import Config  # Imports your centralized settings

def list_all_faces():
    """
    Lists all faces in the AWS Rekognition Collection.
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

    print(f"📂 Fetching faces from collection: '{collection_id}'...\n")
    
    # Pagination Loop
    next_token = None
    face_count = 0
    
    while True:
        # Prepare arguments (only add NextToken if it exists)
        kwargs = {'CollectionId': collection_id, 'MaxResults': 20}
        if next_token:
            kwargs['NextToken'] = next_token

        try:
            response = client.list_faces(**kwargs)
            
            # Loop through the faces in this batch
            for face in response.get('Faces', []):
                face_id = face['FaceId']
                external_id = face.get('ExternalImageId', '[No External ID]')
                confidence = face.get('Confidence', 0.0)
                
                print(f"👤 FaceId: {face_id} | ExternalId: {external_id} | Confidence: {confidence:.2f}%")
                face_count += 1

            # Check if there is another page of results
            next_token = response.get('NextToken')
            if not next_token:
                break  # No more pages, exit loop
                
        except botocore.exceptions.ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'ResourceNotFoundException':
                print(f"❌ Error: Collection '{collection_id}' does not exist.")
            else:
                print(f"❌ AWS API Error: {e.response['Error']['Message']}")
            break
        except Exception as e:
            print(f"❌ An unexpected error occurred: {e}")
            break

    print(f"\n✅ Total Faces Found: {face_count}")

# --- USAGE ---
if __name__ == '__main__':
    # We no longer need to pass the COLLECTION_ID as an argument
    list_all_faces()