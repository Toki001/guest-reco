import os
import boto3
from config import Config

# --- CONFIGURATION ---
# Folder containing your employee photos (e.g., EMP001.jpg, EMP002.png)
IMAGE_FOLDER = "employee_images" 

# --- INITIALIZE AWS ---
rekognition = boto3.client(
    'rekognition', 
    region_name=Config.AWS_REGION,
    aws_access_key_id=Config.AWS_ACCESS_KEY_ID, 
    aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY
)

def batch_index_faces():
    if not os.path.exists(IMAGE_FOLDER):
        print(f"❌ Folder '{IMAGE_FOLDER}' not found. Please create it and add photos.")
        return

    print(f"🚀 Starting batch upload to collection: {Config.COLLECTION_ID}")

    for filename in os.listdir(IMAGE_FOLDER):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            # The ExternalImageId must be the ID you use in your Supabase 'users' table
            user_id = os.path.splitext(filename)[0]
            image_path = os.path.join(IMAGE_FOLDER, filename)

            with open(image_path, 'rb') as image_file:
                try:
                    response = rekognition.index_faces(
                        CollectionId=Config.COLLECTION_ID,
                        Image={'Bytes': image_file.read()},
                        ExternalImageId=user_id,
                        MaxFaces=1,
                        QualityFilter="AUTO",
                        DetectionAttributes=['ALL']
                    )
                    
                    if response['FaceRecords']:
                        print(f"✅ Indexed: {filename} -> ID: {user_id}")
                    else:
                        print(f"⚠️ Warning: No face detected in {filename}")
                
                except Exception as e:
                    print(f"❌ Error indexing {filename}: {e}")

    print("\n✨ Batch process complete.")

if __name__ == "__main__":
    batch_index_faces()