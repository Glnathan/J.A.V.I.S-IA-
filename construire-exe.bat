@echo off
chcp 65001 >nul
title Construction de l'installateur J.A.R.V.I.S.
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
node scripts\build-desktop.mjs %*
if errorlevel 1 goto :erreur
echo.
echo  Installateur cree dans le dossier "downloads".
start "" explorer downloads
pause
exit /b 0
:erreur
echo.
echo  La construction a echoue. Consultez les messages ci-dessus.
pause
exit /b 1
