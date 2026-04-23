@echo off
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set HOST_IP=%%b
)
docker compose up -d
docker compose logs ready
