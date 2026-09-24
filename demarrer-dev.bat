@echo off
chcp 65001 >nul
title J.A.R.V.I.S. - mode developpement
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 ou plus est requis : https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installation des dependances, cela peut prendre quelques minutes...
  call npm install
  if errorlevel 1 goto :erreur
)
if not exist drizzle\meta\_journal.json (
  call npx drizzle-kit generate
  if errorlevel 1 goto :erreur
)
set "JARVIS_DESKTOP=1"
set "JARVIS_DB=pglite"
set "JARVIS_DATA_DIR=%APPDATA%\JARVIS-dev"
set "JARVIS_USER_DIR=%USERPROFILE%\JARVIS"
set "JARVIS_PLUGINS_DIR=%~dp0plugins"
set "JARVIS_IDLE_EXIT_MINUTES=0"
set "NEXT_TELEMETRY_DISABLED=1"
echo.
echo  J.A.R.V.I.S. demarre en mode developpement : http://127.0.0.1:3777
echo  Vos modifications sont appliquees automatiquement. Ctrl+C pour arreter.
echo.
start "" /min cmd /c "timeout /t 12 >nul && start msedge --app=http://127.0.0.1:3777/"
call npx next dev -p 3777 -H 127.0.0.1
exit /b 0
:erreur
echo La preparation a echoue.
pause
exit /b 1
