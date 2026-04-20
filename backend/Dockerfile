FROM python:3.11-slim

# Install build deps for insightface/onnxruntime
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

COPY . .

# Create storage dirs
RUN mkdir -p avatars snapshots data

EXPOSE 5001

COPY start.sh .
RUN chmod +x start.sh

CMD ["./start.sh"]
