# check_enrich.ps1
# Shows enrichment swarm progress — run every 3 minutes
# Usage: powershell -File check_enrich.ps1 [--loop]

param([switch]$loop)

$TOTAL_WORKERS = 20
$LOGS_DIR      = ".\logs"
$DB_PATH       = ".\server\constructflix.db"

function Get-WorkerProgress {
    $workers = @()
    for ($i = 0; $i -lt $TOTAL_WORKERS; $i++) {
        $file = "$LOGS_DIR\enrichWorker_${i}_of_${TOTAL_WORKERS}.json"
        if (Test-Path $file) {
            $w = Get-Content $file | ConvertFrom-Json
            $workers += $w
        } else {
            $workers += [PSCustomObject]@{
                workerId     = $i
                processed    = 0
                found        = 0
                foundEmail   = 0
                errors       = 0
                lastBusiness = "—"
                lastUpdatedAt= "—"
            }
        }
    }
    return $workers
}

function Get-DbStats {
    $query = @"
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END) as withWebsite,
  SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as withEmail,
  SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) as withPhone
FROM companies
"@
    # Use Node.js to query since we don't have sqlite3 CLI
    $script = "const db=require('better-sqlite3')('$DB_PATH'); const r=db.prepare('$query').get(); console.log(JSON.stringify(r)); db.close();"
    $result = node -e $script 2>$null
    if ($result) { return $result | ConvertFrom-Json }
    return $null
}

function Show-Status {
    $workers  = Get-WorkerProgress
    $dbStats  = Get-DbStats
    $now      = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $totalProc   = ($workers | Measure-Object -Property processed  -Sum).Sum
    $totalFound  = ($workers | Measure-Object -Property found      -Sum).Sum
    $totalEmails = ($workers | Measure-Object -Property foundEmail -Sum).Sum
    $totalErrors = ($workers | Measure-Object -Property errors     -Sum).Sum

    $hitRate   = if ($totalProc -gt 0)   { [math]::Round($totalFound  / $totalProc  * 100, 1) } else { 0 }
    $emailRate = if ($totalFound -gt 0)  { [math]::Round($totalEmails / $totalFound * 100, 1) } else { 0 }

    Clear-Host
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host " ConstructFlix Enrichment Swarm  [$now]" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan

    if ($dbStats) {
        $webPct   = [math]::Round($dbStats.withWebsite / $dbStats.total * 100, 1)
        $emailPct = [math]::Round($dbStats.withEmail   / $dbStats.total * 100, 1)
        $phonePct = [math]::Round($dbStats.withPhone   / $dbStats.total * 100, 1)
        Write-Host " DB TOTALS:" -ForegroundColor Yellow
        Write-Host "   Total records : $($dbStats.total.ToString('N0'))"
        Write-Host "   With website  : $($dbStats.withWebsite.ToString('N0'))  ($webPct%)" -ForegroundColor Green
        Write-Host "   With email    : $($dbStats.withEmail.ToString('N0'))   ($emailPct%)" -ForegroundColor Green
        Write-Host "   With phone    : $($dbStats.withPhone.ToString('N0'))  ($phonePct%)"
        $remaining = $dbStats.total - $dbStats.withWebsite
        Write-Host "   Still needs   : $($remaining.ToString('N0'))" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host " SWARM PROGRESS ($TOTAL_WORKERS workers):" -ForegroundColor Yellow
    Write-Host "   Total processed : $($totalProc.ToString('N0'))"
    Write-Host "   Websites found  : $($totalFound.ToString('N0'))  ($hitRate% hit rate)" -ForegroundColor Green
    Write-Host "   Emails found    : $($totalEmails.ToString('N0'))  ($emailRate% of found sites)" -ForegroundColor Green
    Write-Host "   Errors          : $($totalErrors.ToString('N0'))"
    Write-Host ""
    Write-Host " PER WORKER:" -ForegroundColor Yellow
    Write-Host "  W#  Processed    Found  Emails  Err  Last Business" -ForegroundColor Gray

    foreach ($w in $workers) {
        $wId   = $w.workerId.ToString().PadLeft(2)
        $proc  = $w.processed.ToString('N0').PadLeft(9)
        $found = $w.found.ToString('N0').PadLeft(7)
        $email = $w.foundEmail.ToString('N0').PadLeft(7)
        $err   = $w.errors.ToString().PadLeft(4)
        $last  = if ($w.lastBusiness.Length -gt 28) { $w.lastBusiness.Substring(0,28) } else { $w.lastBusiness.PadRight(28) }
        $color = if ($w.processed -gt 0) { "White" } else { "DarkGray" }
        Write-Host "  $wId  $proc  $found  $email  $err  $last" -ForegroundColor $color
    }

    Write-Host ""
    Write-Host " Logs: $LOGS_DIR\enrichWorker_N_of_$TOTAL_WORKERS.log" -ForegroundColor DarkGray
    if ($loop) { Write-Host " Auto-refreshing every 3 minutes. Ctrl+C to stop." -ForegroundColor DarkGray }
    Write-Host "================================================================" -ForegroundColor Cyan
}

# Run once or loop
Show-Status

if ($loop) {
    while ($true) {
        Start-Sleep -Seconds 180
        Show-Status
    }
}
