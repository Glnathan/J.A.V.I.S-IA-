; J.A.R.V.I.S. — installateur Windows (NSIS, interface Modern UI 2 en français)
; Compilé par scripts/build-desktop.mjs
; Defines : VERSION, VERSION4, ICON, WELCOME_BMP, OUT_FILE, PAYLOAD_DIR, DEFAULT_NAME, [SOURCE_DIR]

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef DEFAULT_NAME
  !define DEFAULT_NAME "Nathan"
!endif

!define APP_NAME "J.A.R.V.I.S."
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVIS"

Name "${APP_NAME}"
Caption "Installation de ${APP_NAME} ${VERSION}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\JARVIS"
InstallDirRegKey HKCU "Software\JARVIS" "InstallDir"
RequestExecutionLevel user
BrandingText "J.A.R.V.I.S. ${VERSION} - Just A Rather Very Intelligent System"
ShowInstDetails show
ShowUninstDetails show

; Profil choisi pendant l'installation (repris par JARVIS au premier lancement)
Var ProfileName
Var ProfileMode
Var ProfileGreeting
Var ProfileField
Var ProfileRadioName
Var ProfileRadioSir
Var ProfileRadioMadam

; Clés IA choisies pendant l'installation (facultatives, une par fournisseur)
Var CleGemini
Var CleGroq
Var CleAnthropic
Var CleGeminiField
Var CleGroqField
Var CleAnthropicField
Var CleGeminiBtn
Var CleGroqBtn
Var CleAnthropicBtn

; Musique de démarrage choisie pendant l'installation
Var MusicMode
Var MusicFile
Var MusicHadFile
Var MusicField
Var MusicRadioYT
Var MusicRadioFile
Var MusicRadioTheme
Var MusicRadioOff
Var MusicBrowse

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP "${WELCOME_BMP}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${WELCOME_BMP}"
!define MUI_WELCOMEPAGE_TITLE "Installation de J.A.R.V.I.S."
!define MUI_WELCOMEPAGE_TEXT "Bonjour.$\r$\n$\r$\nCet assistant va installer J.A.R.V.I.S. ${VERSION}, votre assistant IA vocal inspiré d'Iron Man.$\r$\n$\r$\nTout est inclus : moteur, base de données embarquée et Python intégré pour les plugins. Aucun droit administrateur n'est nécessaire.$\r$\n$\r$\nCliquez sur Suivant pour continuer."
!define MUI_COMPONENTSPAGE_SMALLDESC
!define MUI_FINISHPAGE_TITLE "J.A.R.V.I.S. est prêt"
!define MUI_FINISHPAGE_TEXT "Tous les systèmes sont opérationnels, $ProfileGreeting.$\r$\n$\r$\nLancez J.A.R.V.I.S. depuis le bureau ou le menu Démarrer : la musique de démarrage accompagne le chargement de l'interface.$\r$\n$\r$\nPrénom, musique et clés IA se modifient à tout moment dans les Paramètres."
!define MUI_FINISHPAGE_RUN "$INSTDIR\JARVIS.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer J.A.R.V.I.S. maintenant"
!define MUI_FINISHPAGE_LINK "Ouvrir le dossier des plugins Python"
!define MUI_FINISHPAGE_LINK_LOCATION "$PROFILE\JARVIS\plugins"

!insertmacro MUI_PAGE_WELCOME
Page custom ClesPageCreate ClesPageLeave
Page custom ProfilePageCreate ProfilePageLeave
Page custom MusicPageCreate MusicPageLeave
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

VIProductVersion "${VERSION4}"
VIAddVersionKey /LANG=${LANG_FRENCH} "ProductName" "J.A.R.V.I.S."
VIAddVersionKey /LANG=${LANG_FRENCH} "FileDescription" "Installation de J.A.R.V.I.S."
VIAddVersionKey /LANG=${LANG_FRENCH} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_FRENCH} "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_FRENCH} "CompanyName" "Projet JARVIS"
VIAddVersionKey /LANG=${LANG_FRENCH} "LegalCopyright" "Projet personnel"

Function .onInit
  StrCpy $ProfileName "${DEFAULT_NAME}"
  StrCpy $ProfileMode "prenom"
  StrCpy $ProfileGreeting "${DEFAULT_NAME}"
  StrCpy $MusicMode "youtube"
  StrCpy $MusicFile ""
  StrCpy $MusicHadFile "0"
  StrCpy $CleGemini ""
  StrCpy $CleGroq ""
  StrCpy $CleAnthropic ""
  ${If} ${FileExists} "$APPDATA\JARVIS\profil.ini"
    ReadINIStr $0 "$APPDATA\JARVIS\profil.ini" "profil" "prenom"
    ${If} $0 != ""
      StrCpy $ProfileName $0
      StrCpy $ProfileGreeting $0
    ${EndIf}
    ReadINIStr $0 "$APPDATA\JARVIS\profil.ini" "profil" "appellation"
    ${If} $0 != ""
      StrCpy $ProfileMode $0
    ${EndIf}
    ReadINIStr $0 "$APPDATA\JARVIS\profil.ini" "profil" "musique"
    ${If} $0 != ""
      StrCpy $MusicMode $0
      ${If} $0 == "fichier"
        StrCpy $MusicHadFile "1"
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd

Function CleGeminiClick
  Pop $0
  ExecShell "open" "https://aistudio.google.com/apikey"
FunctionEnd

Function CleGroqClick
  Pop $0
  ExecShell "open" "https://console.groq.com/keys"
FunctionEnd

Function CleAnthropicClick
  Pop $0
  ExecShell "open" "https://console.anthropic.com/settings/keys"
FunctionEnd

Function ClesPageCreate
  !insertmacro MUI_HEADER_TEXT "Intelligence artificielle" "Connectez le cerveau de J.A.R.V.I.S. (facultatif)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 12u "Google Gemini — gratuit et recommandé (cerveau principal) :"
  Pop $1
  ${NSD_CreateText} 0 13u 58% 13u "$CleGemini"
  Pop $CleGeminiField
  ${NSD_CreateBrowseButton} 60% 12u 40% 15u "Obtenir ma clé Gemini..."
  Pop $CleGeminiBtn
  ${NSD_OnClick} $CleGeminiBtn CleGeminiClick

  ${NSD_CreateLabel} 0 32u 100% 12u "Groq — gratuit et ultra-rapide (sert aussi au moteur vocal Whisper) :"
  Pop $1
  ${NSD_CreateText} 0 45u 58% 13u "$CleGroq"
  Pop $CleGroqField
  ${NSD_CreateBrowseButton} 60% 44u 40% 15u "Obtenir ma clé Groq..."
  Pop $CleGroqBtn
  ${NSD_OnClick} $CleGroqBtn CleGroqClick

  ${NSD_CreateLabel} 0 64u 100% 12u "Anthropic (Claude) — payant (crédits), raisonnement avancé :"
  Pop $1
  ${NSD_CreateText} 0 77u 58% 13u "$CleAnthropic"
  Pop $CleAnthropicField
  ${NSD_CreateBrowseButton} 60% 76u 40% 15u "Obtenir ma clé Claude..."
  Pop $CleAnthropicBtn
  ${NSD_OnClick} $CleAnthropicBtn CleAnthropicClick

  ${NSD_CreateLabel} 0 96u 100% 30u "Toutes les clés sont facultatives : sans clé, JARVIS fonctionne en mode local. Ollama (100 % local) et OpenAI se configurent après l'installation. Tout se modifie à tout moment dans Paramètres > Intelligence."
  Pop $1
  nsDialogs::Show
FunctionEnd

Function ClesPageLeave
  ${NSD_GetText} $CleGeminiField $CleGemini
  ${NSD_GetText} $CleGroqField $CleGroq
  ${NSD_GetText} $CleAnthropicField $CleAnthropic
FunctionEnd

Function ProfilePageCreate
  !insertmacro MUI_HEADER_TEXT "Votre profil" "Comment J.A.R.V.I.S. doit-il s'adresser à vous ?"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 12u "Votre prénom :"
  Pop $1
  ${NSD_CreateText} 0 14u 60% 13u "$ProfileName"
  Pop $ProfileField
  ${NSD_CreateLabel} 0 40u 100% 12u "J.A.R.V.I.S. vous appellera :"
  Pop $1
  ${NSD_CreateRadioButton} 8u 54u 92% 12u "par votre prénom (ex. « Bonjour, ${DEFAULT_NAME}. »)"
  Pop $ProfileRadioName
  ${NSD_CreateRadioButton} 8u 68u 92% 12u "Monsieur (« Bonjour, monsieur. »)"
  Pop $ProfileRadioSir
  ${NSD_CreateRadioButton} 8u 82u 92% 12u "Madame (« Bonjour, madame. »)"
  Pop $ProfileRadioMadam
  ${NSD_CreateLabel} 0 106u 100% 26u "Modifiable à tout moment dans Paramètres > Profil, ou en disant « Jarvis, appelle-moi… »."
  Pop $1
  ${If} $ProfileMode == "monsieur"
    ${NSD_Check} $ProfileRadioSir
  ${ElseIf} $ProfileMode == "madame"
    ${NSD_Check} $ProfileRadioMadam
  ${Else}
    ${NSD_Check} $ProfileRadioName
  ${EndIf}
  ${NSD_SetFocus} $ProfileField
  nsDialogs::Show
FunctionEnd

Function ProfilePageLeave
  ${NSD_GetText} $ProfileField $ProfileName
  ${NSD_GetState} $ProfileRadioSir $1
  ${NSD_GetState} $ProfileRadioMadam $2
  ${If} $1 == ${BST_CHECKED}
    StrCpy $ProfileMode "monsieur"
    StrCpy $ProfileGreeting "monsieur"
  ${ElseIf} $2 == ${BST_CHECKED}
    StrCpy $ProfileMode "madame"
    StrCpy $ProfileGreeting "madame"
  ${Else}
    ${If} $ProfileName == ""
      MessageBox MB_ICONEXCLAMATION|MB_OK "Indiquez votre prénom, ou choisissez « Monsieur » ou « Madame »."
      Abort
    ${EndIf}
    StrCpy $ProfileMode "prenom"
    StrCpy $ProfileGreeting $ProfileName
  ${EndIf}
FunctionEnd

Function MusicPageCreate
  !insertmacro MUI_HEADER_TEXT "Musique de démarrage" "Quelle musique J.A.R.V.I.S. joue-t-il quand son interface se charge ?"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateRadioButton} 0 0 100% 12u "Thunderstruck - AC/DC (lecteur YouTube officiel, Internet requis)"
  Pop $MusicRadioYT
  ${NSD_CreateRadioButton} 0 17u 100% 12u "Mon fichier audio (MP3, M4A, WAV...) : instantané et hors ligne"
  Pop $MusicRadioFile
  ${NSD_CreateRadioButton} 0 52u 100% 12u "Thème original J.A.R.V.I.S. (hors ligne)"
  Pop $MusicRadioTheme
  ${NSD_CreateRadioButton} 0 68u 100% 12u "Aucune musique"
  Pop $MusicRadioOff
  ${NSD_CreateText} 12u 32u 68% 13u "$MusicFile"
  Pop $MusicField
  ${NSD_CreateBrowseButton} 82% 31u 18% 15u "Parcourir..."
  Pop $MusicBrowse
  ${NSD_OnClick} $MusicBrowse MusicBrowseClick
  ${If} $MusicHadFile == "1"
    ${NSD_CreateLabel} 0 88u 100% 36u "Votre fichier audio actuel est conservé si vous ne choisissez pas de nouveau fichier. Si YouTube est indisponible (hors ligne, publicité...), J.A.R.V.I.S. joue son thème original."
  ${Else}
    ${NSD_CreateLabel} 0 88u 100% 36u "Si YouTube est indisponible (hors ligne, publicité...), J.A.R.V.I.S. joue son thème original. Modifiable à tout moment dans Paramètres > Voix & micro > Musique de démarrage."
  ${EndIf}
  Pop $1
  ${If} $MusicMode == "fichier"
    ${NSD_Check} $MusicRadioFile
  ${ElseIf} $MusicMode == "theme"
    ${NSD_Check} $MusicRadioTheme
  ${ElseIf} $MusicMode == "aucune"
    ${NSD_Check} $MusicRadioOff
  ${Else}
    ${NSD_Check} $MusicRadioYT
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function MusicBrowseClick
  Pop $0
  nsDialogs::SelectFileDialog open "$MusicFile" "Fichiers audio|*.mp3;*.m4a;*.aac;*.ogg;*.opus;*.wav;*.flac;*.webm|Tous les fichiers|*.*"
  Pop $0
  ${If} $0 != ""
  ${AndIf} $0 != "error"
    StrCpy $MusicFile $0
    ${NSD_SetText} $MusicField $0
    ${NSD_Check} $MusicRadioFile
    ${NSD_Uncheck} $MusicRadioYT
    ${NSD_Uncheck} $MusicRadioTheme
    ${NSD_Uncheck} $MusicRadioOff
  ${EndIf}
FunctionEnd

Function MusicPageLeave
  ${NSD_GetText} $MusicField $MusicFile
  ${NSD_GetState} $MusicRadioFile $1
  ${NSD_GetState} $MusicRadioTheme $2
  ${NSD_GetState} $MusicRadioOff $3
  ${If} $1 == ${BST_CHECKED}
    ${If} $MusicFile == ""
      ${If} $MusicHadFile == "1"
        StrCpy $MusicMode "inchange"
        Return
      ${EndIf}
      MessageBox MB_ICONEXCLAMATION|MB_OK "Choisissez votre fichier audio avec le bouton « Parcourir... »."
      Abort
    ${EndIf}
    ${IfNot} ${FileExists} "$MusicFile"
      MessageBox MB_ICONEXCLAMATION|MB_OK "Fichier introuvable :$\r$\n$MusicFile"
      Abort
    ${EndIf}
    StrCpy $MusicMode "fichier"
  ${ElseIf} $2 == ${BST_CHECKED}
    StrCpy $MusicMode "theme"
  ${ElseIf} $3 == ${BST_CHECKED}
    StrCpy $MusicMode "aucune"
  ${Else}
    StrCpy $MusicMode "youtube"
  ${EndIf}
FunctionEnd

; Arrête un JARVIS en cours d'exécution (uniquement les processus lancés depuis ce dossier).
!macro STOP_JARVIS
  nsExec::Exec `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Get-Process node,python -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force -ErrorAction SilentlyContinue"`
  Pop $0
  Sleep 800
!macroend

Function StopJarvis
  !insertmacro STOP_JARVIS
FunctionEnd

Function un.StopJarvis
  !insertmacro STOP_JARVIS
FunctionEnd

Section "J.A.R.V.I.S. (requis)" SecCore
  SectionIn RO
  Call StopJarvis
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\launcher"
  File /r "${PAYLOAD_DIR}\*"
  WriteUninstaller "$INSTDIR\Desinstaller.exe"

  ; Profil choisi pendant l'installation (UTF-16 LE avec BOM, appliqué par JARVIS au démarrage)
  CreateDirectory "$APPDATA\JARVIS"
  StrCpy $R1 ""
  StrCpy $R2 ""
  ${If} $MusicMode == "fichier"
    ${GetFileExt} "$MusicFile" $R1
    ${GetFileName} "$MusicFile" $R2
    Delete "$APPDATA\JARVIS\musique-installation.*"
    CopyFiles /SILENT "$MusicFile" "$APPDATA\JARVIS\musique-installation.$R1"
  ${EndIf}
  ; Clés IA choisies pendant l'installation (seulement les clés renseignées : une mise à jour ne doit pas effacer les clés existantes)
  StrCpy $R3 ""
  ${If} $CleGemini != ""
    StrCpy $R3 "$R3cle_gemini=$CleGemini$\r$\n"
  ${EndIf}
  ${If} $CleGroq != ""
    StrCpy $R3 "$R3cle_groq=$CleGroq$\r$\n"
  ${EndIf}
  ${If} $CleAnthropic != ""
    StrCpy $R3 "$R3cle_anthropic=$CleAnthropic$\r$\n"
  ${EndIf}
  FileOpen $0 "$APPDATA\JARVIS\profil-installation.ini" w
  FileWriteWord $0 0xFEFF
  FileWriteUTF16LE $0 "[profil]$\r$\nprenom=$ProfileName$\r$\nappellation=$ProfileMode$\r$\nmusique=$MusicMode$\r$\nmusique_fichier=$R2$\r$\nmusique_ext=$R1$\r$\n$R3"
  FileClose $0

  CreateDirectory "$PROFILE\JARVIS\plugins"
  CreateDirectory "$SMPROGRAMS\J.A.R.V.I.S"
  CreateShortcut "$SMPROGRAMS\J.A.R.V.I.S\J.A.R.V.I.S.lnk" "$INSTDIR\JARVIS.exe" "" "$INSTDIR\jarvis.ico" 0
  CreateShortcut "$SMPROGRAMS\J.A.R.V.I.S\Plugins Python.lnk" "$PROFILE\JARVIS\plugins"
  CreateShortcut "$SMPROGRAMS\J.A.R.V.I.S\Désinstaller J.A.R.V.I.S.lnk" "$INSTDIR\Desinstaller.exe"

  WriteRegStr HKCU "Software\JARVIS" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "J.A.R.V.I.S. - Assistant IA"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Projet JARVIS"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\jarvis.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstaller.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Raccourci sur le bureau" SecDesktop
  CreateShortcut "$DESKTOP\J.A.R.V.I.S.lnk" "$INSTDIR\JARVIS.exe" "" "$INSTDIR\jarvis.ico" 0
SectionEnd

Section /o "Lancer au démarrage de Windows" SecStartup
  CreateShortcut "$SMSTARTUP\J.A.R.V.I.S.lnk" "$INSTDIR\JARVIS.exe" "" "$INSTDIR\jarvis.ico" 0
SectionEnd

!ifdef SOURCE_DIR
Section "Code source (Python / Antigravity)" SecSource
  SetOutPath "$PROFILE\JARVIS\code-source"
  SetOverwrite ifnewer
  File /r "${SOURCE_DIR}\*"
  SetOverwrite on
  CreateShortcut "$SMPROGRAMS\J.A.R.V.I.S\Code source.lnk" "$PROFILE\JARVIS\code-source"
SectionEnd
!endif

LangString DESC_CORE ${LANG_FRENCH} "L'application J.A.R.V.I.S. avec son moteur, sa base de données embarquée et le Python intégré."
LangString DESC_DESKTOP ${LANG_FRENCH} "Ajoute l'icône J.A.R.V.I.S. sur le bureau."
LangString DESC_STARTUP ${LANG_FRENCH} "Démarre J.A.R.V.I.S. automatiquement à l'ouverture de votre session Windows."
LangString DESC_SOURCE ${LANG_FRENCH} "Copie le code source complet dans %USERPROFILE%\JARVIS\code-source pour le modifier avec Python, VS Code ou Google Antigravity."

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore} $(DESC_CORE)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} $(DESC_DESKTOP)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartup} $(DESC_STARTUP)
  !ifdef SOURCE_DIR
    !insertmacro MUI_DESCRIPTION_TEXT ${SecSource} $(DESC_SOURCE)
  !endif
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  Call un.StopJarvis
  Delete "$DESKTOP\J.A.R.V.I.S.lnk"
  Delete "$SMSTARTUP\J.A.R.V.I.S.lnk"
  RMDir /r "$SMPROGRAMS\J.A.R.V.I.S"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\launcher"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\JARVIS.exe"
  Delete "$INSTDIR\jarvis.ico"
  Delete "$INSTDIR\LISEZMOI.txt"
  Delete "$INSTDIR\Desinstaller.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\JARVIS"
  MessageBox MB_YESNO|MB_ICONQUESTION "Supprimer aussi vos données J.A.R.V.I.S. (mémoire, tâches, conversations, réglages) ?$\r$\n$\r$\nVos plugins Python et le code source (dossier JARVIS de votre profil) sont conservés." /SD IDNO IDNO skipData
    RMDir /r "$APPDATA\JARVIS"
  skipData:
SectionEnd
