import cv2
import threading
import time
import math
import mediapipe as mp
import datetime 
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

# --- IMPORT OUR CUSTOM MODULES ---
from config import Config
from database import upload_image_to_supabase, get_user_profile, log_access_attempt
from aws import search_face, rekognition

# --- FLASK SETUP ---
app = Flask(__name__)
CORS(app)

# --- INITIALIZE MEDIAPIPE & CAMERA ---
mp_face_detection = mp.solutions.face_detection
face_detection = mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.6)

video_capture = cv2.VideoCapture(0)
if not video_capture.isOpened():
    video_capture = cv2.VideoCapture(1)

# --- GLOBAL VARIABLES (State Management) ---
scan_result_message = "Initializing..." 
status_color = (255, 255, 255)
current_status_type = "idle"
processing_enabled = True 
current_confidence = 0.0
current_image_url = ""

# --- MATH HELPERS ---
def get_center(x, y, w, h):
    return (int(x + w / 2), int(y + h / 2))

def get_distance(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

# --- CORE LOGIC ---
def check_face_identity(image_bytes):
    global scan_result_message, status_color, current_status_type, current_confidence, current_image_url
    
    try:
        # Simulation Mode check
        if not rekognition:
            scan_result_message = "SIMULATION: ACCESS GRANTED"
            status_color = (0, 255, 0)
            current_status_type = "employee"
            current_confidence = 0
            return

        # 1. Ask AWS who this is
        response = search_face(image_bytes)
        
        # 2. Process Result
        if not response or not response['FaceMatches']:
            print("👤 Guest Detected - Uploading Image...")
            guest_image_url = upload_image_to_supabase(image_bytes)
            
            scan_result_message = "ACCESS GRANTED: GUEST"
            status_color = (0, 255, 0)
            current_status_type = "guest"
            current_confidence = 0.0
            current_image_url = guest_image_url 
            
            log_access_attempt(None, "in", 0.0, captured_image_url=guest_image_url)

        else:
            aws_id = response['FaceMatches'][0]['Face']['ExternalImageId']
            similarity = response['FaceMatches'][0]['Similarity']
            
            user_profile = get_user_profile(aws_id)

            if user_profile:
                scan_result_message = f"ACCESS GRANTED: {user_profile['name']}"
                current_image_url = user_profile.get('image_url', '')
            else:
                scan_result_message = f"ID: {aws_id}"
                current_image_url = ""

            status_color = (0, 255, 0)
            current_status_type = "employee"
            current_confidence = round(similarity, 1)
            
            log_access_attempt(aws_id, "granted", current_confidence)

    except Exception as main_error:
        print(f"❌ CRITICAL ERROR in check_face_identity: {main_error}")
        scan_result_message = "SYSTEM ERROR"
        current_status_type = "idle" 

# --- VIDEO GENERATOR ---
def generate_frames():
    global scan_result_message, status_color, current_status_type, processing_enabled, current_confidence
    
    anchor_center = None
    still_start_time = None
    system_lock_until = 0
    frozen_frame_bytes = None

    while True:
        if current_status_type == "scanning":
            if frozen_frame_bytes:
                yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + frozen_frame_bytes + b'\r\n')
            time.sleep(0.03) 
            continue 

        success, frame = video_capture.read()
        if not success:
            break

        if not processing_enabled:
            anchor_center = None       
            still_start_time = None    
            cv2.putText(frame, "SYSTEM PAUSED", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            continue 

        current_time = time.time()
        h_img, w_img, _ = frame.shape 

        if current_time < system_lock_until:
            pass 
        else:
            if current_status_type in ["employee", "guest"]:
                current_status_type = "idle"
                scan_result_message = "Monitoring..."
                status_color = (255, 255, 255)
                current_confidence = 0.0

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_detection.process(rgb_frame)

            if results.detections:
                for detection in results.detections:
                    bboxC = detection.location_data.relative_bounding_box
                    x = int(bboxC.xmin * w_img)
                    y = int(bboxC.ymin * h_img)
                    w_box = int(bboxC.width * w_img)
                    h_box = int(bboxC.height * h_img)
                    
                    x1, y1 = max(0, x - Config.PADDING), max(0, y - Config.PADDING)
                    x2, y2 = min(w_img, x + w_box + Config.PADDING), min(h_img, y + h_box + Config.PADDING)

                    cv2.rectangle(frame, (x1, y1), (x2, y2), status_color, 2)
                    
                    current_center = get_center(x, y, w_box, h_box)
                    if anchor_center is None:
                        anchor_center = current_center
                        still_start_time = current_time

                    drift = get_distance(current_center, anchor_center)

                    if drift > Config.MOVEMENT_THRESHOLD:
                        anchor_center = current_center
                        still_start_time = current_time
                        cv2.putText(frame, "MOVEMENT", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255), 2)
                    else:
                        time_still = current_time - still_start_time
                        if time_still >= Config.REQUIRED_STILL_TIME:
                            if current_status_type != "scanning":
                                print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 📸 Snap! Checking Identity...")
                                
                                current_status_type = "scanning" 
                                scan_result_message = "Identifying..."
                                status_color = (0, 165, 255)
                                
                                face_image = frame[y1:y2, x1:x2]
                                ret, freeze_buffer = cv2.imencode('.jpg', frame)
                                frozen_frame_bytes = freeze_buffer.tobytes()

                                if face_image.size > 0:
                                    _, img_encoded = cv2.imencode('.jpg', face_image)
                                    threading.Thread(target=check_face_identity, args=(img_encoded.tobytes(),)).start()
                                    
                                    system_lock_until = current_time + Config.SUCCESS_LOCK_TIME
                                    anchor_center = None
                                    still_start_time = None
                        else:
                            remaining = max(0, int(Config.REQUIRED_STILL_TIME - time_still) + 1)
                            cv2.putText(frame, f"HOLD STILL: {remaining}", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 2)
            else:
                anchor_center = None

        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

# --- FLASK ROUTES ---
@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/status')
def get_status():
    return jsonify({
        'message': scan_result_message,
        'type': current_status_type,
        'confidence': current_confidence,
        'image_url': current_image_url
    })

@app.route('/toggle_processing', methods=['POST'])
def control_processing():
    global processing_enabled
    data = request.json
    processing_enabled = data.get('active', True)
    status_msg = "▶️ Resumed" if processing_enabled else "⏸️ Paused"
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {status_msg}")
    return jsonify({"success": True, "active": processing_enabled})

if __name__ == '__main__':
    print(f"🚀 Server Running on port {Config.PORT}...")
    print("✅ Logs Enabled: Watch this terminal for updates.")
    app.run(host=Config.HOST, port=Config.PORT, debug=True)