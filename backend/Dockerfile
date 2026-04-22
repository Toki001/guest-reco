FROM python:3.11-slim

# Runtime deps only (no build-essential/cmake — use pre-built wheels)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --default-timeout=1000 --no-cache-dir --prefer-binary -r requirements.txt

COPY . .

# Create storage dirs
RUN mkdir -p avatars snapshots data

EXPOSE 5001

COPY start.sh .
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

CMD ["./start.sh"]
