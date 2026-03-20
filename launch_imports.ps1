param([string[]]$States = @("AZ", "IL", "MN"))

Set-Location "C:\Users\glcar\constructflix"

$pids = @{}
foreach ($state in $States) {
    $outFile = "state_import_$state.txt"
    # Truncate output file
    Set-Content -Path $outFile -Value ""

    $proc = Start-Process -PassThru -WindowStyle Hidden `
        -FilePath "cmd.exe" `
        -ArgumentList "/c", "start_import.bat $state $outFile" `
        -WorkingDirectory "C:\Users\glcar\constructflix"

    $pids[$state] = $proc.Id
    Write-Output "Started $state (PID: $($proc.Id))"
}

Write-Output "All imports launched. PIDs: $($pids | ConvertTo-Json -Compress)"
