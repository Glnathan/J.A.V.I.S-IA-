# -*- coding: utf-8 -*-
"""Ajoutez VOS logiciels : JARVIS les lancera à la voix (« Jarvis, lance Photoshop »)."""
from jarvis import commande, lancer, simplifier

NOM = "Mes programmes"
DESCRIPTION = "Lance les logiciels listés dans PROGRAMMES. Modifiez la liste pour ajouter les vôtres."

# ➜ Ajoutez vos programmes ici :  "nom prononcé": "commande ou chemin complet"
#   Astuce : clic droit sur un raccourci > Propriétés > Cible pour trouver le chemin.
PROGRAMMES = {
    "bloc notes": "notepad.exe",
    "paint": "mspaint.exe",
    "calculatrice": "calc.exe",
    # "photoshop": r"C:\Program Files\Adobe\Adobe Photoshop 2025\Photoshop.exe",
    # "vlc": r"C:\Program Files\VideoLAN\VLC\vlc.exe",
    # "minecraft": r"C:\XboxGames\Minecraft Launcher\Content\Minecraft.exe",
}


@commande("lance {programme}", "démarre {programme}", "ouvre le programme {programme}", description="Lance un programme de votre liste")
def lancer_programme(req):
    if not req.contexte.get("version_pc"):
        return None  # version en ligne : JARVIS explique lui-même qu'il ne peut pas lancer de logiciel
    demande = simplifier(req.groupes["programme"])
    for nom, chemin in PROGRAMMES.items():
        if simplifier(nom) == demande:
            if lancer(chemin):
                return f"Je lance {nom}, {req.appellation}."
            return f"Je n'ai pas réussi à lancer {nom}, {req.appellation}. Vérifiez son chemin dans le plugin « mes_programmes.py »."
    return None  # pas dans la liste : JARVIS continue avec ses commandes intégrées (sites, musique…)
