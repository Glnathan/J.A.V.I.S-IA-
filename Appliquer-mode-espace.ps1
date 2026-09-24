$ErrorActionPreference='Stop'
$jarvisSource=$PSScriptRoot
$jarvisInstall=Join-Path $env:LOCALAPPDATA 'Programs\JARVIS\app'
$jarvisBuild=Join-Path $jarvisSource '.next-desktop\standalone'
if(-not(Test-Path -LiteralPath (Join-Path $jarvisBuild 'server.js'))){throw 'Compilation absente.'}
if(-not(Test-Path -LiteralPath (Join-Path $jarvisInstall 'server.js'))){throw 'Installation JARVIS introuvable.'}
$jarvisBackup=Join-Path $jarvisSource ('sauvegardes-espace\'+(Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Path $jarvisBackup -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $jarvisInstall '.next-desktop') -Destination $jarvisBackup -Recurse
Copy-Item -LiteralPath (Join-Path $jarvisInstall 'server.js') -Destination $jarvisBackup
try {Invoke-RestMethod http://127.0.0.1:3777/api/desktop/quit -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null;Start-Sleep -Seconds 3} catch {Write-Host 'Serveur non joignable ; verifier que JARVIS est ferme.'}
Copy-Item -Path (Join-Path $jarvisBuild '.next-desktop\*') -Destination (Join-Path $jarvisInstall '.next-desktop') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $jarvisSource '.next-desktop\static') -Destination (Join-Path $jarvisInstall '.next-desktop') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $jarvisBuild 'server.js') -Destination $jarvisInstall -Force
Copy-Item -LiteralPath (Join-Path $jarvisSource 'public\earth-land.json'),(Join-Path $jarvisSource 'public\space-seed.json'),(Join-Path $jarvisSource 'public\earth-dashboard.html'),(Join-Path $jarvisSource 'public\earth-dashboard.js') -Destination (Join-Path $jarvisInstall 'public') -Force
Write-Host "Mise a jour terminee. Sauvegarde : $jarvisBackup"
Write-Host 'Relancez JARVIS puis ouvrez Espace. Si une ancienne fenetre est encore ouverte, actualisez-la avec Ctrl+R.'
