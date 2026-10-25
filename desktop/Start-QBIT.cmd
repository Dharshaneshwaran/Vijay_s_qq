@echo off
cd /d "%~dp0"
for /d %%D in ("%~dp0.tools\node-*-win-x64") do set "PATH=%%~fD;%PATH%"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 LTS and try again.
  pause
  exit /b 1
)
if not exist node_modules call npm.cmd install
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 exit /b 1
call npm.cmd start
