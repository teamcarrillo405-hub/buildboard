Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*enrichYelp*' } | ForEach-Object {
    Write-Host "Killing PID $($_.ProcessId): $($_.CommandLine.Substring(0, [Math]::Min(80, $_.CommandLine.Length)))"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "Done"
