# J.A.R.V.I.S. — Just A Rather Very Intelligent System

> **Votre assistant vocal façon Iron Man. En français. Chez vous.**
> Parlez-lui comme Tony Stark : il répond de sa voix, agit sur votre PC, veille sur votre maison — et n'envoie rien sur Internet sans vous.

![version](https://img.shields.io/badge/version-1.27.0-00d4ff?labelColor=0b0f14) ![os](https://img.shields.io/badge/Windows-10%20%2F%2011-blue?labelColor=0b0f14) ![licence](https://img.shields.io/badge/code-MIT-green?labelColor=0b0f14)

---

## Parlez-lui. Il s'occupe du reste.

« **Jarvis, ouvre YouTube.** » — la page s'ouvre. « **Jarvis, cherche la recette des crêpes.** » — il vous répond à voix haute avec les résultats de Google.
« **Jarvis, prends le contrôle.** » — il voit votre écran et clique là où vous lui dites, après votre confirmation. « **Jarvis, lance un scan antivirus.** » — il analyse votre PC et vous fait son rapport.

JARVIS est un vrai logiciel Windows : une interface holographique, une voix de majordome, une musique de démarrage épique (Thunderstruck par défaut), et un cerveau IA branché sur les meilleurs modèles du moment — **Gemini et Groq (gratuits)**, OpenAI, Claude, Grok, Mistral, ou 100 % local avec Ollama.

### Ce qu'il sait faire

| Dites simplement… | Et JARVIS… |
| --- | --- |
| « ouvre YouTube » / « joue AC/DC » | ouvre le site, lance la musique |
| « cherche la météo à Verdun » | répond à voix haute (résultats Google réels avec SerpAPI) |
| « rappelle-moi le RDV vendredi 9h » | crée le rappel, vous préviendra |
| « prends le contrôle, clique sur Envoyer » | voit l'écran, propose, agit après votre « oui » |
| « note dans Obsidian : appeler le garage » | écrit dans vos notes Markdown, sur tous vos appareils |
| « lance un scan antivirus » | analyse processus et démarrage Windows, rapport parlé |
| « active la vision » | caméra façon Iron Man : mouvement, visages, écran |
| « allume la lumière du salon » | pilote votre maison Home Assistant |
| « lis mes mails » | Gmail connecté, agenda synchronisé |
| « mets Thunderstruck » | synchronise l'interface sur la musique |

…plus les tâches, minuteurs, mémoire à long terme (« retiens que… »), calculs, actualités, Wikipédia, protocoles (fête, alerte), et **vos propres commandes en Python** (un fichier `.py` = une nouvelle commande).

### Votre vie privée d'abord

- **Verrou vocal** : JARVIS vérifie que c'est bien votre voix **sur votre PC**, avant toute transcription. La télévision ne le commande plus.
- **Veille faciale** : jusqu'à 6 visages de la famille reconnus — il salue chacun par son prénom. La reconnaissance tourne en local, aucune image n'est envoyée.
- **Transcription 100% locale (Premium)** : votre voix ne quitte jamais votre machine — et ça marche même internet coupé.
- **Vos clés API restent sur votre PC** : aucun serveur tiers entre vous et les IA.

## Deux éditions

| | **Standard** — gratuite | **Premium** — **19,99 € à vie** |
| --- | --- | --- |
| Toutes les fonctions de base (voix, maison, mails, plugins, PC…) | ✓ | ✓ |
| IA au choix (Gemini, Groq, OpenAI, Claude, Grok, Mistral, Ollama…) | ✓ | ✓ |
| **Mises à jour automatiques** dès leur publication | — | ✓ à vie |
| Mot d'activation personnalisé (« réponds à Vendredi ») | — | ✓ |
| Visages de la famille (6 profils, salués par leur prénom) | — | ✓ |
| Verrou vocal « ne m'écouter que ma voix » | — | ✓ |
| Conversation libre (sans mot d'activation) | — | ✓ |
| Prise de contrôle de l'écran (clique, écris, appuie) | — | ✓ |
| Scan de sécurité antivirus | — | ✓ |
| Coffre Obsidian (notes Markdown) | — | ✓ |
| Transcription 100% locale | — | ✓ |
| Voix HD ElevenLabs | — | ✓ |
| Apparences exclusives (or, nanotech, Ultron, furtif) | — | ✓ |
| Sauvegarde quotidienne automatique | — | ✓ |

**Premium, c'est une seule fois, pour toujours** : la licence est à vie et toutes les futures fonctions Premium sont incluses. La clé s'active en dix secondes dans **Paramètres → Premium** — obtenez-la auprès du créateur, et gardez-la précieusement : elle survivra aux réinstallations.

## Installer (2 minutes)

1. Téléchargez `JARVIS-Setup-x.y.z.exe` depuis la page [**Releases**](https://github.com/Glnathan/J.A.V.I.S-IA-/releases) (ou depuis JARVIS, Paramètres → Installation).
2. Double-cliquez. Si Windows affiche « Windows a protégé votre ordinateur » (application non signée) :
   **Informations complémentaires → Exécuter quand même**.
3. Lancez **J.A.R.V.I.S.** depuis le bureau et autorisez le microphone. C'est tout —
   Node.js, la base de données et Python sont inclus dans l'installateur, aucun droit administrateur requis.

| Élément | Emplacement |
| --- | --- |
| Application | `%LOCALAPPDATA%\Programs\JARVIS` |
| Plugins Python | `%USERPROFILE%\JARVIS\plugins` |
| Code source (option à l'installation) | `%USERPROFILE%\JARVIS\code-source` |
| Données et journal | `%APPDATA%\JARVIS` (`logs\jarvis.log`) |

JARVIS s'ouvre dans une fenêtre d'application Chrome ou Edge, qui fournit la reconnaissance vocale et les voix naturelles françaises (« Henri », « Denise »…).

## Enrichir JARVIS en Python

Créez `mon_plugin.py` dans le dossier des plugins :

```python
from jarvis import commande, Reponse, lancer

NOM = "Mes raccourcis"

@commande("dis bonjour à {nom}")
def bonjour(req):
    return f"Bonjour {req.groupes['nom']} !"

@commande("lance mon jeu")
def jeu(req):
    lancer(r"C:\Jeux\MonJeu\jeu.exe")
    return f"Bon jeu, {req.appellation} !"
```

Dites « Jarvis, dis bonjour à Pepper » : c'est tout. Documentation complète dans [`plugins/LISEZMOI.md`](plugins/LISEZMOI.md),
avec des exemples (`espace_disque.py`, `mes_programmes.py`, `compteur_cafe.py`). L'onglet **Paramètres → Plugins Python**
liste vos plugins, affiche les erreurs et crée un nouveau plugin en un clic.

Pour piloter JARVIS depuis vos propres scripts : `python python/jarvis_client.py "Quel temps fait-il ?"`.

## Modifier JARVIS avec Google Antigravity

1. Ouvrez le dossier `code-source` (ou l'archive téléchargée depuis Paramètres → Installation) dans Antigravity.
2. L'agent lit automatiquement [`AGENTS.md`](AGENTS.md) et le dossier `.agents/` : règles, workflows
   `/ajouter-commande`, `/nouveau-plugin-python`, `/construire-exe`, et la skill de plugin Python.
3. Demandez simplement, par exemple : « Ajoute une commande qui me donne le prix du Bitcoin ».
4. Testez : double-cliquez sur `demarrer-dev.bat` (JARVIS en mode développement sur http://127.0.0.1:3777).
5. Générez votre propre installateur : `construire-exe.bat` → `downloads\JARVIS-Setup-x.y.z.exe`.

Prérequis pour le développement : [Node.js 20+](https://nodejs.org). Python est facultatif, car JARVIS utilise sinon son Python intégré.

## Home Assistant

1. Dans Home Assistant : votre profil → onglet **Sécurité** → **Jetons d'accès longue durée** → Créer un jeton.
2. Dans JARVIS : **Paramètres → Maison** → activez, saisissez l'adresse (`http://homeassistant.local:8123` avec la version PC)
   et le jeton → **Enregistrer & tester**.
3. Dites « Jarvis, allume la lumière du salon », « ferme les volets de la chambre », « mets le chauffage à 21 degrés »,
   « qu'est-ce qui est allumé ? ». JARVIS utilise d'abord Assist de Home Assistant (qui connaît vos pièces et vos alias).

Par sécurité, l'ouverture des portes, portails et serrures ainsi que la désactivation de l'alarme sont bloquées.
La version PC permet de les autoriser explicitement. La version en ligne n'a pas de mot de passe : préférez la version PC pour la maison.

## JARVIS ne m'entend pas ?

1. Cliquez sur l'icône **stéthoscope** (en haut) : le diagnostic teste le micro, les autorisations et la reconnaissance vocale.
2. Aperçu intégré d'un site : le navigateur y bloque le micro. Ouvrez JARVIS dans un **nouvel onglet**.
3. Windows : **Paramètres → Confidentialité et sécurité → Microphone** → autorisez les applications de bureau ;
   choisissez le bon micro dans **Paramètres → Son → Entrée**.
4. Toujours rien ? Activez le moteur **Whisper** (Paramètres → Voix & micro) avec une clé gratuite Groq (console.groq.com) :
   il fonctionne dans tous les navigateurs, y compris Firefox et Brave.
5. Version PC : la fenêtre s'ouvre dans Chrome s'il est installé (reconnaissance la plus fiable), sinon dans Edge, avec le micro pré-autorisé.

## Depuis votre téléphone (4G / 5G / extérieur)

La version PC peut être pilotée depuis un téléphone, protégée par un **code PIN** (Paramètres → **Mobile**) :
1. Installez **Tailscale** (gratuit) sur le PC et le téléphone, avec le même compte.
2. Dans la console Tailscale (onglet DNS) : activez **MagicDNS** et **HTTPS Certificates** (obligatoire pour le micro).
3. Dans JARVIS → Mobile : choisissez **Tailscale**, définissez un **code PIN**, puis **« Publier JARVIS via Tailscale »**
   (JARVIS lance `tailscale serve` pour vous). L'adresse `https://mon-pc.tailXXXX.ts.net` et un **QR code** s'affichent.
4. Sur le téléphone : ouvrez l'adresse, saisissez le PIN, puis « Ajouter à l'écran d'accueil ». Le voyant passe au vert.

Mode **Wi‑Fi local** : même réseau, `http://IP-DU-PC:3777` (redémarrage de JARVIS requis, pas de micro car HTTP).
Le PC lui-même n'a jamais besoin du PIN ; les hôtes inconnus et les requêtes d'autres sites sont refusés.

## Musique de démarrage (Thunderstruck)

Par défaut, l'interface se charge sur **AC/DC — Thunderstruck**. JARVIS attend que la musique démarre vraiment,
puis synchronise l'animation de démarrage dessus.
- **Vidéo YouTube** (par défaut) : lecture avec le **lecteur officiel YouTube** (vidéo officielle d'AC/DC). Une petite fenêtre
  vidéo s'affiche en bas à droite, avec un bouton ■ pour l'arrêter. Aucun fichier n'est copié : il faut Internet. En cas de publicité,
  de lecture refusée ou sans connexion, JARVIS joue automatiquement son thème original.
- **Mon fichier audio** : importez votre MP3 de Thunderstruck, ou de toute autre musique (Paramètres → Voix & micro, ou
  « Parcourir… » pendant l'installation). La lecture est instantanée et fonctionne hors ligne.
- **Thème J.A.R.V.I.S.** : morceau original synthétisé en direct. **Aucune** : démarrage silencieux.
- Réglages : lien YouTube, moment de départ, durée (30 s par défaut, ou morceau entier) et volume. La musique baisse
  automatiquement quand JARVIS parle ou vous écoute.
- À la voix : « Jarvis, mets Thunderstruck », « joue ta musique de démarrage », « arrête la musique ».

## Version web (serveur)

```bash
cp .env.example .env          # DATABASE_URL vers un PostgreSQL
npm install
npx drizzle-kit push
npm run build && npm start    # http://localhost:3000
```

## Architecture

```
src/app/            pages et routes API (chat, tâches, mémoire, plugins, musique, téléchargements…)
src/components/     interface HUD (JarvisApp, BootScreen, ChatLog, paramètres…)
src/lib/brain/      cerveau : intentions françaises, IA, météo, actualités, plugins, contrôle du PC
src/lib/client/     voix, reconnaissance vocale, sons, thème musical
src/db/             schéma Drizzle et client (PostgreSQL ou PGlite)
drizzle/            migrations de la base embarquée (version PC)
python/             jarvis.py (API des plugins), jarvis_bridge.py (pont), jarvis_client.py, stt_worker.py (voix locale)
plugins/            plugins Python d'exemple
desktop/            lanceur Windows et scripts NSIS de l'installateur
scripts/            build-desktop.mjs (fabrication de l'installateur)
.agents/            règles, workflows et skills pour Google Antigravity
```

## Dépannage

- **Le micro ne fonctionne pas** : autorisez le microphone (icône du cadenas). La reconnaissance vocale nécessite Edge ou Chrome et Internet.
- **Rien ne s'ouvre au lancement** : consultez `%APPDATA%\JARVIS\logs\jarvis.log`.
- **Mon plugin ne répond pas** : Paramètres → Plugins Python affiche les erreurs Python ; cliquez sur « Recharger ».
- **Port occupé** : JARVIS utilise le port 3777, ou le suivant s'il est pris.

## Licences

Code du projet : **MIT** — voir [`LICENSE`](LICENSE). Vous pouvez l'utiliser, le modifier et le redistribuer librement.
Composants libres inclus : Next.js, React (MIT), Drizzle (Apache-2.0), PGlite
(Apache-2.0 / PostgreSQL), Node.js (MIT), Python (PSF), NSIS (zlib), lucide (ISC).
« Iron Man » et « J.A.R.V.I.S. » sont des marques de Marvel ; ce projet de fan n'est pas affilié à Marvel ou Disney.
