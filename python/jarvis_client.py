# -*- coding: utf-8 -*-
"""
Piloter J.A.R.V.I.S. depuis vos propres scripts Python (JARVIS doit être lancé).

    from jarvis_client import demander
    print(demander("Quelle heure est-il ?"))
    demander("Rappelle-moi de sortir le chien dans 20 minutes")

Ligne de commande :  python jarvis_client.py "Quel temps fait-il à Lyon ?"
"""
import json
import os
import sys
import time
import urllib.request

URL = os.environ.get("JARVIS_URL", "http://127.0.0.1:3777")


def demander(message: str, url: str = URL, delai: float = 90) -> str:
    """Envoie une demande à JARVIS et renvoie sa réponse texte."""
    decalage = time.altzone if time.localtime().tm_isdst > 0 else time.timezone
    corps = json.dumps(
        {"message": message, "client": {"now": time.strftime("%Y-%m-%dT%H:%M:%S"), "tzOffset": decalage // 60}}
    ).encode("utf-8")
    requete = urllib.request.Request(
        url.rstrip("/") + "/api/chat", data=corps, headers={"Content-Type": "application/json"}, method="POST"
    )
    texte = ""
    with urllib.request.urlopen(requete, timeout=delai) as reponse:
        for ligne in reponse:
            ligne = ligne.decode("utf-8").strip()
            if not ligne:
                continue
            evenement = json.loads(ligne)
            if evenement.get("type") == "delta":
                texte += evenement.get("text", "")
            elif evenement.get("type") == "final":
                texte = evenement.get("text", texte)
            elif evenement.get("type") == "error":
                raise RuntimeError(evenement.get("message", "Erreur JARVIS"))
    return texte


if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) or "Bonjour Jarvis"
    print(demander(question))
