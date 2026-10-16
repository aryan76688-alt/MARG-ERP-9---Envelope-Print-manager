# Windows PowerShell Downloads Auto-Watcher for MARG Cloud
# Automatically sends Marg exports to Envelope Manager & Shreeji Order Book

$ErrorActionPreference = "Continue"

$envelopeUrl = "https://marg-envelope-manager-production.up.railway.app"
$b2bUrl      = "https://shreeji-healthcare.up.railway.app"
$secretKey   = "shreeji-marg-sync-secret-2026"

$userDownloads = [System.IO.Path]::Combine($env:USERPROFILE, "Downloads")
$margFolder    = [System.IO.Path]::Combine($userDownloads, "Marg Cloud")

$watchFolder = if (Test-Path $margFolder) { $margFolder } else { $userDownloads }

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " MARG CLOUD DUAL SYNC WATCHER (POWERSHELL EDITION)" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Watching Directory : $watchFolder" -ForegroundColor Yellow
Write-Host "Envelope App Target: $envelopeUrl" -ForegroundColor Gray
Write-Host "Shreeji App Target : $b2bUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "[*] Status: Active! Whenever Marg Cloud downloads a file, it will sync automatically." -ForegroundColor Green
Write-Host "Press Ctrl + C anytime to stop.`n" -ForegroundColor DarkGray

$seenFiles = @{}
Get-ChildItem -Path $watchFolder -File -Include *.csv, *.xlsx, *.xls | ForEach-Object {
    $seenFiles[$_.FullName] = $_.LastWriteTime
}

while ($true) {
    Start-Sleep -Seconds 3
    $currentFiles = Get-ChildItem -Path $watchFolder -File -Include *.csv, *.xlsx, *.xls -ErrorAction SilentlyContinue

    foreach ($file in $currentFiles) {
        $path = $file.FullName
        $lastMod = $file.LastWriteTime

        if (-not $seenFiles.ContainsKey($path) -or $seenFiles[$path] -ne $lastMod) {
            $seenFiles[$path] = $lastMod
            
            # Wait for file download to finish unlocking
            Start-Sleep -Seconds 1
            Write-Host "`n[NEW FILE DETECTED] $($file.Name)" -ForegroundColor Cyan
            
            if ($file.Extension -eq ".csv") {
                try {
                    $rows = Import-Csv -Path $path -ErrorAction Stop
                    Write-Host "  -> Parsed $($rows.Count) rows from CSV." -ForegroundColor Gray
                    
                    # 1. Send to Envelope Manager
                    $headers = $rows[0].PSObject.Properties.Name | ForEach-Object { $_.ToLower() }
                    $isParty = ($headers -match "party" -or $headers -match "name" -or $headers -match "station" -or $headers -match "city")
                    
                    if ($isParty) {
                        Write-Host "  -> Uploading to Envelope Print Manager..." -ForegroundColor Yellow
                        $parties = @()
                        foreach ($r in $rows) {
                            $name = ($r.PSObject.Properties | Where-Object { $_.Name -match "party|name|customer" }).Value
                            if (-not $name -or $name -match "^total") { continue }
                            $city = ($r.PSObject.Properties | Where-Object { $_.Name -match "city|station|place" }).Value
                            $mobile = ($r.PSObject.Properties | Where-Object { $_.Name -match "mobile|phone|contact" }).Value
                            $addr = ($r.PSObject.Properties | Where-Object { $_.Name -match "address|add" }).Value
                            $route = ($r.PSObject.Properties | Where-Object { $_.Name -match "route|area|beat" }).Value
                            
                            $parties += @{
                                partyName = $name.Trim()
                                address = if ($addr) { $addr.Trim() } else { $city }
                                city = if ($city) { $city.Trim() } else { "DAHEGAM" }
                                state = "GUJARAT"
                                mobile = if ($mobile) { $mobile.Trim() } else { "" }
                                deliveryRoute = if ($route) { $route.Trim() } else { "" }
                            }
                        }
                        
                        $json = $parties | ConvertTo-Json -Depth 3
                        $res = Invoke-RestMethod -Uri "$envelopeUrl/api/webhooks/n8n/parties" -Method POST -Body $json -ContentType "application/json" -Headers @{ "x-sync-secret" = $secretKey } -ErrorAction SilentlyContinue
                        Write-Host "  [SUCCESS] Synced $($parties.Count) parties to Envelope Manager!" -ForegroundColor Green
                    }
                } catch {
                    Write-Host "  [WARN] Parse error: $_" -ForegroundColor DarkRed
                }
            } else {
                Write-Host "  [*] Excel file ($($file.Name)) detected. Tip: Load 'marg-cloud-browser-bridge' in Chrome for instant automatic Excel parsing!" -ForegroundColor Yellow
            }
        }
    }
}
