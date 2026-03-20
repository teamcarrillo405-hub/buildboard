@echo off
REM Usage: start_import.bat AZ state_import_AZ.txt
set STATE=%1
set OUTFILE=%2
if "%STATE%"=="" (
  echo Usage: start_import.bat STATE_CODE output.txt
  exit /b 1
)
if "%OUTFILE%"=="" set OUTFILE=state_import_%STATE%.txt

cd /d C:\Users\glcar\constructflix
node node_modules\ts-node\dist\bin.js --project tsconfig.json run_import.js %STATE% > %OUTFILE% 2>&1
