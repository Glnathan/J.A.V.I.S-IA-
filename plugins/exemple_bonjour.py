# -*- coding: utf-8 -*-
"""Exemple le plus simple : JARVIS salue quelqu'un par son prénom."""
from jarvis import commande

NOM = "Salutations"
DESCRIPTION = "Dites « Jarvis, dis bonjour à Pepper » et JARVIS salue la personne."


@commande("dis bonjour à {nom}", "salue {nom}", description="Salue une personne par son prénom")
def dire_bonjour(req):
    nom = req.groupes["nom"].title()
    return f"Bonjour {nom} ! Ravi de faire votre connaissance. {req.appellation.capitalize()} m'a beaucoup parlé de vous."
