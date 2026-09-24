---
trigger: always_on
description: Règles permanentes du projet J.A.R.V.I.S.
---

# Projet J.A.R.V.I.S.

- Lis `AGENTS.md` à la racine avant toute modification : il décrit l'architecture, les recettes et la validation.
- Réponds à l'utilisateur en français. Tout texte de l'application (interface et voix) est en français, avec le vouvoiement
  et l'appellation `c.sir` (« monsieur ») côté serveur.
- Pour une nouvelle commande simple, préfère un plugin Python dans `plugins/` (aucune recompilation). Utilise
  `src/lib/brain/intents.ts` seulement pour les fonctions cœur de JARVIS.
- Après une modification de `src/db/schema.ts`, exécute `npx drizzle-kit generate`.
- Termine toujours par `npx tsc --noEmit`, puis propose de tester avec `demarrer-dev.bat`.
- Ne modifie pas `desktop/installer/*.nsi` ni `scripts/build-desktop.mjs` sans demande explicite.
