param([string[]]$States = @("AZ", "MN"))

Set-Location "C:\Users\glcar\constructflix"

$jobs = @{}
foreach ($state in $States) {
    $outFile = "C:\Users\glcar\constructflix\state_import_$state.txt"
    Set-Content -Path $outFile -Value ""

    $job = Start-Job -ScriptBlock {
        param($st, $out, $wd)
        Set-Location $wd
        $output = & npx tsx "$wd\run_import.ts" $st 2>&1
        $output | Set-Content -Path $out -Encoding UTF8
        return ($output | Select-Object -Last 3 | Out-String)
    } -ArgumentList $state, $outFile, "C:\Users\glcar\constructflix"

    $jobs[$state] = $job
    Write-Output "Job started for $state (JobId: $($job.Id))"
}

Write-Output "Waiting up to 25 minutes..."

$deadline = (Get-Date).AddMinutes(25)
$remaining = [System.Collections.Generic.List[string]]$States

while ((Get-Date) -lt $deadline -and $remaining.Count -gt 0) {
    Start-Sleep 15
    $toRemove = @()
    foreach ($state in $remaining) {
        $job = $jobs[$state]
        $outFile = "C:\Users\glcar\constructflix\state_import_$state.txt"
        $content = [System.IO.File]::ReadAllText($outFile)

        if ($job.State -in @('Completed', 'Failed')) {
            $toRemove += $state
            $last = ($content -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 2) -join ' | '
            Write-Output "[$state] DONE: $last"
        } elseif ($content.Length -gt 20) {
            $last = ($content -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1).Trim()
            Write-Output "[$state] Running: $last"
        } else {
            Write-Output "[$state] Starting ($($content.Length) bytes)..."
        }
    }
    foreach ($s in $toRemove) { $remaining.Remove($s) | Out-Null }
    if ($remaining.Count -gt 0) { Write-Output "---" }
}

if ($remaining.Count -eq 0) { Write-Output "All done!" }
else { Write-Output "Timed out waiting for: $($remaining -join ', ')" }
