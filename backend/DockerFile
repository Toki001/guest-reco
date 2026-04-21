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

# Pre-download the antelopev2 model manually (insightface auto-download can fail in Docker)
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl \
    && mkdir -p /root/.insightface/models \
    && curl -L -o /tmp/antelopev2.zip https://github.com/deepinsight/insightface/releases/download/v0.7/antelopev2.zip \
    && unzip /tmp/antelopev2.zip -d /root/.insightface/models \
    && rm /tmp/antelopev2.zip \
    && apt-get purge -y unzip curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY . .

# Create storage dirs
RUN mkdir -p avatars snapshots data

EXPOSE 5001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001"]
