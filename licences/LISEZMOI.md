# Service de licences J.A.R.V.I.S. Premium

Activation en ligne des clés Premium : JARVIS présente la clé du client, ce service la
vérifie contre la liste des clés vendues et renvoie un **jeton signé Ed25519** valable
un an. JARVIS vérifie le jeton localement (clé publique embarquée) et le renouvelle
automiquement tant que la clé reste valide. Une clé révoquée (retirée de la liste)
cesse d'être renouvelée : le Premium s'éteint au plus tard un an plus tard.

## Déploiement sur Vercel (gratuit, ~5 minutes, sans carte bancaire)

1. Créez un compte sur [vercel.com](https://vercel.com) avec votre compte GitHub.
2. Sur [vercel.com/new](https://vercel.com/new) : importez **n'importe quel dépôt**,
   puis dans « Root Directory » indiquez `licences/` — ou plus simple : téléversez le
   dossier `licences/` comme nouveau projet (drag & drop sur vercel.com/new).
3. Avant de déployer, ajoutez les **variables d'environnement** (onglet Environment
   Variables) :
   - `SIGNING_KEY` : le contenu **exact** du fichier `licences/.signing-private.pem`
     (collé tel quel, retours à la ligne inclus — ce fichier ne quitte jamais votre PC).
   - `KEYS_JSON` : la liste des clés vendues, par exemple :
     `["JARVIS-FCK6D-WPAPZ-87","JARVIS-39JZK-PJY7J-39"]`
     (reprenez la colonne `cle` de votre `cles-vendues.csv`). Pour vendre une nouvelle
     clé : générez-la avec `generer-cle.bat`, ajoutez-la à cette liste, redéployez.
4. Déployez. Le service répond sur `https://<nom-du-projet>.vercel.app/api/activate`.
5. Testez dans un navigateur :
   `https://<nom-du-projet>.vercel.app/api/activate?key=JARVIS-VOTRE-CLE-42`
   → doit renvoyer `{"ok":true,"token":"JARVIS-PREM.…","exp":…}`.

Si le projet s'appelle autrement que `jarvis-licences`, mettez à jour l'URL dans
`src/lib/premium.ts` (constante `LICENCE_URL`) avant de construire l'installateur.

## Sécurité
- La **clé privée de signature** ne quitte jamais votre PC (elle vit dans les variables
  d'environnement Vercel). Le code public de JARVIS ne contient que la clé publique :
  impossible de forger un jeton sans la clé privée.
- La liste des clés vit dans `KEYS_JSON` : retirez une clé pour la révoquer
  (le Premium du client s'éteindra au renouvellement suivant, au plus tard un an).
- Les jetons expirent au bout d'un an et se renouvellent automatiquement quand le
  client est en ligne : un client sans Internet reste Premium jusqu'à un an.
