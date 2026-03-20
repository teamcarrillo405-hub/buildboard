# schedule_yelp_daily.ps1
# Registers a Windows Task Scheduler job to run Yelp enrichment daily at 06:00
# Run once as Admin: powershell -ExecutionPolicy Bypass -File schedule_yelp_daily.ps1

$taskName   = "ConstructFlix-YelpEnrich"
$workingDir = "C:\Users\glcar\constructflix"
$nodeExe    = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodeExe) { $nodeExe = "$env:APPDATA\nvm\current\node.exe" }

$action = New-ScheduledTaskAction `
    -Execute $nodeExe `
    -Argument "--import tsx server/scripts/enrichYelpContacts.ts" `
    -WorkingDirectory $workingDir

$trigger = New-ScheduledTaskTrigger -Daily -At "06:00AM"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

# Unregister old task if exists
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Daily Yelp Fusion contact enrichment for ConstructFlix (4800 API calls/day)" `
    -Force

Write-Host "✓ Scheduled task '$taskName' registered — runs daily at 06:00"
Write-Host "  View/edit: taskschd.msc"
Write-Host "  Run now:   Start-ScheduledTask -TaskName '$taskName'"
