# JARVIS 1.4.2 — micro et musique

## Installation

Fermez les fenêtres JARVIS, puis lancez `JARVIS-Setup-1.4.2.exe`.
Choisissez le même dossier que l'installation précédente. Ne désinstallez pas
les données personnelles pour effectuer cette mise à jour.

Au lancement, cliquez sur le réacteur ou appuyez sur Espace pour parler.
Si nécessaire, utilisez le bouton « Diagnostic du micro » et autorisez le micro.
Dans Windows → Système → Son → Entrée, choisissez le microphone souhaité.

## Corrections

- Le micro est libéré si l'initialisation de la capture Whisper échoue.
- Une demande d'autorisation terminée après annulation ne relance plus l'écoute.
- L'ancien moteur vocal est arrêté avant le passage à Whisper.
- Un service vocal qui ne démarre pas affiche une erreur après dix secondes.
- Une écoute ponctuelle sans réponse affiche un message au lieu de rester silencieuse.
- L'écoute permanente ne redémarre pas pendant le diagnostic du micro.
- Les événements d'erreur et de blocage automatique du lecteur YouTube sont écoutés.
- Une vidéo sans réponse est réellement rechargée lors de l'essai suivant.
- Les erreurs de lecture sont détaillées dans l'aperçu des paramètres.
- Un lien permet d'ouvrir la musique directement sur YouTube en cas de refus.
- Les images de l'installateur, absentes de l'archive fournie, ont été rétablies.

## Résultat des vérifications du 24 septembre 2026

- Vérification TypeScript et compilation Next.js réussies.
- Cinq tests automatisés : échec du worklet, annulation d'autorisation,
  nouvelle tentative YouTube, lecture automatique bloquée, erreur 153.
- Essai réel dans Chrome : le microphone de la caméra FHD capte le son ;
  le diagnostic a transcrit « bonjour ». L'utilisateur confirme que le niveau bouge.
- YouTube refuse les trois vidéos Thunderstruck configurées avec le code 150.
  Ce refus vient du lecteur YouTube : il ne peut pas être corrigé en forçant la lecture.
  Documentation : https://developers.google.com/youtube/iframe_api_reference#onError

Pour une musique au démarrage sans cette dépendance, choisissez votre propre
fichier audio dans Paramètres → Voix & micro → Musique de démarrage → Mon fichier audio.
Le thème original reste le secours automatique. L'ouverture sur YouTube est manuelle.
La transcription « navigateur » dépend de son service vocal ; Whisper nécessite
un fournisseur configuré dans les paramètres. Cette mise à jour n'ajoute aucune clé.

La compilation autonome peut produire un avertissement Next.js de traçage dans
le module Tailscale existant. Les fichiers serveur sont vérifiés par le constructeur.
Le test micro a été effectué dans Chrome ; une installation dans un autre profil
de navigateur doit encore être vérifiée après mise à jour.

## Développement

`npm ci`, puis `npm run typecheck` et `npm run build`.
Tests ciblés : `node --test scripts/test-media.cjs`.
Installateur : `node scripts/build-desktop.mjs`.

Dans l'environnement de construction utilisé ici, l'outil Drizzle/tsx ne pouvait
pas lire le nom du compte Windows via os.userInfo. Sa copie locale de dépendance
a utilisé USERNAME pour le nom du dossier temporaire. Cette adaptation de l'outil
de construction n'est pas incluse dans les sources ni dans l'application livrée.
