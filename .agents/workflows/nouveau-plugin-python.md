---
description: Créer un plugin Python qui ajoute des commandes vocales à JARVIS (sans recompiler)
---

1. Demande la phrase déclencheur et ce que JARVIS doit faire, si ce n'est pas précisé.
2. Crée `plugins/<nom_en_snake_case>.py` en suivant la skill `plugin-python-jarvis` :
   - `from jarvis import commande, Reponse` (et `lancer`, `ouvrir_dossier` pour agir sur le PC) ;
   - constantes `NOM` et `DESCRIPTION` ;
   - une fonction décorée par `@commande("phrase avec {parametre}")` qui reçoit `req`.
3. Réponds en français avec `req.appellation`. Renvoie `None` si la demande ne correspond pas vraiment.
4. N'utilise que la bibliothèque standard Python, sauf si l'utilisateur confirme avoir installé Python avec pip.
5. Vérifie la syntaxe :
// turbo
6. `python -m py_compile plugins/<nom>.py`
7. Explique à l'utilisateur comment le tester : dans JARVIS, dire la phrase. Le plugin est rechargé automatiquement.
   Pour la version installée, le fichier va dans `%USERPROFILE%\JARVIS\plugins`.
