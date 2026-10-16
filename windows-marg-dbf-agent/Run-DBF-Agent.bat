@echo off
title MARG ERP 9+ Direct FoxPro DBF Real-Time Sync Agent
color 0A

echo =======================================================
echo   MARG ERP 9+ Direct Visual FoxPro .DBF Sync Agent
echo   Option B - Real-Time Shared Read (Zero Database Lock)
echo =======================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.8+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [*] Checking dependencies (dbfread, requests)...
python -m pip install --quiet dbfread requests

echo [*] Launching Real-Time FoxPro DBF Agent...
python marg_dbf_agent.py

pause
