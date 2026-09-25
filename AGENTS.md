# AGENTS.md — J.A.R.V.I.S. (instructions pour les agents IA : Google Antigravity, Claude, Cursor…)

Assistant vocal francophone inspiré d'Iron Man. Deux modes d'exécution, **un seul code** :

| Mode | Base de données | Lancement |
| --- | --- | --- |
| Web / serveur | PostgreSQL (`DATABASE_URL`) | `npm run build && npm start` |
| PC (Windows, installateur .exe) | PGlite embarqué (`JARVIS_DB=pglite`) | `JARVIS.exe` → `desktop/launcher.js` |

## Pile technique
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS v4 · Drizzle ORM ·
PostgreSQL / PGlite · plugins Python (pont JSON sur stdin/stdout) · NSIS pour l'installateur Windows.

## Commandes
- Installer : `npm install`
- Développer comme la version PC (Windows) : `demarrer-dev.bat` → http://127.0.0.1:3777 (rechargement à chaud)
- Vérifier les types : `npx tsc --noEmit`
- Build web : `npm run build`
- Migrations de la version PC après modification du schéma : `npx drizzle-kit generate`
- Appliquer le schéma à un PostgreSQL (version web) : `npx drizzle-kit push`
- Construire l'installateur Windows : `node scripts/build-desktop.mjs` (ou `construire-exe.bat`)

## Carte du code
- `src/app/page.tsx` → `src/components/jarvis/JarvisApp.tsx` : interface HUD (voix, chat, panneaux, actions client)
- `src/components/jarvis/` : `BootScreen` (démarrage + musique), `ChatLog` (cartes), `SidePanels`, `SettingsModal` (+ `settings/`)
- `src/app/api/chat/route.ts` : point d'entrée des messages (flux NDJSON) : plugins Python → intentions locales → IA (LLM) → secours
- `src/lib/brain/intents.ts` : **commandes vocales intégrées** (tableau `INTENTS`, l'ordre compte)
- `src/lib/brain/index.ts` : nettoyage de la commande, prompt système du LLM, balises d'action `[[OUVRIR:…]]`
- `src/lib/brain/llm.ts` + `src/lib/providers.ts` : fournisseurs IA (Groq, Gemini, OpenAI, Anthropic, Mistral, Ollama…) —
  clés API par fournisseur (colonne `ai_keys`), saisies dans l'installateur ou dans Paramètres → Intelligence ;
  l'ancienne clé unique `ai_api_key` reste lue pour compatibilité
- `src/lib/brain/plugins.ts` : gestion du processus Python ; `python/jarvis_bridge.py` et `python/jarvis.py` (API des plugins)
- `src/lib/brain/pc.ts` : contrôle du PC (liste blanche d'applications, dossiers, verrouillage)
- `src/lib/brain/home-assistant.ts` (client REST : entités, pièces, services, Assist) + `home-intent.ts` (phrases « maison » en français)
- `src/lib/brain/stt.ts` + `src/app/api/stt/route.ts` : transcription Whisper (Groq/OpenAI) quand le navigateur ne reconnaît pas la voix
- `src/lib/client/voice-capture.ts` (capture micro + détection de voix → WAV 16 kHz) · `src/components/jarvis/MicDiagnostic.tsx` (diagnostic du micro)
- Accès distant (téléphone) : `src/proxy.ts` (garde : PC local sans PIN, hôtes `.ts.net`/LAN avec session), `src/lib/remote-config.ts`
  (mode, PIN haché, cookies signés — fichier `acces-distant.json` du dossier de données), `src/lib/desktop/tailscale.ts`
  (`tailscale status/serve`), `src/app/api/remote/*`, page `/acces` (`PinGate.tsx`), onglet `settings/MobileTab.tsx`
- `src/lib/defaults.ts` : profil par défaut (prénom « Nathan », appellation) · `src/components/jarvis/Onboarding.tsx` : configuration au premier lancement
- `src/lib/desktop/profile.ts` : prénom choisi dans l'installateur (`profil-installation.ini`) et préférences du lanceur (`lanceur.json`)
- `src/lib/brain/{weather,news,wiki,math,time-parse,text}.ts` : services et analyse du français
- `src/lib/gmail.ts` + `src/app/api/gmail/` : module Gmail (OAuth « Application de bureau », `credentials.json` dans le dossier de
  données, token dans `gmail-token.json`) — lecture seule : liste, non lus, corps du mail. Onglet `settings/GmailTab.tsx`, intention « mail »
  de `intents.ts` (« lis mes mails »)
- `src/lib/{solar,satellites}.ts` + `src/app/api/space/` + page `/espace` : système solaire en temps réel (éphémérides képlériennes, aucune
  requête) et satellites en direct (TLE Celestrak cache 2 h, propagation SGP4 via `satellite.js`). Intention « espace » de `intents.ts`
  (« où est l'ISS ? », « montre le système solaire »)
- `src/lib/client/` : synthèse vocale (`speech.ts`), reconnaissance (`recognition.ts`), effets (`sounds.ts`)
- Musique de démarrage : `src/lib/client/boot-theme.ts` (`startBootMusic`, registre « une musique à la fois », baisse du volume
  quand JARVIS parle), `youtube-embed.ts` (lecteur YouTube officiel piloté par postMessage, sans script tiers),
  `music-dock.ts` (fenêtre « en cours de lecture »), `src/lib/youtube.ts` (liens YouTube, Thunderstruck par défaut)
- `src/db/schema.ts` (tables) · `src/db/index.ts` (client paresseux PostgreSQL / PGlite) · `drizzle/` (migrations de la version PC)
- `src/instrumentation.ts` : au démarrage de la version PC, initialise PGlite + migrations + arrêt automatique en cas d'inactivité
- `src/proxy.ts` : version PC seulement, refuse les requêtes d'autres sites (protection du serveur local)
- `src/lib/runtime.ts` : chemins et mode d'exécution (`isDesktop()`, `dataDir()`, `pluginsDir()`…) — ne jamais coder un chemin en dur
- Éditions Standard / Premium (`src/lib/premium.ts`, clé hors ligne `JARVIS-XXXXX-XXXXX-XX`) : mises à jour automatiques
  (serveur au démarrage + interface toutes les 6 h), apparences exclusives (intention « modes » de `intents.ts`, thèmes
  `nanotech`/`ultron`/`stealth`), sauvegardes (`src/lib/backup.ts` + `/api/backup` : quotidienne via `instrumentation.ts`,
  restauration par script `restaurer-jarvis.cmd`), journal des connexions distantes (`src/lib/access-log.ts` +
  `/api/remote/journal`, alimenté par `/api/remote/login`). Générateur de clés du vendeur : `generer-cle.bat` →
  `scripts/generer-cle.mjs` (registre local `cles-vendues.csv`, ignoré par Git). Prix affiché : `PREMIUM_PRICE`
  dans `src/lib/premium.ts` (une seule constante pour l'onglet Premium et la page `/telecharger`). À l'activation
  d'une clé, `JarvisApp.tsx` (`onSettingsSaved`) prononce le message d'accueil Premium et flashe le thème or.
- Mode Vision (Premium) : `src/components/jarvis/VisionPanel.tsx` — caméra + détection de mouvement par différence
  d'images (TypeScript pur) + reconnaissance faciale via `src/lib/client/vision-face.ts` (face-api/TFJS WASM,
  modèles dans `public/models/`, inscrits en base dans `settings.vision_face`, migration `drizzle/0005`). Intention
  « vision » de `intents.ts` (verrou Premium côté serveur) ; vision de l'écran : action client `vision` → capture
  `getDisplayMedia` → image jointe à `/api/chat` (`image` en URL de données) → `streamChat` multimodal
  (OpenAI-compat `image_url`, Anthropic `image`).
- `desktop/` : lanceur Node et scripts NSIS · `scripts/build-desktop.mjs` : fabrication de l'installateur
- `plugins/` : plugins Python d'exemple (copiés dans `%USERPROFILE%\JARVIS\plugins` au premier lancement du PC)

## Recettes

### Ajouter une commande vocale intégrée (TypeScript)
1. Dans `src/lib/brain/intents.ts`, ajoutez un objet au tableau `INTENTS` **avant** les intentions plus générales
   (`music`, `search`, `open`) :
   ```ts
   {
     name: "lampe",
     run: (c) => (/\b(allume|eteins) la lampe\b/.test(c.f) ? say(`C'est fait, ${c.sir}.`) : null),
   },
   ```
2. `c.f` = texte en minuscules, **sans accents ni ponctuation** (même longueur que `c.text`, l'original).
   Pour récupérer un morceau avec ses accents : `const m = X(/regex (.+)$/, c.f); grab(c, m, 1)`.
3. Renvoyez `say(texte, { cards?, actions? })` ou `null`. Utilisez toujours `c.sir` (« monsieur ») et le vouvoiement.
4. `fallbackOnly: true` = seulement quand aucune IA n'est connectée (petite conversation).
5. Pour une action dans le navigateur : type `ClientAction` (`src/lib/types.ts`) + `runActions()` dans `JarvisApp.tsx`.

### Ajouter un plugin Python (sans recompiler)
Créez `plugins/mon_plugin.py` (voir `plugins/LISEZMOI.md` et la skill `.agents/skills/plugin-python-jarvis`) :
```python
from jarvis import commande, Reponse
NOM = "Mon plugin"
@commande("dis bonjour à {nom}")
def bonjour(req):
    return f"Bonjour {req.groupes['nom']} !"
```
Les plugins passent avant les commandes intégrées ; `return None` laisse JARVIS continuer. Rechargement automatique.

### Profil de l'utilisateur
- JARVIS s'adresse à l'utilisateur avec `c.sir` (serveur) / `addressOf()` (client) : prénom si `addressBy = "name"`, sinon l'appellation (`honorific`).
- Valeurs par défaut : `src/lib/defaults.ts`. L'installateur Windows demande le prénom (page `ProfilePageCreate` de `installer.nsi`) et les clés IA
  (page `ClesPageCreate`, écrites dans `profil-installation.ini` sous `cle_gemini`/`cle_groq`/`cle_anthropic`, appliquées au premier lancement).

### Home Assistant
- Réglages : Paramètres → Maison (URL + jeton longue durée). Toute commande « maison » passe par `handleHome()` :
  d'abord Assist (`/api/conversation/process`, français), puis la correspondance directe noms/pièces.
- Sécurité : ouvrir portes/portails/serrures ou désarmer l'alarme est bloqué (`SENSITIVE_SERVICES`), sauf version PC + autorisation explicite.
- Pour une commande maison personnalisée, un plugin Python peut appeler l'API REST de Home Assistant.

### Reconnaissance vocale
- Moteur « navigateur » (Web Speech API de Chrome/Edge) ou « Whisper » (serveur, `/api/stt`) ; « auto » bascule sur Whisper en cas d'erreur.
- Ne jamais ouvrir le micro deux fois en même temps (getUserMedia + SpeechRecognition) : cela peut couper la reconnaissance.

### Modifier la base de données
1. Modifiez `src/db/schema.ts` (Drizzle `pg-core`).
2. `npx drizzle-kit generate` (crée la migration utilisée par la version PC — **obligatoire**, sinon la version PC plante).
3. Version web : `npx drizzle-kit push`.

### Ajouter une route API
`src/app/api/<nom>/route.ts`, exports `GET`/`POST`…, `export const dynamic = "force-dynamic"`. Accès BD via `import { db } from "@/db"`.
Les modules serveur (`node:fs`, `@/db`, `src/lib/brain/*`) ne doivent jamais être importés dans un composant `"use client"`.

## Règles
- Tout texte visible ou prononcé est en **français**, ton de majordome britannique, phrases courtes (lues à voix haute).
- Jamais de clé API ni de secret dans le code : `process.env.*` ou Paramètres → Intelligence.
- Contrôle du PC uniquement via la liste blanche de `pc.ts` ou via des plugins Python (choix explicite de l'utilisateur).
- Ne pas casser l'API publique des plugins (`python/jarvis.py` : `commande`, `Reponse`, `Requete`, `lancer`…).
- Conserver la compatibilité des deux modes (PostgreSQL et PGlite) : utiliser uniquement Drizzle, pas de SQL spécifique.
- Pas de nouvelle dépendance native (le build Windows est préparé depuis n'importe quel OS).
- Version affichée : `src/lib/version.ts` (incrémentez-la avant de construire un nouvel installateur).

## Validation avant de terminer
1. `npx tsc --noEmit` sans erreur.
2. `npm run build` réussi.
3. Test manuel : `demarrer-dev.bat`, puis dire ou écrire la nouvelle commande.
4. Si le schéma a changé : `npx drizzle-kit generate` a produit une migration dans `drizzle/`.
