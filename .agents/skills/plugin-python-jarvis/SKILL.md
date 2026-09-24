---
name: plugin-python-jarvis
description: Écrire ou corriger un plugin Python pour J.A.R.V.I.S. (fichiers du dossier plugins/ utilisant le module jarvis)
---

# Écrire un plugin Python pour J.A.R.V.I.S.

Un plugin est un fichier `.py` placé dans `plugins/` (version installée : `%USERPROFILE%\JARVIS\plugins`).
JARVIS le recharge automatiquement dès qu'il est modifié. Les fichiers commençant par `_` sont ignorés.

## Squelette
```python
# -*- coding: utf-8 -*-
"""Une phrase qui décrit le plugin."""
from jarvis import Reponse, commande, lancer

NOM = "Nom lisible"
DESCRIPTION = "Ce que fait le plugin, avec un exemple de phrase."


@commande("allume la lumière du {piece}", "lumière {piece}", description="Allume une lumière")
def allumer(req):
    piece = req.groupes["piece"]
    return f"J'allume la lumière du {piece}, {req.appellation}."
```

## Déclencheurs
- Phrases simples : accents, majuscules et ponctuation ignorés ; la phrase peut apparaître n'importe où dans la demande.
- `{nom}` capture du texte → `req.groupes["nom"]` (texte original, accents conservés).
- Expression régulière : `@commande(r"^volume (?P<n>\d+)$", regex=True)` ; le texte est en minuscules, sans accents ni ponctuation.
- Les plugins passent AVANT les commandes intégrées : sois précis, et `return None` pour laisser JARVIS répondre.

## Objet `req`
`texte`, `simple`, `groupes`, `appellation`, `prenom`, `ville`, `contexte` (heure ISO, fuseau, plateforme, version_pc),
`stockage` (dictionnaire JSON persistant : l'affectation `req.stockage["cle"] = valeur` sauvegarde ; après une modification
interne, appelle `req.stockage.sauvegarder()`).

## Valeurs de retour
- `str` : phrase lue à voix haute.
- `Reponse(texte, ouvrir=url|[urls], minuteur=secondes, nom_minuteur="…", liste=[...], titre="…")`.
- `None` : non géré.

## Agir sur le PC
`lancer("notepad.exe")`, `lancer(chemin, *arguments)`, `ouvrir_dossier(chemin)`, ainsi que tout Python (`subprocess`, `os`…).
Les `print()` vont dans le journal (`%APPDATA%\JARVIS\logs\jarvis.log`), pas dans la réponse.

## Bonnes pratiques
- Réponses courtes en français, vouvoiement, `req.appellation`.
- Bibliothèque standard uniquement, sauf si l'utilisateur a installé Python et les modules avec pip.
- Gère les erreurs attendues (`try/except`) et renvoie un message clair. Une exception non gérée est affichée dans JARVIS.
- Vérifie avec `python -m py_compile plugins/mon_plugin.py`.
