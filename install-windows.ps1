$ErrorActionPreference = "Continue"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "   MARG ERP 9 ENVELOPE MANAGER - 1-CLICK WINDOWS SETUP" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check/Install Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Git not found. Installing Git via winget..." -ForegroundColor Yellow
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 2. Check/Install Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Python not found. Installing Python via winget..." -ForegroundColor Yellow
    winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements --silent
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 3. Target Directory
$targetDir = "$HOME\MARG-Envelope-Manager"
if (Test-Path "$targetDir\.git") {
    Write-Host "[*] Updating existing repository in $targetDir..." -ForegroundColor Cyan
    Set-Location $targetDir
    git pull origin main
} else {
    Write-Host "[*] Cloning repository into $targetDir..." -ForegroundColor Cyan
    git clone --depth 1 https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git $targetDir
    Set-Location $targetDir
}

# 4. Install Python Dependencies
Write-Host "[*] Installing Python backend packages..." -ForegroundColor Cyan
python -m pip install --upgrade pip --quiet
python -m pip install -r backend/requirements.txt --quiet

# 5. Download cloudflared.exe
if (-not (Test-Path "$targetDir\cloudflared.exe")) {
    Write-Host "[*] Downloading Cloudflare Tunnel (cloudflared.exe)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$targetDir\cloudflared.exe"
}

# 6. Create Desktop Shortcuts & Enable 24/7 Auto-Start on Windows Reboot
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutScript = @"
@echo off
cd /d "$targetDir"
call start-windows-server.bat
"@
Set-Content -Path "$desktopPath\MARG Envelope Manager.bat" -Value $shortcutScript

# 7. Configure 24/7 Auto-Start on Windows Reboot / Startup
Write-Host "[*] Configuring 24/7 Auto-Start on Windows Reboot / Startup..." -ForegroundColor Cyan
$startupFolder = [Environment]::GetFolderPath("Startup")
$wsh = New-Object -ComObject WScript.Shell
$startupShortcut = $wsh.CreateShortcut("$startupFolder\MARG_Envelope_Manager.lnk")
$startupShortcut.TargetPath = "wscript.exe"
$startupShortcut.Arguments = """$targetDir\run-silent.vbs"""
$startupShortcut.WorkingDirectory = $targetDir
$startupShortcut.Description = "MARG ERP 9 Envelope Print Manager 24/7 Auto-Start"
$startupShortcut.Save()

try {
    schtasks /create /tn "MARG_Envelope_Manager_AutoStart" /tr "wscript.exe `"$targetDir\run-silent.vbs`"" /sc onlogon /rl highest /f 2>$null
} catch {}

# Create Desktop Helpers to easily Enable/Disable Auto-Start
$enableScript = @"
@echo off
cd /d "$targetDir"
call enable-autostart-windows.bat
"@
Set-Content -Path "$desktopPath\Enable AutoStart on Reboot.bat" -Value $enableScript

$disableScript = @"
@echo off
cd /d "$targetDir"
call disable-autostart-windows.bat
"@
Set-Content -Path "$desktopPath\Disable AutoStart on Reboot.bat" -Value $disableScript

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Setup Complete!" -ForegroundColor Green
Write-Host "   1. Desktop shortcut created: 'MARG Envelope Manager.bat'" -ForegroundColor Green
Write-Host "   2. 24/7 Auto-Start ENABLED: Server will automatically start whenever PC reboots!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""

# 8. Start server now
Set-Location $targetDir
& ".\start-windows-server.bat"
