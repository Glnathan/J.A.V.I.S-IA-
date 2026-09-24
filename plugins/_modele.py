# -*- coding: utf-8 -*-
"""
MODÈLE DE PLUGIN — copiez ce fichier, renommez-le (sans « _ » au début) et modifiez-le.
Les fichiers commençant par « _ » sont ignorés par JARVIS.
Les modifications sont prises en compte immédiatement, sans redémarrer JARVIS.
"""
from jarvis import Reponse, commande

NOM = "Mon plugin"
DESCRIPTION = "Décrivez ici ce que fait votre plugin."


@commande("test de mon plugin", description="Vérifie que le plugin fonctionne")
def tester(req):
    return f"Mon plugin fonctionne parfaitement, {req.appellation} !"


@commande("cherche {sujet} sur python", description="Exemple avec texte capturé et ouverture de site")
def chercher_doc(req):
    sujet = req.groupes["sujet"]
    return Reponse(
        f"J'ouvre la documentation Python sur « {sujet} ».",
        ouvrir=f"https://docs.python.org/fr/3/search.html?q={sujet}",
    )
