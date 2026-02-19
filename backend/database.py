import datetime
import uuid
from supabase import create_client, Client
from config import Config

# --- INITIALIZE SUPABASE ---
supabase: Client = None
if Config.SUPABASE_URL and Config.SUPABASE_KEY:
    try:
        supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
        print("✅ Supabase Connected")
    except Exception as e:
        print(f"⚠️ Supabase Connection Failed: {e}")

# --- PERFORMANCE CACHE ---
USER_STATE_CACHE = {} 
KNOWN_USERS_CACHE = set()

def upload_image_to_supabase(image_bytes):
    if not supabase: return None
    try:
        filename = f"guest_{uuid.uuid4()}.jpg"
        supabase.storage.from_(Config.GUEST_BUCKET_NAME).upload(
            path=filename,
            file=image_bytes,
            file_options={"content-type": "image/jpeg"}
        )
        return supabase.storage.from_(Config.GUEST_BUCKET_NAME).get_public_url(filename)
    except Exception as e:
        print(f"❌ Upload Failed: {e}")
        return None

def get_user_profile(user_id):
    if not supabase: return None
    try:
        response = supabase.table('users').select("*").eq('id', user_id).execute()
        if response.data:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Supabase Error: {e}")
        return None

def log_access_attempt(user_id, status_type, confidence, captured_image_url=None):
    if not supabase: return
    final_status = status_type
    
    try:
        if user_id:
            if user_id not in KNOWN_USERS_CACHE:
                check = supabase.table('users').select('id').eq('id', user_id).execute()
                if not check.data:
                    supabase.table('users').insert({
                        "id": user_id, "name": f"Unregistered ({user_id})", "role": "employee", "image_url": "" 
                    }).execute()
                KNOWN_USERS_CACHE.add(user_id) 

            if user_id in USER_STATE_CACHE:
                last_status = USER_STATE_CACHE[user_id]
                final_status = 'out' if last_status == 'in' else 'in'
            else:
                last_log = supabase.table('access_logs').select('status').eq('user_id', user_id).order('timestamp', desc=True).limit(1).execute()
                if last_log.data:
                    final_status = 'out' if last_log.data[0]['status'] == 'in' else 'in'
                else:
                    final_status = 'in'
            USER_STATE_CACHE[user_id] = final_status
        else:
            final_status = 'in' # Guests are automatically "in"

        data = {
            "user_id": user_id, 
            "status": final_status,
            "confidence": float(confidence),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        
        if captured_image_url:
            data["snapshot_url"] = captured_image_url

        supabase.table('access_logs').insert(data).execute()
        
        direction_emoji = "➡️" if final_status == 'in' else "⬅️"
        print(f"✅ Logged: {user_id if user_id else 'Guest'} ({direction_emoji} {final_status.upper()})")

    except Exception as e:
        print(f"❌ Logging Error: {e}")