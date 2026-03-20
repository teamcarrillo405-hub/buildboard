$proc = Start-Process -PassThru -WindowStyle Hidden powershell.exe -ArgumentList '-File', 'run_state_import.ps1', '-State', 'AZ' -RedirectStandardOutput 'state_import_AZ.txt' -RedirectStandardError 'state_import_AZ_err.txt' -WorkingDirectory 'C:\Users\glcar\constructflix'
Write-Output "PID: $($proc.Id)"
