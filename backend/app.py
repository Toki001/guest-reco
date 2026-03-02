import datetime
import os
import uuid  # <-- NEW: Used to generate unique Guest IDs
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from supabase import create_client, Client

# --- IMPORT OUR CUSTOM MODULES ---
from config import Config
from database import upload_image_to_supabase, get_user_profile, log_access_attempt
from aws import search_face, rekognition

# --- FASTAPI SETUP ---
app = FastAPI(title="FSUU Edge Recognition API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- INITIALIZE SUPABASE CLIENT ---
supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)

def secure_filename(filename: str) -> str:
    return os.path.basename(filename).replace(" ", "_")

# --- API: RECOGNIZE FACE ---
@app.post('/api/recognize')
async def recognize_face(image: UploadFile = File(...)):
    """Receives a single image from an iPad, checks AWS, and logs the result."""
    
    image_bytes = await image.read()

    try:
        # Simulation Check
        if not rekognition:
             return {'message': "SIMULATION: ACCESS GRANTED", 'type': "employee", 'confidence': 100}

        # 1. Ask AWS who this is
        response = search_face(image_bytes)
        
        # 2. Process Result
        if not response or not response.get('FaceMatches'):
            # --- AUTO-REGISTER GUEST LOGIC ---
            guest_id = f"GUEST-{uuid.uuid4().hex[:6].upper()}"
            guest_name = f"Guest {guest_id[-4:]}"
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 👤 Unknown Face Detected - Auto-Registering as {guest_name}...")
            
            try:
                # A. Index into AWS Rekognition
                rek_response = rekognition.index_faces(
                    CollectionId=Config.COLLECTION_ID, 
                    Image={'Bytes': image_bytes}, 
                    ExternalImageId=guest_id, 
                    MaxFaces=1, 
                    QualityFilter="AUTO", 
                    DetectionAttributes=['DEFAULT']
                )
                
                face_records = rek_response.get('FaceRecords', [])
                if not face_records:
                    # If AWS rejects the image quality, fall back to denying access
                    print("❌ AWS rejected face quality for indexing.")
                    return {'message': "SCAN FAILED: POOR QUALITY", 'type': "guest", 'confidence': 0.0, 'status': 'denied'}
                    
                face_id = face_records[0]['Face']['FaceId']
                
                # B. Upload avatar to Supabase Storage (so their face shows in the UI logs)
                bucket_name = 'avatars' 
                storage_path = f"{guest_id}.jpg"
                supabase.storage.from_(bucket_name).upload(path=storage_path, file=image_bytes, file_options={"content-type": "image/jpeg", "upsert": "true"})
                avatar_url = supabase.storage.from_(bucket_name).get_public_url(storage_path)
                
                # C. Save Guest Profile to Database
                supabase.table('users').insert({
                    'id': guest_id, 
                    'name': guest_name, 
                    'face_id': face_id, 
                    'image_url': avatar_url, 
                    'role': 'Guest'
                }).execute()
                
                # D. Log their first Clock-In
                log_access_attempt(guest_id, "in", 100.0)
                
                return {
                    'message': guest_name,
                    'type': "guest",
                    'confidence': 100.0, # 100% match because we just created them!
                    'image_url': avatar_url,
                    'status': 'in'
                }

            except Exception as auto_reg_err:
                print(f"❌ Auto-Registration Error: {auto_reg_err}")
                return {'message': "REGISTRATION FAILED", 'type': "guest", 'confidence': 0.0, 'status': 'denied'}

        else:
            # --- MATCH FOUND (Employee or returning Guest) ---
            aws_id = response['FaceMatches'][0]['Face']['ExternalImageId']
            similarity = response['FaceMatches'][0]['Similarity']
            confidence = round(similarity, 1)
            
            # Check the database for their last log status to determine In vs Out
            last_log_response = supabase.table('access_logs').select('status').eq('user_id', aws_id).order('timestamp', desc=True).limit(1).execute()
            
            current_status = "in" # Default
            if last_log_response.data and len(last_log_response.data) > 0:
                if last_log_response.data[0]['status'] == "in":
                    current_status = "out"
            
            # Fetch user details
            user_profile = get_user_profile(aws_id)

            if user_profile:
                name = user_profile['name']
                image_url = user_profile.get('image_url', '')
                user_type = user_profile.get('role', 'Employee').lower() 
            else:
                name = f"ID: {aws_id}"
                image_url = ""
                user_type = "employee"

            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] ✅ {user_type.title()} Identified: {name} (Clocking {current_status.upper()})")
            log_access_attempt(aws_id, current_status, confidence) 
            
            return {
                'message': name,
                'type': user_type, 
                'confidence': confidence,
                'image_url': image_url,
                'status': current_status 
            }

    except Exception as e:
        print(f"❌ CRITICAL ERROR in recognize_face: {e}")
        raise HTTPException(status_code=500, detail={'error': 'System Error', 'details': str(e)})


# --- ROUTE: DASHBOARD REGISTRATION UPLOAD ---
@app.post('/api/employees/add')
async def add_employee(
    employee_id: str = Form(...),
    name: str = Form(...),
    role: str = Form("Employee"),
    image: UploadFile = File(...)
):
    """Registers a new person via the dashboard form."""
    
    if not image or not employee_id or not name:
        raise HTTPException(status_code=400, detail='Missing required fields')

    image_bytes = await image.read()
    filename = secure_filename(image.filename or "unknown.jpg")

    try:
        rek_response = rekognition.index_faces(
            CollectionId=Config.COLLECTION_ID, Image={'Bytes': image_bytes}, ExternalImageId=employee_id, MaxFaces=1, QualityFilter="AUTO", DetectionAttributes=['DEFAULT']
        )
        face_records = rek_response.get('FaceRecords', [])
        if not face_records: 
            raise HTTPException(status_code=400, detail='No face detected.')
        
        face_id = face_records[0]['Face']['FaceId']
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'AWS Error: {str(e)}')

    bucket_name = 'avatars' 
    storage_path = f"{employee_id}_{filename}"
    
    try:
        supabase.storage.from_(bucket_name).upload(path=storage_path, file=image_bytes, file_options={"content-type": image.content_type, "upsert": "true"})
        avatar_url = supabase.storage.from_(bucket_name).get_public_url(storage_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Storage Error: {str(e)}')

    try:
        supabase.table('users').insert({
            'id': employee_id, 
            'name': name, 
            'face_id': face_id, 
            'image_url': avatar_url, 
            'role': role     
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'DB Error: {str(e)}')
    
    return {'message': f'{role} added!', 'face_id': face_id, 'image_url': avatar_url}
    

if __name__ == '__main__':
    print(f"🚀 FastAPI Server Starting...")
    uvicorn.run("app:app", host=Config.HOST, port=Config.PORT, reload=True)