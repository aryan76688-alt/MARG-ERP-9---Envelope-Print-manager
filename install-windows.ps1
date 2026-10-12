$ErrorActionPreference = "Continue"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "   MARG ERP 9 ENVELOPE MANAGER - 100% BULLETPROOF WINDOWS DEPLOYMENT" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $HOME
$targetDir = "$HOME\MARG-Envelope-Manager"

# 1. Clean up old/broken current system processes
Write-Host "[1/6] Stopping any existing server processes and cleaning up old files..." -ForegroundColor Yellow
try {
    Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
} catch {}
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "uvicorn" -Force -ErrorAction SilentlyContinue

# Safely preserve database if previous installation exists
$dbBackup = "$env:TEMP\envelope_manager_backup.db"
if (Test-Path "$targetDir\backend\envelope_manager.db") {
    Write-Host "[*] Preserving your existing database (parties & print history)..." -ForegroundColor Cyan
    Copy-Item -Path "$targetDir\backend\envelope_manager.db" -Destination $dbBackup -Force
}

# Clean old startup shortcuts & scheduled tasks
$startupFolder = [Environment]::GetFolderPath("Startup")
Remove-Item -Path "$startupFolder\MARG_Envelope_Manager*.lnk" -Force -ErrorAction SilentlyContinue
try {
    schtasks /delete /tn "MARG_Envelope_Manager_AutoStart" /f 2>$null
} catch {}

# 2. Check/Install Python 3
Write-Host "[2/6] Verifying Python runtime..." -ForegroundColor Cyan
$pythonPath = $null

if (Get-Command py -ErrorAction SilentlyContinue) {
    try {
        $testPy = & py -3 -c "import sys; print(sys.version_info.major)" 2>&1
        if ($testPy -match "3") { $pythonPath = "py" }
    } catch {}
}

if (-not $pythonPath -and (Get-Command python -ErrorAction SilentlyContinue)) {
    try {
        $testPy = & python -c "import sys; print(sys.version_info.major)" 2>&1
        if ($testPy -match "3") { 
            $pythonPath = (Get-Command python).Source
        }
    } catch {}
}

if (-not $pythonPath) {
    $candidatePaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:ProgramFiles\Python312\python.exe",
        "C:\Python312\python.exe"
    )
    foreach ($p in $candidatePaths) {
        if (Test-Path $p) {
            $pythonPath = $p
            $env:Path = (Split-Path $p) + ";" + (Join-Path (Split-Path $p) "Scripts") + ";" + $env:Path
            break
        }
    }
}

if (-not $pythonPath) {
    Write-Host "[*] Python 3 not detected. Downloading official Python 3.12 installer..." -ForegroundColor Yellow
    $pyInstaller = "$env:TEMP\python-3.12.8-amd64.exe"
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe" -OutFile $pyInstaller
    Write-Host "[*] Installing Python 3.12 (silent)..." -ForegroundColor Cyan
    Start-Process -FilePath $pyInstaller -ArgumentList "/quiet", "InstallAllUsers=0", "PrependPath=1", "Include_pip=1" -Wait
    Remove-Item -Path $pyInstaller -Force

    $pyPath = "$env:LOCALAPPDATA\Programs\Python\Python312"
    $pyScripts = "$env:LOCALAPPDATA\Programs\Python\Python312\Scripts"
    $env:Path = "$pyPath;$pyScripts;" + $env:Path
    $pythonPath = "$pyPath\python.exe"
}

Write-Host "    Using Python: $pythonPath" -ForegroundColor Green

# 3. Download / Update Application Code
Write-Host "[3/6] Fetching latest application code..." -ForegroundColor Cyan
$downloaded = $false

if (Test-Path "$targetDir\.git") {
    try {
        Write-Host "    Updating existing repository via Git..." -ForegroundColor Gray
        Set-Location $targetDir
        git fetch origin main --quiet
        git reset --hard origin/main --quiet
        git clean -fd --quiet
        $downloaded = $true
    } catch {}
}

if (-not $downloaded -and (Get-Command git -ErrorAction SilentlyContinue)) {
    try {
        if (Test-Path $targetDir) {
            Remove-Item -Path $targetDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        Write-Host "    Cloning via Git..." -ForegroundColor Gray
        git clone --depth 1 https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git $targetDir
        if (Test-Path "$targetDir\backend") { $downloaded = $true }
    } catch {}
}

if (-not $downloaded) {
    Write-Host "    Downloading ZIP archive directly from GitHub..." -ForegroundColor Gray
    if (Test-Path $targetDir) {
        Remove-Item -Path $targetDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    $zipPath = "$env:TEMP\marg_app.zip"
    $extractPath = "$env:TEMP\marg_extracted"
    Remove-Item -Path $extractPath -Recurse -Force -ErrorAction SilentlyContinue
    
    Invoke-WebRequest -Uri "https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager/archive/refs/heads/main.zip" -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    
    $extractedFolder = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1
    Move-Item -Path $extractedFolder.FullName -Destination $targetDir -Force
    
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractPath -Recurse -Force -ErrorAction SilentlyContinue
}

# Restore database if backup existed
if (Test-Path $dbBackup) {
    Write-Host "[*] Restoring your preserved database..." -ForegroundColor Green
    Copy-Item -Path $dbBackup -Destination "$targetDir\backend\envelope_manager.db" -Force
    Remove-Item -Path $dbBackup -Force -ErrorAction SilentlyContinue
}

# Save Python path for batch scripts
Set-Content -Path "$targetDir\python_env.bat" -Value "@set `"PYTHON_EXE=$pythonPath`""

# 4. Install Python Backend Packages
Write-Host "[4/6] Installing backend dependencies..." -ForegroundColor Cyan
Set-Location $targetDir
& $pythonPath -m pip install --upgrade pip --quiet
& $pythonPath -m pip install -r backend\requirements.txt --quiet

# 5. Download Cloudflare Tunnel client
Write-Host "[5/6] Verifying Cloudflare Tunnel binary (cloudflared.exe)..." -ForegroundColor Cyan
if (-not (Test-Path "$targetDir\cloudflared.exe")) {
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$targetDir\cloudflared.exe"
}

# 6. Configure 24/7 Auto-Start on Windows Reboot / Startup & Shortcuts
Write-Host "[6/6] Configuring 24/7 Auto-Start on Windows Reboot..." -ForegroundColor Cyan
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

# Create Desktop Shortcut
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutScript = @"
@echo off
cd /d "$targetDir"
call start-windows-server.bat
"@
Set-Content -Path "$desktopPath\Shreeji MARG Envelope Manager.bat" -Value $shortcutScript

# Helpers to Enable/Disable
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
Write-Host " [SUCCESS] 100% Clean Installation Complete on Windows!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "   1. 24/7 Auto-Start: ENABLED on PC Reboot / Restart" -ForegroundColor White
Write-Host "   2. Desktop Shortcut: 'Shreeji MARG Envelope Manager.bat' created" -ForegroundColor White
Write-Host "   3. Starting server now on http://localhost:8080..." -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""

# Launch the server
Set-Location $targetDir
& ".\start-windows-server.bat"
