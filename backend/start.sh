#!/bin/sh
python -c "
import os, time, shutil, insightface

model_dir = os.path.expanduser('~/.insightface/models/antelopev2')
zip_path = os.path.expanduser('~/.insightface/models/antelopev2.zip')

def model_ready():
    return os.path.isdir(model_dir) and len(os.listdir(model_dir)) >= 4

if not model_ready():
    for attempt in range(5):
        print(f'Downloading antelopev2 model (attempt {attempt + 1}/5)...')
        # Clean up partial downloads
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
                print('WARNING: Could not download model after 5 attempts. Face recognition will not work until model is available.')
else:
    print('Model already cached')
"
exec uvicorn app:app --host 0.0.0.0 --port 5001
