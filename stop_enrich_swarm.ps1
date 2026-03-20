# stop_enrich_swarm.ps1
# Gracefully stops all enrichment workers

$pidFile = ".\logs\enrich_pids.json"

if (Test-Path $pidFile) {
    $data = Get-Content $pidFile | ConvertFrom-Json
    Write-Host "Stopping $($data.pids.Count) workers from PID file..."
    foreach ($pid in $data.pids) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "  Stopped PID $pid"
    }
} else {
    Write-Host "No PID file found. Killing all enrichWorker node processes..."
}

# Also kill any stray enrichWorker processes
$procs = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*enrichWorker*' }
foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  Stopped stray PID $($p.ProcessId)"
}

Write-Host "All enrichment workers stopped."
Write-Host "Progress is saved — run launch_enrich_swarm.ps1 to resume."
