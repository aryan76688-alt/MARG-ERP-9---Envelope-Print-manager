# ==============================================================================
# MARG ERP 9 Envelope Print Manager - 1-Click Windows 24/7 Server Installer
# Automatically installs Python, Git, cloudflared, sets up Auto-Start on PC Reboot
# ==============================================================================

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "   MARG ERP 9 ENVELOPE MANAGER - 1-CLICK WINDOWS 24/7 SETUP" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Install Git if missing
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[1/6] Installing Git via winget..." -ForegroundColor Yellow
    winget install Git.Git -e --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "[1/6] Git is already installed." -ForegroundColor Green
}

# 2. Install Python if missing
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[2/6] Installing Python 3.12 via winget..." -ForegroundColor Yellow
    winget install Python.Python.3.12 -e --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "[2/6] Python is already installed." -ForegroundColor Green
}

# 3. Clone / Update Repository
$installPath = "$HOME\MARG-Envelope-Manager"
Write-Host "[3/6] Setting up project directory at $installPath..." -ForegroundColor Cyan

if (Test-Path "$installPath\.git") {
    Set-Location $installPath
    git pull origin main
} else {
    git clone --depth 1 https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git $installPath
    Set-Location $installPath
}

# 4. Install Python Dependencies
Write-Host "[4/6] Installing Python backend packages..." -ForegroundColor Cyan
python -m pip install --upgrade pip --quiet
python -m pip install -r backend/requirements.txt --quiet

# 5. Download cloudflared.exe for Windows
if (-not (Test-Path "$installPath\cloudflared.exe")) {
    Write-Host "[5/6] Downloading Cloudflare Tunnel (cloudflared.exe)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$installPath\cloudflared.exe"
}

# 6. Configure Auto-Start on Windows Reboot
Write-Host "[6/6] Configuring Auto-Start on Windows Reboot/Restart..." -ForegroundColor Cyan
$startupFolder = [Environment]::GetFolderPath("Startup")
$vbsPath = "$installPath\run-silent.vbs"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$startupFolder\MARG_Envelope_Manager.lnk")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$vbsPath`""
$Shortcut.WorkingDirectory = "$installPath"
$Shortcut.Description = "MARG ERP 9 Envelope Print Manager 24/7 Server"
$Shortcut.Save()

# Also create Desktop Shortcut
$desktopFolder = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = $WshShell.CreateShortcut("$desktopFolder\MARG Envelope Manager.lnk")
$desktopShortcut.TargetPath = "$installPath\start-windows-server.bat"
$desktopShortcut.WorkingDirectory = "$installPath"
$desktopShortcut.Description = "Launch MARG Envelope Manager"
$desktopShortcut.Save()

# Register Scheduled Task for boot/logon
schtasks /create /tn "MARG_Envelope_Manager_AutoStart" /tr "wscript.exe `"$vbsPath`"" /sc onlogon /rl highest /f 2>$null

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "🎉 INSTALLATION COMPLETE! YOUR PC IS NOW CONFIGURED AS A 24/7 SERVER" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "  ✅ Auto-Start on Reboot: ENABLED (Runs silently in background on PC boot)" -ForegroundColor Yellow
Write-Host "  ✅ Desktop Shortcut: Created on your Desktop" -ForegroundColor Yellow
Write-Host "  ✅ Web Application: https://shreeji-envelope-manager.pages.dev" -ForegroundColor Yellow
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Starting server and Cloudflare tunnel now..." -ForegroundColor Cyan

# Start server now
& "$installPath\start-windows-server.bat"
