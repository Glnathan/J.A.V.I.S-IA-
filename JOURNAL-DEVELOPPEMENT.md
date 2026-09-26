# Journal de développement — J.A.R.V.I.S.

Historique complet du projet, tenu à jour à chaque version. Ce document est la
trace de tout le travail accompli, pour s'y retrouver plus tard.

## Vitrine de vente (README) — 26/09
- README réécrit en page de vente : pitch, tableau de commandes exemples,
  section confidentialité (verrou vocal/facial locaux, transcription locale,
  clés sur le PC), comparatif Standard gratuit / Premium 19,99 EUR à vie,
  installation en 2 minutes. Documentation technique conservée en dessous.
- Securite : generer-cle.bat et scripts/generer-cle.mjs retirés du dépôt public
  (git rm --cached + .gitignore, fichiers conservés en local). La validation de
  licence reste hors ligne (checksum mod 97) : un service en ligne reste à faire
  pour une vraie protection.

## 1.27.1 — Sélecteur d apparence au clic
- Paramètres → Profil : carte « Apparence de JARVIS » — 8 pastilles de couleurs,
  un clic applique le thème ( Cyan, Alerte rouge, Mark, Éco, Gaming, et les
  exclusives Premium Nanotech, Ultron, Furtif verrouillées sans licence).
  Le thème courant est surligné. Complète l activation vocale (« mode or »).

## 1.27.0 — Visages de la famille (Premium)
- La veille faciale accepte jusqu'à 6 visages inscrits (contre 1 avant) :
  conjoint, enfants… chacun commande JARVIS, et il salue la personne reconnue
  par son prénom (« Oui, Manon ? ») au moment du mot d'activation.
- Format de stockage visionFace : tableau [{ name, descriptors }, …] ;
  l'ancien format mono-visage est converti automatiquement à la lecture
  (aucune migration nécessaire). Plus d'un visage = Premium (route PUT gated).
- Panneau Vision : champ prénom + « Inscrire ce visage » (remplace le profil
  du même nom ou l'ajoute), liste des profils avec retrait en un clic.
- recognizeFrame compare aux descripteurs de tous les profils (meilleur
  match) ; checkFaceNow renvoie le nom reconnu (string) au lieu d'un booléen.
- Reconnaissance toujours 100% locale (face-api WASM, aucun envoi d'image).
## 1.26.0 — Transcription 100% locale (Premium, version PC)
- Whisper s'installe sur le PC et transcrit la voix entièrement en local :
  aucun audio ne quitte jamais la machine, et ça marche internet coupé.
- Environnement Python dédié et PERSISTANT dans %APPDATA%\JARVIS\stt-local
  (Python 3.12 embarqué + pip + faster-whisper + modèle small int8, ~1 Go au
  total) : survit aux mises à jour de JARVIS, indépendant du Python des
  plugins. Choix retenu contre le Nemotron NVIDIA (7 Go + carte NVIDIA
  requise) : même résultat 100% local pour un septième du poids.
- Installation en un clic depuis Paramètres → Voix & micro (tâche de fond
  avec état consultable : Python → pip → Whisper → modèle ; ~1 Go une fois).
- Worker persistant (python/stt_worker.py) : modèle chargé une seule fois,
  protocole JSON lignes, HF_HUB_OFFLINE=1 en fonctionnement (zéro réseau).
- Moteur « Locale » sélectionnable (Premium) avec repli cloud automatique si
  le moteur local échoue. Le verrou vocal vérifie toujours la voix en local
  AVANT toute transcription — privacy totale de bout en bout.
- Routes : GET /api/stt?action=local-status, PUT ?action=local-install,
  POST audio (serveur choisit local ou cloud selon sttEngine).
## 1.25.3 — Correctif quota Gmail, la vraie cause
- 50 mails = 51 requêtes = 255 unités de quota Google, dont la limite est de
  250/minute : chaque chargement complet dépassait mathématiquement le quota,
  et chaque « Actualiser » sur un 429 relançait une salve complète (429 permanent).
- La liste est plafonnée à 25 mails (130 unités, marge confortable), le backoff
  devient progressif (90 s puis 5 min) et se réinitialise au premier succès.
  Le cache partagé de 2 min reste : une seule salve pour tous les affichages.

## 1.25.2 — Correctif plantage complet du serveur (flux coupés)
- Cause du « JARVIS ne répond plus / la page ne charge pas » : les routes qui
  diffusent un fichier (musique de démarrage, téléchargement de l'installateur)
  convertissent un flux fs en flux web ; quand le navigateur coupe au milieu
  (rechargement, fermeture), l'adaptateur lève « Controller is already closed »
  de façon asynchrone → exception non interceptée → le lanceur appelait
  process.exit(1) et TOUT JARVIS mourait. C'est aussi l'explication des
  « JARVIS redémarre tout seul » observés depuis plusieurs versions.
- Correctif : le lanceur ignore désormais les coupures de flux bénignes
  (Controller already closed, AbortError, ECONNRESET, EPIPE, flux prématurément
  fermé) — il les journalise et continue de servir. /api/tts met l'audio en
  tampon au lieu de relayer un flux distant.
## 1.25.1 — Correctif quota Gmail (HTTP 429)
- Cause : chaque chargement de 50 mails coûte 51 requêtes Google (limite 250
  unités/min), et l'onglet Mails + le panneau latéral utilisaient deux caches
  séparés — chaque « Actualiser » relançait une salve complète et le quota
  restait dépassé en boucle (0 mails affichés).
- Correctif : cache partagé par recherche (une seule salve toutes les 2 min,
  tous les consommateurs s'y servent), backoff 90 s après un 429 (plus
  aucune requête vers Google pendant la récupération) et service du cache
  périmé en cas d'erreur — les mails restent affichés au lieu de disparaître.
- Le compteur de non lus dérive du cache quand possible (0 requête).
## 1.25.0 — Boîte à outils (SerpAPI, Obsidian, sécurité, Grok, ElevenLabs)
- Recherche Google lue par l'IA : clé SerpAPI (Paramètres → Intelligence,
  100 recherches/mois gratuites). « Jarvis, cherche… » répond à voix haute
  avec les résultats (answer box + sources) au lieu d'un simple onglet.
- Coffre Obsidian (Premium, version PC) : dossier du coffre dans Paramètres
  → Profil. « note dans Obsidian… » écrit dans JARVIS.md (Markdown, horodaté),
  « relis mon coffre » énonce les dernières notes. Route /api/obsidian.
- Scan de sécurité (Premium, version PC) : « lance un scan antivirus » /
  « scanne mon PC » — PowerShell natif : processus actifs exécutés depuis
  Temp/Téléchargements/Public + entrées de démarrage du registre. Rapport
  parlé, rien de supprimé. Bouton aussi dans Paramètres → Version PC.
- Grok (xAI) : fournisseur ajouté à la chaîne IA (api.x.ai, modèle par défaut
  grok-4-fast, clé sur console.x.ai).
- Voix HD ElevenLabs (Premium) : clé + bascule dans Paramètres → Voix & micro.
  Synthèse via /api/tts (la clé ne quitte pas le PC, modèle
  eleven_multilingual_v2). Client : classe ElevenSpeaker (mêmes événements que
  Speaker, bascule automatique au réglage).
- Migration drizzle 0009 : colonnes serp_api_key, obsidian_vault, eleven_key,
  eleven_voice_id, eleven_on. Les clés ne sont jamais exposées au navigateur
  (aperçus tronqués uniquement).
- Reporté volontairement : transcription 100% locale (Nemotron ~7 Go).
## 1.24.1 — Ouverture native des sites (version PC)
- « ouvre YouTube » : Chrome bloquait window.open des commandes vocales
  (pop-up sans geste utilisateur). Nouvelle route /api/open : sur la version
  PC installée, le serveur ouvre l'URL dans le navigateur par défaut via
  PowerShell (Start-Process). Repli window.open + lien cliquable sinon.
  La version web publique refuse la route (isDesktop()).
## 1.24.0 — Mot d'activation personnalisé (Premium)
- « Jarvis, réponds à Vendredi » (ou « réveille-toi au mot X », « surnomme-toi X »,
  « nouveau mot d'activation X ») : remplace « Jarvis » par le mot de votre choix,
  2 à 20 lettres. « réponds à Jarvis » fait le retour à la normale.
- Réglable aussi dans Paramètres → Voix & micro (champ « Mot d'activation
  personnalisé », Premium), pris en compte immédiatement.
- Écoute permanente : le client construit la regex du mot à la volée
  (setWakeWord/wakeRe dans recognition.ts), variantes de transcription tolérées.
  Le cerveau retire le mot personnalisé en tête de commande (cleanCommand) et
  préserve « à/au/de + mot » en queue (lookbehind) pour que « réponds à Jarvis »
  fonctionne comme reset.
- Piège corrigé (encore !) : une regex écrite via script avait un backslash
  corrompu (backspace 0x08). Vérifier les octets des regex écrites hors éditeur.
## 1.23.0 — Prise de contrôle de l'écran (Premium)
- « Jarvis, prends le contrôle » / « clique sur… » / « écris… » / « appuie sur… » :
  capture de l'écran, l'IA à vision localise la cible et propose l'action avec
  [[CLIC:x,y]] / [[TEXTE:…]] / [[TOUCHE:…]], l'utilisateur confirme (« oui, exécute »)
  puis l'action part à /api/control (Premium, version PC) qui pilote PowerShell
  natif — souris et clavier, zéro dépendance. Coordonnées converties image → écran.
- Leçon (encore) : les heredocs Python transforment  en caractère retour-arrière —
  toujours tester les regex extraites sur des phrases réelles avant de compiler.

## 1.22.0 — Latence vocale
- Visage vérifié en parallèle de la transcription (la voix d'abord : l'audio non
  vérifié ne quitte jamais le PC), fin de phrase détectée plus vite (650 ms).

## 1.21.0 — Conversation libre (Premium)
- « Jarvis, parlons » ouvre une session sans mot d'activation : chaque phrase
  vérifiée par le verrou vocal devient une commande. Fin par « merci », « c'est
  tout », « fin de conversation » ou 60 s de silence.
- Seuil vocal assoupli (0,55 → 0,45) : la vraie voix passait parfois à côté.

## 1.20.9 — Caméra partagée
- La veille faciale n'occupe plus la caméra en continu : vérification brève du
  visage uniquement au moment du mot « Jarvis », puis libération immédiate.
  Deezer, Discord, OBS disposent librement de la caméra.

## 1.20.8 — Correctif « libère la caméra »
- L'intention « libère ma caméra » ne se déclenchait pas : un script d'écriture
  avait introduit un caractère retour-arrière dans la regex à la place de `\b`.
- Leçon : ne jamais écrire de regex via des heredocs à échappement multiple ;
  toujours tester l'intention déployée (curl avec \u00XXXX pour les accents —
  Git Bash corrompt l'UTF-8 brut).

## 1.20.7 — Verrou de réservation du micro + commandes caméra
- Cause des plantages de l'inscription/test de voix : l'écoute permanente se
  réarmait automatiquement (six points du code) pendant les prises — deux micros
  à la fois. Réservé désormais pendant tout le parcours (finally de libération).
- Nouvelles commandes : « Jarvis, libère la caméra » (coupe la veille faciale et
  ferme la Vision), « Jarvis, réactive la veille faciale » (Premium).

## 1.20.6 — Le worker de voix fonctionn
- Le compilateur servait le worker en TypeScript brut (comme une image) :
  remplacé par un fichier servi tel quel (public/voice-worker.js) qui charge
  transformers.js depuis le CDN au runtime.
- Sonde et audios complétés à 1 seconde minimum (sinon OrtRun code 6).
- Vérifié par CDP dans une vraie fenêtre : modèle chargé, empreinte 512-d
  calculée, page vivante.

## 1.20.5 — Trois phrases guidées pour l'inscription
- « Bonjour Jarvis, aujourd'hui tu vas apprendre à reconnaître ma voix. » /
  « Jarvis, quelle heure est-il et quel temps fait-il dehors ? » /
  « Jarvis, décris ce que tu vois et ouvre la vision. »

## 1.20.4 — Le moteur de voix chargé depuis le CDN
- L'empaquetage du moteur ONNX par le compilateur corrompait le WebAssembly :
  plantage du rendu de la fenêtre au chargement. Chargement CDN au runtime.
- Page d'auto-test : /voice-selftest.html.

## 1.20.3 — Worker isolé
- Première isolation du moteur dans un Web Worker (limitée : un crash natif
  emporte quand même le processus — voir 1.20.4/1.20.6 pour la vraie solution).

## 1.20.2 — ONNX mono-thread + Groq à jour
- Multi-thread WebAssembly sans isolation cross-origin : instable. Mono-thread.
- Groq : llama-3.3-70b-versatile retiré par Groq → openai/gpt-oss-120b.

## 1.20.1 — Inscription vocale refaite
- Chargement du modèle affiché (avant : silence pendant ~100 Mo de téléchargement,
  l'interface semblait figée), retour par étape, bouton « Tester ma voix » avec
  score de similarité en pourcentage.

## 1.20.0 — Empreinte vocale (Premium)
- Vérification du locuteur par WavLM X-Vector (Microsoft Research), 100 % locale.
- Inscription en trois prises (Paramètres → Voix & micro), verrou vocal : en
  écoute permanente, chaque phrase est comparée à la voix inscrite — la télévision
  est ignorée, même devant l'écran. Moteur Whisper forcé (seul à fournir l'audio).

## 1.19.0 — Veille faciale (Premium)
- « Ne m'écouter qu'en présence de mon visage » : en écoute permanente, le mot
  « Jarvis » n'est obéi que si le visage inscrit est devant la caméra.
- Modèle facial local (6,8 Mo, face-api WASM), migration drizzle/0006.

## 1.18.0 — Chaîne de secours multi-IA
- Si l'IA choisie tombe (503, quota, réseau), bascule automatique sur la suivante
  dont une clé est configurée. Née d'une surcharge Gemini réelle (503).

## 1.17.x — Mode Vision (Premium)
- 1.17.0 : panneau caméra façon Iron Man — suivi des mouvements par différence
  d'images (TypeScript pur), reconnaissance faciale embarquée (inscription dans
  le panneau), vision de l'écran (« décris mon écran ») via IA multimodale.
- 1.17.1 : boucle d'animation sans re-rendu par image (fix lag/gel du panneau).
- 1.17.2 : une image jointe va directement à l'IA — plus d'intentions locales
  (l'intention « décris ce que tu vois » rebondissait sur son propre message).
- 1.17.3 : modèle Gemini par défaut mis à jour (gemini-3.8-flash, le 2.5 refusé
  en 404 par Google).
- 1.17.4 : les scripts de mise à jour et de restauration ferment aussi les
  fenêtres JARVIS (chrome --app 127.0.0.1:3777), pas seulement le serveur —
  les fenêtres ouvertes exécutaient l'ancien code du navigateur.

## 1.16.0 — Commercialisation
- PREMIUM_PRICE (19,99 € à vie) : une constante, partout (onglet Premium,
  page /telecharger). Message d'accueil parlé + éclair doré à l'activation d'une
  clé. Comparatif des éditions sur la page de téléchargement.

## 1.15.0 — Éditions Standard et Premium (vendeur)
- Générateur de clés : generer-cle.bat → scripts/generer-cle.mjs (clé
  JARVIS-XXXXX-XXXXX-XX, registre cles-vendues.csv ignoré par Git).
- Sauvegardes Premium : quotidienne automatique (7 conservées), « Sauvegarder
  maintenant », restauration par script (restaurer-jarvis.cmd).
- Journal des connexions distantes (Premium) : /api/remote/journal.
- Thèmes exclusifs : « mode nanotech », « mode Ultron », « mode furtif ».

## 1.14.0 — HUD
- Réacteur arc audio-actif (anneau spectral piloté par le niveau vocal réel),
  chat machine à écrire (accéléré sur les blocs, instantané sur l'historique),
  bandeau télémétrie défilant, écran de veille (réveil au mouvement ou à la voix).

## Prochaines étapes connues
- Prise de contrôle écran : JARVIS voit l'écran (getDisplayMedia) et agit
  (plugin Python d'automatisation) — avec confirmation vocale avant chaque
  action, jamais de clic sans accord.
- Leçon à retenir : quand une mise à jour s'installe chez l'utilisateur pendant
  qu'il teste, JARVIS « redémarre » sous lui — prévenir avant d'installer.

## Infrastructure (rappel)
- Dépôt : Glnathan/J.A.V.I.S-IA- (GitHub). Installateur : node scripts/build-desktop.mjs.
- Installation locale de test : fermer le serveur (node sous Programs\JARVIS) ET
  les fenêtres (chrome --app=http://127.0.0.1:3777), setup /S, relancer.
- Vérifier les intentions déployées avec curl en échappant les accents (\u00e8…).
- Les JARVIS Premium se mettent à jour automatiquement depuis les releases GitHub.
