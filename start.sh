#!/usr/bin/env bash
export HOST_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
docker compose up -d
docker compose logs ready
