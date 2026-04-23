FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas-dev \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    g++ \
    cmake \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --upgrade pip

COPY requirements.txt .
RUN pip install --default-timeout=1000 --no-cache-dir --prefer-binary -r requirements.txt

COPY . .

# Create storage dirs
RUN mkdir -p avatars snapshots data

EXPOSE 5001

COPY start.sh .
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

CMD ["./start.sh"]
