# -*- coding: utf-8 -*-
"""
Pont entre J.A.R.V.I.S. (Node.js) et vos plugins Python.

Protocole : une requête JSON par ligne sur l'entrée standard, une réponse JSON par ligne sur la
sortie standard. Les plugins sont rechargés automatiquement dès qu'un fichier .py change.
Vous n'avez normalement pas besoin de modifier ce fichier : écrivez vos plugins dans « plugins ».
"""
import importlib.util
import json
import os
import sys
import traceback

ICI = os.path.dirname(os.path.abspath(__file__))
if ICI not in sys.path:
    sys.path.insert(0, ICI)

import jarvis  # noqa: E402

for _flux in (sys.stdin, sys.stdout, sys.stderr):
    try:
        _flux.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

PROTOCOLE = sys.stdout
sys.stdout = sys.stderr  # les print() des plugins vont dans le journal, pas dans le protocole

DOSSIER = os.path.abspath(os.environ.get("JARVIS_PLUGINS_DIR") or os.path.join(os.path.dirname(ICI), "plugins"))
if DOSSIER not in sys.path:
    sys.path.insert(1, DOSSIER)

_modules = {}


def _nom_lisible(fichier, module):
    nom = getattr(module, "NOM", None) if module is not None else None
    return str(nom) if nom else os.path.splitext(fichier)[0].replace("_", " ").strip().capitalize()


def _charger(fichier, chemin, mtime):
    jarvis._retirer(fichier)
    jarvis._definir_fichier(fichier)
    info = {"mtime": mtime, "module": None, "erreur": None}
    try:
        nom_module = "jarvis_plugin_" + "".join(c if c.isalnum() else "_" for c in os.path.splitext(fichier)[0])
        spec = importlib.util.spec_from_file_location(nom_module, chemin)
        if spec is None or spec.loader is None:
            raise ImportError("Impossible de charger " + fichier)
        module = importlib.util.module_from_spec(spec)
        sys.modules[nom_module] = module
        spec.loader.exec_module(module)
        info["module"] = module
    except (Exception, SystemExit):
        info["erreur"] = traceback.format_exc(limit=3)
        jarvis._retirer(fichier)
        print(f"[plugins] Erreur de chargement dans {fichier} :\n{info['erreur']}")
    finally:
        jarvis._definir_fichier(None)
    _modules[fichier] = info


def scanner():
    try:
        fichiers = sorted(f for f in os.listdir(DOSSIER) if f.endswith(".py") and not f.startswith(("_", ".")))
    except OSError:
        fichiers = []
    for fichier in list(_modules):
        if fichier not in fichiers:
            jarvis._retirer(fichier)
            del _modules[fichier]
    for fichier in fichiers:
        chemin = os.path.join(DOSSIER, fichier)
        try:
            mtime = os.path.getmtime(chemin)
        except OSError:
            continue
        info = _modules.get(fichier)
        if info is None or info["mtime"] != mtime:
            _charger(fichier, chemin, mtime)


def _normaliser(sortie):
    if isinstance(sortie, str):
        return {"texte": sortie}
    if isinstance(sortie, dict):
        resultat = {}
        for cle in ("texte", "ouvrir", "minuteur", "nom_minuteur", "liste", "titre"):
            if cle in sortie and sortie[cle] is not None:
                resultat[cle] = sortie[cle]
        if "texte" not in resultat and "text" in sortie:
            resultat["texte"] = str(sortie["text"])
        if "texte" in resultat:
            resultat["texte"] = str(resultat["texte"])
        if isinstance(resultat.get("liste"), (list, tuple)):
            resultat["liste"] = [str(x) for x in resultat["liste"]]
        if isinstance(resultat.get("ouvrir"), (list, tuple)):
            resultat["ouvrir"] = [str(x) for x in resultat["ouvrir"]]
        elif "ouvrir" in resultat:
            resultat["ouvrir"] = str(resultat["ouvrir"])
        if "minuteur" in resultat:
            try:
                resultat["minuteur"] = float(resultat["minuteur"])
            except (TypeError, ValueError):
                del resultat["minuteur"]
        return resultat
    if isinstance(sortie, (list, tuple)):
        return {"texte": "", "liste": [str(x) for x in sortie]}
    return {"texte": str(sortie)}


def traiter(message):
    scanner()
    texte = str(message.get("text") or "")
    contexte = message.get("context") or {}
    plie = jarvis.plier(texte)
    for cmd in list(jarvis._REGISTRE):
        correspondance = None
        for motif in cmd.motifs:
            correspondance = motif.search(plie)
            if correspondance:
                break
        if not correspondance:
            continue
        info = _modules.get(cmd.fichier) or {}
        nom_plugin = _nom_lisible(cmd.fichier, info.get("module"))
        requete = jarvis.Requete(texte, correspondance, contexte, cmd.fichier)
        try:
            sortie = cmd.fonction(requete)
        except (Exception, SystemExit):
            return {"handled": True, "plugin": nom_plugin, "error": traceback.format_exc(limit=4)}
        if sortie is None or sortie is False:
            continue
        return {"handled": True, "plugin": nom_plugin, "result": _normaliser(sortie)}
    return {"handled": False}


def lister():
    scanner()
    plugins = []
    for fichier in sorted(_modules):
        info = _modules[fichier]
        module = info["module"]
        commandes = [
            {"name": c.nom, "patterns": list(c.declencheurs), "description": c.description}
            for c in jarvis._REGISTRE
            if c.fichier == fichier
        ]
        plugins.append(
            {
                "file": fichier,
                "name": _nom_lisible(fichier, module),
                "description": str(getattr(module, "DESCRIPTION", "") or "") if module is not None else "",
                "commands": commandes,
                "error": info["erreur"],
            }
        )
    return {"plugins": plugins, "python": sys.version.split()[0], "executable": sys.executable, "dir": DOSSIER}


def main():
    while True:
        ligne = sys.stdin.readline()
        if not ligne:
            break
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            message = json.loads(ligne)
        except ValueError:
            continue
        try:
            genre = message.get("type")
            if genre == "handle":
                reponse = traiter(message)
            elif genre == "list":
                reponse = lister()
            elif genre == "ping":
                reponse = {"pong": True}
            else:
                reponse = {"error": "type de message inconnu"}
        except Exception:
            reponse = {"error": traceback.format_exc(limit=4)}
        reponse["id"] = message.get("id")
        PROTOCOLE.write(json.dumps(reponse, ensure_ascii=False) + "\n")
        PROTOCOLE.flush()


if __name__ == "__main__":
    main()
