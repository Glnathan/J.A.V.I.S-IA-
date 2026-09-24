---
description: Ajouter une nouvelle commande vocale intégrée à JARVIS (TypeScript)
---

1. Demande à l'utilisateur la phrase exacte qu'il veut dire et la réponse attendue, si ce n'est pas précisé.
2. Décide : si la commande ne touche pas au cœur de JARVIS, propose plutôt le workflow `/nouveau-plugin-python`.
3. Ouvre `src/lib/brain/intents.ts` et ajoute un objet `Intent` au tableau `INTENTS`, avant `music`, `search` et `open`.
   - Teste le texte simplifié `c.f` (minuscules, sans accents ni ponctuation) avec une expression régulière.
   - Réponds avec `say(\`… ${c.sir}.\`)` et, si besoin, `cards` (carte visuelle) ou `actions` (action dans le navigateur).
4. Si une nouvelle action navigateur est nécessaire : ajoute-la au type `ClientAction` dans `src/lib/types.ts`, puis gère-la dans
   `runActions()` de `src/components/jarvis/JarvisApp.tsx`.
5. Vérifie les types :
// turbo
6. `npx tsc --noEmit`
7. Propose à l'utilisateur de tester avec `demarrer-dev.bat`, en écrivant la phrase dans JARVIS.
