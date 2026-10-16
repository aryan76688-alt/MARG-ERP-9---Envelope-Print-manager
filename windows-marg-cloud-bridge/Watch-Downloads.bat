@echo off
title MARG Cloud Downloads Watcher (Dual Sync)
color 0b

echo ==============================================================================
echo    MARG CLOUD DOWNLOADS AUTO-SYNC TO ENVELOPE MANAGER ^& SHREEJI ORDER BOOK
echo ==============================================================================
echo.
echo Watching your Downloads folder for any exported Marg files...
echo Keep this window minimized while working in Marg Cloud.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Watch-Downloads.ps1"

pause
