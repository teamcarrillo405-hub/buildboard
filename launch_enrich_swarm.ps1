# launch_enrich_swarm.ps1
# Launches 20 enrichment workers in background
# Run from C:\Users\glcar\constructflix

$TOTAL_WORKERS = 20
$DELAY_MS      = 2000
$LOGS_DIR      = ".\logs"

if (-not (Test-Path $LOGS_DIR)) { New-Item -ItemType Directory -Path $LOGS_DIR | Out-Null }

Write-Host "================================================================"
Write-Host " ConstructFlix — Enrichment Swarm Launcher"
Write-Host "================================================================"
Write-Host "  Workers   : $TOTAL_WORKERS"
Write-Host "  Delay/req : ${DELAY_MS}ms per worker"
Write-Host "  Search    : DuckDuckGo HTML + Bing HTML"
Write-Host "  Validate  : Ollama gemma3:4b (local)"
Write-Host "  Logs      : $LOGS_DIR\enrichWorker_N_of_$TOTAL_WORKERS.log"
Write-Host "================================================================"
Write-Host ""

$pids = @()

for ($workerId = 0; $workerId -lt $TOTAL_WORKERS; $workerId++) {
    $logFile = "$LOGS_DIR\enrichWorker_${workerId}_of_${TOTAL_WORKERS}.log"

    $proc = Start-Process -FilePath "npx" `
        -ArgumentList "tsx", "server/scripts/enrichWorker.ts",
                      "--worker-id",     "$workerId",
                      "--total-workers", "$TOTAL_WORKERS",
                      "--delay-ms",      "$DELAY_MS" `
        -WorkingDirectory (Get-Location).Path `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError  $logFile `
        -WindowStyle Hidden `
        -PassThru

    $pids += $proc.Id
    Write-Host "  Worker $($workerId.ToString().PadLeft(2,'0'))  PID=$($proc.Id)  -> $logFile"

    # Stagger starts by 600ms to avoid thundering herd
    Start-Sleep -Milliseconds 600
}

# Save PID file for monitoring/killing
$pidData = @{
    pids         = $pids
    totalWorkers = $TOTAL_WORKERS
    startedAt    = (Get-Date -Format "o")
} | ConvertTo-Json

$pidData | Out-File -FilePath "$LOGS_DIR\enrich_pids.json" -Encoding utf8

Write-Host ""
Write-Host "  PID file -> $LOGS_DIR\enrich_pids.json"
Write-Host ""
Write-Host "  Monitor : powershell -File check_enrich.ps1"
Write-Host "  Stop all: powershell -File stop_enrich_swarm.ps1"
Write-Host ""
Write-Host "  All workers launched!"
