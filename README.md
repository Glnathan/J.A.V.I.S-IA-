# J.A.R.V.I.S. — Just A Rather Very Intelligent System

Assistant IA vocal en français, inspiré d'Iron Man. Il fonctionne dans le navigateur, ou comme un vrai
logiciel Windows installé avec un fichier `.exe`. On peut l'enrichir en **Python** ou le modifier avec **Google Antigravity**.

## Fonctionnalités
- Commande vocale en français, réponses à voix haute et écoute permanente (« Jarvis, … »).
- Heure, météo, actualités, Wikipédia, calculs, minuteurs, rappels, tâches et mémoire à long terme.
- Ouverture de sites et de musique ; sur PC : applications, dossiers et verrouillage de session.
- IA connectable : Groq et Gemini (gratuits), OpenAI, Claude, Mistral, OpenRouter, DeepSeek, ou **Ollama, 100 % local**.
- Interface holographique, protocoles (fête, alerte, Mark…) et **musique de démarrage épique**.
- **Plugins Python** : chaque fichier `.py` ajoute des commandes, avec rechargement instantané.
- **Maison connectée (Home Assistant)** : lumières, volets, chauffage, scènes, capteurs, à la voix et depuis le panneau « Maison ».
- **Profil** : JARVIS vous appelle par votre prénom (Nathan par défaut), choisi à l'installation ou dans Paramètres → Profil.
- **Micro fiable** : diagnostic intégré (icône stéthoscope) et moteur Whisper de secours qui fonctionne dans tous les navigateurs.

## 1. Installer sur Windows (recommandé)
1. Téléchargez `JARVIS-Setup-x.y.z.exe` : dans JARVIS, **Paramètres → Installation**.
2. Double-cliquez. Si Windows affiche « Windows a protégé votre ordinateur » (application non signée) :
   **Informations complémentaires → Exécuter quand même**.
3. Suivez l'assistant : aucun droit administrateur n'est requis, et vous pouvez cocher « Code source » pour pouvoir modifier JARVIS.
4. Lancez **J.A.R.V.I.S.** depuis le bureau et autorisez le microphone.

Tout est inclus : Node.js, une base PostgreSQL embarquée (PGlite) et Python intégré. JARVIS s'ouvre dans une fenêtre
d'application Microsoft Edge (ou Chrome), qui fournit la reconnaissance vocale et les voix naturelles « Henri » ou « Denise ».

| Élément | Emplacement |
| --- | --- |
| Application | `%LOCALAPPDATA%\Programs\JARVIS` |
| Plugins Python | `%USERPROFILE%\JARVIS\plugins` |
| Code source (option) | `%USERPROFILE%\JARVIS\code-source` |
| Données et journal | `%APPDATA%\JARVIS` (`logs\jarvis.log`) |

## 2. Ajouter des commandes en Python
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

## 3. Modifier JARVIS avec Google Antigravity
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
python/             jarvis.py (API des plugins), jarvis_bridge.py (pont), jarvis_client.py
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
