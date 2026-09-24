# Plugins Python pour J.A.R.V.I.S.

Chaque fichier `.py` de ce dossier ajoute des commandes vocales à JARVIS.
Les modifications sont **prises en compte immédiatement**, sans redémarrer JARVIS.
Les fichiers qui commencent par `_` (comme `_modele.py`) sont ignorés.

## Votre premier plugin (30 secondes)

Créez `meteo_perso.py` dans ce dossier :

```python
from jarvis import commande

NOM = "Mon premier plugin"

@commande("dis bonjour à {nom}")
def bonjour(req):
    return f"Bonjour {req.groupes['nom']} !"
```

Puis dites : « Jarvis, dis bonjour à Pepper ». C'est tout !

## Les déclencheurs

| Écriture | Exemple de phrase reconnue |
| --- | --- |
| `@commande("quelle heure est-il à tokyo")` | « Quelle heure est-il à Tokyo ? » |
| `@commande("allume {piece}")` | « Allume le salon » → `req.groupes["piece"] == "le salon"` |
| `@commande("météo", "quel temps")` | plusieurs phrases possibles |
| `@commande(r"^volume (?P<n>\d+)$", regex=True)` | expression régulière |

Accents, majuscules et ponctuation sont ignorés. La phrase peut apparaître au milieu de la demande.
Les plugins passent **avant** les commandes intégrées : renvoyez `None` pour laisser JARVIS répondre.

## Ce que reçoit votre fonction (`req`)

- `req.texte` : la phrase complète ; `req.simple` : sa version simplifiée
- `req.groupes` : les valeurs des `{accolades}`
- `req.appellation` (« monsieur »…), `req.prenom`, `req.ville`, `req.contexte`
- `req.stockage` : dictionnaire sauvegardé automatiquement (voir `compteur_cafe.py`)

## Ce que peut renvoyer votre fonction

```python
return "Texte lu à voix haute"
return Reponse("J'ouvre GitHub.", ouvrir="https://github.com")
return Reponse("C'est parti.", minuteur=600, nom_minuteur="Pâtes")
return Reponse("Voici vos fichiers.", liste=["a.txt", "b.txt"], titre="Fichiers")
return None   # je ne gère pas cette demande
```

## Agir sur le PC

```python
from jarvis import lancer, ouvrir_dossier
lancer("notepad.exe")                    # un programme
lancer(r"C:\Users\moi\Documents\cv.pdf")  # un fichier
ouvrir_dossier(r"C:\Users\moi\Downloads")
```

Vous pouvez utiliser tout Python : `os`, `subprocess`, `datetime`, `urllib`… Si Python est installé
sur votre PC (python.org), JARVIS l'utilise et vous pouvez ajouter des modules avec `pip install`.
Sinon, JARVIS utilise le Python intégré (bibliothèque standard uniquement).

⚠️ Un plugin s'exécute avec vos droits : n'installez que des plugins dont vous comprenez le code.
Les `print()` de vos plugins apparaissent dans le journal de JARVIS (`%APPDATA%\JARVIS\logs`).
