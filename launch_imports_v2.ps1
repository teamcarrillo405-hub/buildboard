param([string[]]$States = @("AZ", "IL", "MN"))

Set-Location "C:\Users\glcar\constructflix"

$nodeExe    = "node"
$tsNodeBin  = "C:\Users\glcar\constructflix\node_modules\ts-node\dist\bin.js"
$runScript  = "C:\Users\glcar\constructflix\run_import.js"
$tsconfig   = "C:\Users\glcar\constructflix\tsconfig.json"

$pids = @{}
foreach ($state in $States) {
    $outFile = "C:\Users\glcar\constructflix\state_import_$state.txt"
    $errFile = "C:\Users\glcar\constructflix\state_import_${state}_err.txt"

    $proc = Start-Process -PassThru -WindowStyle Hidden `
        -FilePath $nodeExe `
        -ArgumentList $tsNodeBin, "--project", $tsconfig, $runScript, $state `
        -WorkingDirectory "C:\Users\glcar\constructflix" `
        -RedirectStandardOutput $outFile `
        -RedirectStandardError $errFile

    $pids[$state] = $proc.Id
    Write-Output "Started $state (PID: $($proc.Id)) -> $outFile"
}

Write-Output ""
Write-Output "Monitoring (press Ctrl+C to stop watching, imports continue in background)..."
Write-Output ""

# Poll for 5 minutes max
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep 10
    $done = @()
    foreach ($state in $States) {
        $outFile = "C:\Users\glcar\constructflix\state_import_$state.txt"
        $content = [System.IO.File]::ReadAllText($outFile)
        if ($content -match "\[${state}_DONE\]" -or $content -match "\[${state}_ERROR\]") {
            $done += $state
            $line = ($content -split "`n" | Where-Object { $_ -match "\[$state" } | Select-Object -Last 1).Trim()
            Write-Output "[$state] FINISHED: $line"
        } elseif ($content.Length -gt 10) {
            $lastLine = ($content -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1).Trim()
            Write-Output "[$state] Running: $lastLine"
        } else {
            Write-Output "[$state] Starting... ($($content.Length) bytes)"
        }
    }
    $States = $States | Where-Object { $done -notcontains $_ }
    if ($States.Count -eq 0) {
        Write-Output "All imports complete!"
        break
    }
}
