@echo off
title Uninstall MARG Envelope Manager
echo ==============================================================================
echo   REMOVING MARG ENVELOPE MANAGER & AUTO-START FROM WINDOWS
echo ==============================================================================
echo.

:: 1. Stop processes
taskkill /F /IM cloudflared.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: 2. Remove Auto-Start
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del "%STARTUP_FOLDER%\MARG_Envelope_Manager*.lnk" >nul 2>&1
schtasks /delete /tn "MARG_Envelope_Manager_AutoStart" /f >nul 2>&1

:: 3. Remove Desktop shortcuts
set "DESKTOP=%USERPROFILE%\Desktop"
del "%DESKTOP%\Shreeji MARG Envelope Manager*.bat" >nul 2>&1
del "%DESKTOP%\MARG Envelope Manager*.bat" >nul 2>&1
del "%DESKTOP%\Enable AutoStart on Reboot.bat" >nul 2>&1
del "%DESKTOP%\Disable AutoStart on Reboot.bat" >nul 2>&1

echo [OK] Auto-Start and Desktop shortcuts removed!
echo.
echo To delete the program folder, delete:
echo %USERPROFILE%\MARG-Envelope-Manager
echo.
pause
