@echo off
rem Fabrique une clé Premium J.A.R.V.I.S. pour un client.
rem La clé est ajoutee au registre local cles-vendues.csv (a garder hors de GitHub).
chcp 65001 >nul
cd /d "%~dp0"
set /p CLIENT="Nom du client (facultatif) : "
node scripts\generer-cle.mjs "%CLIENT%"
pause
