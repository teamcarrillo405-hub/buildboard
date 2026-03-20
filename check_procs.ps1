$procs = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*enrichWorker*' -or $_.CommandLine -like '*tsx*' }
foreach ($p in $procs) {
    Write-Host "PID=$($p.ProcessId) CMD=$($p.CommandLine.Substring(0, [Math]::Min(120, $p.CommandLine.Length)))"
}
Write-Host "Total matching processes: $($procs.Count)"
