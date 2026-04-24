@echo off
echo Starting SecureSight...
echo.

docker compose up --build -d

echo.
echo Waiting for services to be ready...
timeout /t 10 /nobreak >nul

set HOST_IP=localhost
for /f "tokens=2 delims=:" %%a in ('netsh interface ip show addresses "Wi-Fi" ^| findstr /i "IP Address"') do (
    for /f "tokens=1" %%b in ("%%a") do set HOST_IP=%%b
)

echo.
echo ============================================
echo   SecureSight is running!
echo ============================================
echo.
echo   Dashboard:  https://%HOST_IP%:3443
echo   Camera:     https://%HOST_IP%:3443/camera/main-entrance
echo   HTTP:       http://localhost:3000
echo.
echo   (Accept the SSL warning on first visit)
echo ============================================
pause
