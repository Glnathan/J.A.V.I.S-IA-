; J.A.R.V.I.S. — petit exécutable de lancement (JARVIS.exe)
; Il démarre, sans fenêtre de console, runtime\node.exe launcher\main.js
; Compilé par scripts/build-desktop.mjs (defines : VERSION, VERSION4, ICON, OUT_FILE)

Unicode true
SetCompressor /SOLID lzma
!include "FileFunc.nsh"

Name "J.A.R.V.I.S."
OutFile "${OUT_FILE}"
Icon "${ICON}"
RequestExecutionLevel user
SilentInstall silent
ShowInstDetails nevershow

VIProductVersion "${VERSION4}"
VIAddVersionKey "ProductName" "J.A.R.V.I.S."
VIAddVersionKey "FileDescription" "J.A.R.V.I.S. - Assistant IA personnel"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "Projet JARVIS"
VIAddVersionKey "LegalCopyright" "Projet personnel"

Section
  ${GetParameters} $R0
  SetOutPath "$EXEDIR"
  IfFileExists "$EXEDIR\runtime\node.exe" +3
    MessageBox MB_ICONSTOP "Les fichiers de J.A.R.V.I.S. sont introuvables.$\r$\nRéinstallez l'application."
    Quit
  ExecShell "open" "$EXEDIR\runtime\node.exe" '"$EXEDIR\launcher\main.js" $R0' SW_HIDE
SectionEnd
