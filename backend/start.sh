#!/bin/sh

# Wait for MySQL to be ready
echo "Waiting for MySQL..."
python -c "
import os, time, mysql.connector
for i in range(30):
    try:
        conn = mysql.connector.connect(
            host=os.environ.get('DB_HOST', 'mysql'),
            port=int(os.environ.get('DB_PORT', '3306')),
            user=os.environ.get('DB_USER', 'securesight'),
            password=os.environ.get('DB_PASSWORD', 'securesight'),
            database=os.environ.get('DB_NAME', 'securesight'),
        )
        conn.close()
        print('MySQL is ready!')
        break
    except Exception as e:
        print(f'MySQL not ready (attempt {i+1}/30): {e}')
        time.sleep(2)
else:
    print('WARNING: Could not connect to MySQL after 60 seconds')
"

# Download InsightFace model if needed
python -c "
import os, time, shutil, insightface

model_dir = os.path.expanduser('~/.insightface/models/antelopev2')
zip_path = os.path.expanduser('~/.insightface/models/antelopev2.zip')

def fix_nesting():
    nested = os.path.join(model_dir, 'antelopev2')
    if os.path.isdir(nested) and any(f.endswith('.onnx') for f in os.listdir(nested)):
        for f in os.listdir(nested):
            shutil.move(os.path.join(nested, f), os.path.join(model_dir, f))
        os.rmdir(nested)
        print('Fixed nested antelopev2 directory')

def model_ready():
    fix_nesting()
    return os.path.isdir(model_dir) and len([f for f in os.listdir(model_dir) if f.endswith('.onnx')]) >= 4

if not model_ready():
    for attempt in range(5):
        print(f'Downloading antelopev2 model (attempt {attempt + 1}/5)...')
        if os.path.exists(zip_path):
            os.remove(zip_path)
        if os.path.isdir(model_dir):
            shutil.rmtree(model_dir)
        try:
            app = insightface.app.FaceAnalysis(name='antelopev2', providers=['CPUExecutionProvider'])
            app.prepare(ctx_id=-1, det_size=(640, 640))
            print('Model downloaded successfully')
            break
        except Exception as e:
            print(f'Download failed: {e}')
            if attempt < 4:
                print('Retrying in 5 seconds...')
                time.sleep(5)
            else:
                print('WARNING: Could not download model after 5 attempts.')
else:
    print('Model already cached')
"
exec uvicorn app:app --host 0.0.0.0 --port 5001
