$procs = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*enrichWorker*' }
foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "Killed PID $($p.ProcessId)"
}
Write-Host "Done - killed $($procs.Count) test workers"
