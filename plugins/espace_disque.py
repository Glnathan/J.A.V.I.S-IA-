# -*- coding: utf-8 -*-
"""Exemple d'accès au PC : espace libre sur les disques (module standard shutil)."""
import os
import shutil
import string

from jarvis import Reponse, commande

NOM = "Espace disque"
DESCRIPTION = "« Jarvis, espace disque » : indique la place libre sur chaque disque."


def _disques():
    if os.name == "nt":
        for lettre in string.ascii_uppercase:
            racine = f"{lettre}:\\"
            if os.path.exists(racine):
                try:
                    yield racine, shutil.disk_usage(racine)
                except OSError:
                    continue
    else:
        yield "/", shutil.disk_usage("/")


@commande("espace disque", "place sur le disque", "stockage restant", "combien de place reste", description="Espace libre sur vos disques")
def espace_disque(req):
    if not req.contexte.get("version_pc"):
        return (
            f"Je fonctionne actuellement depuis un serveur en ligne, {req.appellation} : je n'ai pas accès aux disques de votre PC. "
            "Installez la version PC pour cela."
        )
    disques = list(_disques())
    if not disques:
        return f"Je n'arrive pas à lire vos disques, {req.appellation}."
    lignes = [f"{racine} — {u.free / 1e9:.0f} Go libres sur {u.total / 1e9:.0f} Go ({u.used / u.total:.0%} utilisés)" for racine, u in disques]
    racine, principal = disques[0]
    texte = f"Il reste {principal.free / 1e9:.0f} gigaoctets libres sur le disque {racine[0]}, {req.appellation}."
    if principal.free / principal.total < 0.1:
        texte += " C'est un peu juste : je vous suggère un peu de ménage."
    return Reponse(texte, liste=lignes, titre="Espace disque")
