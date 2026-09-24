# -*- coding: utf-8 -*-
"""Exemple avec mémoire persistante : JARVIS compte vos cafés de la journée (req.stockage)."""
import datetime

from jarvis import commande

NOM = "Compteur de cafés"
DESCRIPTION = "« J'ai bu un café » puis « combien de cafés ? » — montre comment mémoriser des données."


def _aujourdhui():
    return datetime.date.today().isoformat()


@commande("j'ai bu un café", "j'ai pris un café", "encore un café", description="Ajoute un café au compteur du jour")
def ajouter_cafe(req):
    compteur = req.stockage.get("cafes", {})
    jour = _aujourdhui()
    compteur[jour] = compteur.get(jour, 0) + 1
    req.stockage["cafes"] = compteur  # une affectation sauvegarde automatiquement
    n = compteur[jour]
    if n >= 5:
        return f"C'est votre {n}e café aujourd'hui, {req.appellation}. Puis-je suggérer un verre d'eau ?"
    return f"Noté : {n} café{'s' if n > 1 else ''} aujourd'hui, {req.appellation}."


@commande("combien de cafés", "compteur de cafés", description="Nombre de cafés bus aujourd'hui")
def combien_de_cafes(req):
    n = req.stockage.get("cafes", {}).get(_aujourdhui(), 0)
    if n == 0:
        return f"Aucun café aujourd'hui, {req.appellation}. Une sobriété remarquable."
    return f"Vous en êtes à {n} café{'s' if n > 1 else ''} aujourd'hui, {req.appellation}."
