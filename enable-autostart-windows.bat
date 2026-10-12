@echo off
title Configure Auto-Start on Windows Boot
cd /d "%~dp0"

echo ==============================================================================
echo   ENABLING 24/7 AUTO-START ON WINDOWS REBOOT / RESTART
echo ==============================================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_VBS=%~dp0run-silent.vbs"

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\CreateShortcut.vbs"
echo sLinkFile = "%STARTUP_FOLDER%\MARG_Envelope_Manager.lnk" >> "%TEMP%\CreateShortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\CreateShortcut.vbs"
echo oLink.TargetPath = "wscript.exe" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Arguments = """%TARGET_VBS%""" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.WorkingDirectory = "%~dp0" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Description = "MARG ERP 9 Envelope Print Manager Auto-Start" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Save >> "%TEMP%\CreateShortcut.vbs"

cscript //nologo "%TEMP%\CreateShortcut.vbs"
del "%TEMP%\CreateShortcut.vbs" >nul 2>&1

schtasks /create /tn "MARG_Envelope_Manager_AutoStart" /tr "wscript.exe \"%TARGET_VBS%\"" /sc onlogon /rl highest /f >nul 2>&1

echo [OK] Auto-Start Enabled Successfully!
echo      The server will now automatically start in the background whenever:
echo        1. Your Windows PC turns on or reboots.
echo        2. Any user logs in.
echo.
pause
