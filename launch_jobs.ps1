param([string[]]$States = @("AZ", "IL", "MN"))

Set-Location "C:\Users\glcar\constructflix"

$jobs = @{}
foreach ($state in $States) {
    $outFile = "C:\Users\glcar\constructflix\state_import_$state.txt"
    Set-Content -Path $outFile -Value ""

    $job = Start-Job -ScriptBlock {
        param($st, $out, $wd)
        Set-Location $wd
        $env:NODE_PATH = "$wd\node_modules"
        $output = & npx tsx "$wd\run_import.ts" $st 2>&1
        $output | Set-Content -Path $out -Encoding UTF8
        return $output
    } -ArgumentList $state, $outFile, "C:\Users\glcar\constructflix"

    $jobs[$state] = $job
    Write-Output "Job started for $state (JobId: $($job.Id))"
}

Write-Output ""
Write-Output "Waiting for completion (this may take 5-15 min per state)..."

# Wait up to 20 minutes
$deadline = (Get-Date).AddMinutes(20)

while ((Get-Date) -lt $deadline) {
    Start-Sleep 15
    $allDone = $true
    foreach ($state in $States) {
        $job = $jobs[$state]
        $outFile = "C:\Users\glcar\constructflix\state_import_$state.txt"
        $content = [System.IO.File]::ReadAllText($outFile)

        if ($job.State -eq 'Completed' -or $job.State -eq 'Failed') {
            if ($content.Length -gt 10) {
                $lastLine = ($content -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1).Trim()
                Write-Output "[$state] DONE: $lastLine"
            } else {
                # Grab output from job directly
                $out = Receive-Job -Job $job -ErrorAction SilentlyContinue
                Write-Output "[$state] DONE (from job): $($out | Select-Object -Last 3 | Out-String)"
            }
        } else {
            $allDone = $false
            Write-Output "[$state] State: $($job.State) | File: $($content.Length) bytes"
        }
    }
    Write-Output "---"
    if ($allDone) {
        Write-Output "All jobs complete!"
        break
    }
}
