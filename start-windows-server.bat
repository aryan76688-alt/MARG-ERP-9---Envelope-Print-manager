@echo off
title Shreeji MARG ERP 9 - Envelope Print Manager Server
color 0A

echo ==============================================================================
echo   SHREEJI MARG ERP 9 - ENVELOPE PRINT MANAGER (WINDOWS SERVER)
echo ==============================================================================
echo.

cd /d "%~dp0"

:: 1. Ensure Python runtime is detected
set "PY_CMD="
py -3 --version >nul 2>&1 && set "PY_CMD=py -3"
if not defined PY_CMD (
    python --version >nul 2>&1 && set "PY_CMD=python"
)
if not defined PY_CMD (
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    )
)
if not defined PY_CMD (
    echo [!] Python is not found. Launching automatic installer...
    powershell -ExecutionPolicy Bypass -File install-windows.ps1
    exit /b
)

:: 2. Auto-Update from GitHub if Git exists
git --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [*] Checking for updates from GitHub...
    git pull origin main 2>nul
)

:: 3. Clean up any hanging instance on port 8080
echo [*] Ensuring port 8080 is available...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM cloudflared.exe >nul 2>&1

:: 4. Install/verify Python packages
echo [*] Verifying backend packages...
%PY_CMD% -m pip install -r backend\requirements.txt --quiet 2>nul

:: 5. Launch FastAPI Backend in background window from backend directory
echo [*] Starting Backend Server on http://localhost:8080...
cd /d "%~dp0backend"
start "MARG Backend Server" /min %PY_CMD% -m uvicorn main:app --host 0.0.0.0 --port 8080
cd /d "%~dp0"

:: 6. Wait for backend to initialize
timeout /t 3 /nobreak >nul

:: 7. Find Local LAN IP
set "LAN_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" 2^>nul') do (
    set "LAN_IP=%%a"
)

echo.
echo ==============================================================================
echo [OK] SERVER IS LIVE 24/7!
echo ==============================================================================
echo   Local PC Access:   http://localhost:8080
if defined LAN_IP (
echo   Same Wi-Fi Access: http:%LAN_IP%:8080
)
echo   Cloud Web Link:    https://shreeji-envelope-manager.pages.dev
echo ==============================================================================
echo.

:: 8. Open browser automatically
start http://localhost:8080

:: 9. Start Cloudflare Tunnel
if exist "cloudflared.exe" (
    cloudflared.exe tunnel run --token eyJhIjoiZGEyZGRiOTVmYmVhMjQzNGM4YWMwYTFhNjViN2Y3MjEiLCJ0IjoiOTAwY2I1Y2EtOTY5ZC00MzAzLTk3ZWYtMDZmMjVjMTEzZDExIiwicyI6Ill6WTRObUV6T0RFdE56QmhNUzAwTmpCa0xXSXdPREV0WWpFMk16VmxOVE00TnpGbCJ9 --protocol http2 --edge-ip-version 4
)
