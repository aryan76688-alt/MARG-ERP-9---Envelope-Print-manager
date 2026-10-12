@echo off
title MARG ERP 9 - Envelope Print Manager Server
color 0A

echo ==============================================================================
echo   MARG ERP 9 - ENVELOPE PRINT MANAGER (WINDOWS 24/7 SERVER)
echo ==============================================================================
echo.

cd /d "%~dp0"

:: 1. Check Python installation
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Python is not found in PATH!
    echo [*] Installing Python via winget...
    winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    if %ERRORLEVEL% neq 0 (
        echo [X] Please install Python from https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

:: 2. Auto-Update from GitHub on each launch
git --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [*] Checking for updates from GitHub...
    git pull origin main 2>nul
)

:: 3. Install/verify Python packages
echo [*] Verifying Python backend packages...
python -m pip install --upgrade pip --quiet 2>nul
python -m pip install -r backend\requirements.txt --quiet 2>nul

:: 4. Check/Download Cloudflare Tunnel client
if not exist "cloudflared.exe" (
    echo [*] Downloading Cloudflare Tunnel (cloudflared.exe)...
    curl -Lo cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe 2>nul
)

:: 5. Launch FastAPI Backend in background
echo.
echo [*] Starting Backend Server on http://localhost:8080...
cd /d "%~dp0\backend"
start "MARG Backend Server" /min python -m uvicorn main:app --host 0.0.0.0 --port 8080
cd /d "%~dp0"

:: 6. Wait for backend to initialize
timeout /t 3 /nobreak >nul

:: 7. Start Cloudflare Tunnel
echo.
echo ==============================================================================
echo [OK] Connecting to Cloudflare 24/7 Tunnel (remote)...
echo ==============================================================================
echo Web App is live on: https://shreeji-envelope-manager.pages.dev
echo Local access on:    http://localhost:8080
echo.

if exist "cloudflared.exe" (
    cloudflared.exe tunnel run --token eyJhIjoiZGEyZGRiOTVmYmVhMjQzNGM4YWMwYTFhNjViN2Y3MjEiLCJ0IjoiOTAwY2I1Y2EtOTY5ZC00MzAzLTk3ZWYtMDZmMjVjMTEzZDExIiwicyI6Ill6WTRObUV6T0RFdE56QmhNUzAwTmpCa0xXSXdPREV0WWpFMk16VmxOVE00TnpGbCJ9 --protocol http2 --edge-ip-version 4
) else (
    echo [!] Running locally without cloudflared.
    pause
)
