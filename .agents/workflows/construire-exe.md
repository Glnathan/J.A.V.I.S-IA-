---
description: Reconstruire l'installateur Windows (.exe) de JARVIS après des modifications
---

1. Incrémente la version dans `src/lib/version.ts` (par exemple 1.1.0 → 1.2.0).
2. Vérifie le code :
// turbo
3. `npx tsc --noEmit`
4. Si `src/db/schema.ts` a changé depuis la dernière version, lance `npx drizzle-kit generate`.
5. Construis l'installateur (quelques minutes ; Node.js pour Windows, Python intégré et NSIS sont téléchargés automatiquement) :
6. `node scripts/build-desktop.mjs`
7. Le résultat est `downloads/JARVIS-Setup-<version>.exe`. L'utilisateur peut l'installer par-dessus l'ancienne version :
   ses données (mémoire, tâches) et ses plugins sont conservés.
