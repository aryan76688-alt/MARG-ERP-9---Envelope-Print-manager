@echo off
title Disable Auto-Start on Windows Boot
cd /d "%~dp0"

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del "%STARTUP_FOLDER%\MARG_Envelope_Manager.lnk" >nul 2>&1
schtasks /delete /tn "MARG_Envelope_Manager_AutoStart" /f >nul 2>&1

echo [OK] Auto-Start has been disabled.
pause
