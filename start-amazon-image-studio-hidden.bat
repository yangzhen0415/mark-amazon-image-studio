@echo off
setlocal

for %%I in ("%~dp0.") do set "PROJECT_DIR=%%~fI"
set "APP_URL=http://127.0.0.1:5173/"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$existing = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;" ^
  "if ($existing) { exit 0 }"

cd /d "%PROJECT_DIR%"
start "Amazon Image Studio" /min npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort

endlocal
