@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto missing_node

if "%AOE_PLAY_FOREGROUND%"=="1" goto foreground

start "Age of Exploration" /D "%CD%" cmd.exe /d /s /c "node scripts\play.mjs || pause"
exit /b 0

:foreground
node scripts\play.mjs
exit /b %ERRORLEVEL%

:missing_node
echo Node.js 22 was not found.
echo Install Node.js 22 from https://nodejs.org/ and double-click play.cmd again.
pause
exit /b 2
