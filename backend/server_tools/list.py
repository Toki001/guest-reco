import boto3
import os
from dotenv import load_dotenv

# 1. Load Environment Variables
load_dotenv('.env.local')
REGION = os.getenv('AWS_REGION', 'us-east-1')
AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
COLLECTION_ID = os.getenv('COLLECTION_ID', 'office_personnel')

def list_all_faces(collection_id):
    client = boto3.client(
        'rekognition',
        region_name=REGION,
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY
    )

    print(f"📂 Fetching faces from collection: {collection_id}...\n")
    
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
                confidence = face['Confidence']
                
                print(f"👤 FaceId: {face_id} | ExternalId: {external_id} | Confidence: {confidence:.2f}%")
                face_count += 1

            # Check if there is another page of results
            next_token = response.get('NextToken')
            if not next_token:
                break  # No more pages, exit loop
                
        except client.exceptions.ResourceNotFoundException:
            print(f"❌ Error: Collection '{collection_id}' does not exist.")
            break
        except Exception as e:
            print(f"❌ An error occurred: {e}")
            break

    print(f"\n✅ Total Faces Found: {face_count}")

if __name__ == '__main__':
    list_all_faces(COLLECTION_ID)