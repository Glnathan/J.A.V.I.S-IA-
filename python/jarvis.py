# -*- coding: utf-8 -*-
"""
jarvis.py — boîte à outils pour écrire des plugins J.A.R.V.I.S. en Python.

Exemple minimal (fichier à placer dans le dossier « plugins ») :

    from jarvis import commande

    @commande("dis bonjour à {nom}")
    def bonjour(req):
        return f"Bonjour {req.groupes['nom']} !"

Documentation complète : plugins/LISEZMOI.md
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from typing import Any, Callable, Dict, List, Optional, Pattern

__all__ = ["commande", "Reponse", "Requete", "Stockage", "simplifier", "plier", "lancer", "ouvrir_dossier"]

_PONCTUATION = set("’'`´-_–—!?.,;:\"«»()[]{}…/\\|*+=<>~^")
_ACCOLADE = re.compile(r"\{(\w+)\}")


def _sans_accents(texte: str) -> str:
    decompose = unicodedata.normalize("NFD", texte)
    return unicodedata.normalize("NFC", "".join(c for c in decompose if not unicodedata.combining(c)))


def plier(texte: str) -> str:
    """Minuscules, sans accents, ponctuation → espaces. Garde EXACTEMENT la longueur du texte."""
    sortie = []
    n = len(texte)
    for i, ch in enumerate(texte):
        base = "".join(c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c)).lower()
        if len(base) != 1:
            base = ch.lower() if len(ch.lower()) == 1 else ch
        if base in _PONCTUATION:
            entre_chiffres = base in ".," and 0 < i < n - 1 and texte[i - 1].isdigit() and texte[i + 1].isdigit()
            if not entre_chiffres:
                base = " "
        sortie.append(base)
    return "".join(sortie)


def simplifier(texte: str) -> str:
    """« Éteins la LUMIÈRE, s'il te plaît ! » → « eteins la lumiere s il te plait »"""
    return " ".join(plier(texte).split())


def _compiler_phrase(phrase: str) -> Pattern[str]:
    morceaux = _ACCOLADE.split(phrase)
    pieces: List[str] = []
    for i, morceau in enumerate(morceaux):
        if i % 2 == 0:
            mots = simplifier(morceau).split()
            if mots:
                pieces.append(r"\s+".join(re.escape(m) for m in mots))
        else:
            dernier = i == len(morceaux) - 2 and not simplifier(morceaux[-1])
            pieces.append(f"(?P<{morceau}>.+)" if dernier else f"(?P<{morceau}>.+?)")
    if not pieces:
        raise ValueError(f"Phrase déclencheur vide : {phrase!r}")
    return re.compile(r"(?<!\w)" + r"\s+".join(pieces) + r"(?!\w)")


class _Commande:
    __slots__ = ("fichier", "nom", "declencheurs", "motifs", "description", "fonction")

    def __init__(self, fichier: str, nom: str, declencheurs: List[str], motifs: List[Pattern[str]], description: str, fonction: Callable[..., Any]) -> None:
        self.fichier = fichier
        self.nom = nom
        self.declencheurs = declencheurs
        self.motifs = motifs
        self.description = description
        self.fonction = fonction


_REGISTRE: List[_Commande] = []
_fichier_courant: Optional[str] = None


def _definir_fichier(nom: Optional[str]) -> None:
    global _fichier_courant
    _fichier_courant = nom


def _retirer(fichier: str) -> None:
    _REGISTRE[:] = [c for c in _REGISTRE if c.fichier != fichier]


def commande(*declencheurs: str, regex: bool = False, description: str = "") -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Déclare une commande vocale.

    - Phrases simples (recommandé) : @commande("quelle est la météo à {ville}", "météo {ville}")
      Les accents, majuscules et la ponctuation sont ignorés. Les {accolades} capturent du texte,
      disponible ensuite dans req.groupes["ville"].
    - Expressions régulières : @commande(r"^(allume|eteins) la (?P<piece>\\w+)$", regex=True)
      Le texte analysé est en minuscules, sans accents ni ponctuation.

    La fonction reçoit un objet Requete et renvoie un texte, une Reponse(...), ou None pour laisser
    JARVIS traiter la demande normalement.
    """
    if len(declencheurs) == 1 and callable(declencheurs[0]):
        raise TypeError('Utilisez @commande("votre phrase") avec au moins une phrase entre guillemets.')
    if not declencheurs:
        raise ValueError('@commande(...) attend au moins une phrase, par exemple @commande("quelle heure est-il")')
    motifs = [re.compile(_sans_accents(d), re.IGNORECASE) if regex else _compiler_phrase(d) for d in declencheurs]

    def decorer(fonction: Callable[..., Any]) -> Callable[..., Any]:
        doc = (fonction.__doc__ or "").strip().splitlines()
        _REGISTRE.append(
            _Commande(_fichier_courant or "?", fonction.__name__, list(declencheurs), motifs, description or (doc[0] if doc else ""), fonction)
        )
        return fonction

    return decorer


def _dossier_donnees() -> str:
    base = os.environ.get("JARVIS_DATA_DIR") or os.path.join(os.path.expanduser("~"), ".jarvis")
    return os.path.join(base, "plugins-data")


class Stockage(dict):
    """Dictionnaire sauvegardé automatiquement sur le disque (un fichier JSON par plugin).

    req.stockage["compteur"] = 3          # sauvegarde immédiate
    req.stockage["liste"].append("x")     # modification interne : appelez req.stockage.sauvegarder()
    """

    def __init__(self, chemin: str) -> None:
        super().__init__()
        self._chemin = chemin
        try:
            with open(chemin, "r", encoding="utf-8") as fichier:
                contenu = json.load(fichier)
            if isinstance(contenu, dict):
                self.update(contenu)
        except (OSError, ValueError):
            pass

    def sauvegarder(self) -> None:
        os.makedirs(os.path.dirname(self._chemin), exist_ok=True)
        temporaire = self._chemin + ".tmp"
        with open(temporaire, "w", encoding="utf-8") as fichier:
            json.dump(dict(self), fichier, ensure_ascii=False, indent=2)
        os.replace(temporaire, self._chemin)

    def __setitem__(self, cle: str, valeur: Any) -> None:
        super().__setitem__(cle, valeur)
        self.sauvegarder()

    def __delitem__(self, cle: str) -> None:
        super().__delitem__(cle)
        self.sauvegarder()


class Requete:
    """La demande transmise à votre fonction.

    req.texte        la phrase complète (« Dis bonjour à Pepper »)
    req.simple       version simplifiée (« dis bonjour a pepper »)
    req.groupes      valeurs capturées par les {accolades} ({"nom": "Pepper"})
    req.appellation  comment JARVIS appelle l'utilisateur (« monsieur », « madame »…)
    req.prenom       prénom de l'utilisateur (s'il l'a donné)
    req.ville        ville configurée dans les paramètres
    req.contexte     toutes les infos (heure, fuseau, plateforme…)
    req.stockage     dictionnaire persistant propre à votre plugin
    """

    def __init__(self, texte: str, correspondance: Optional["re.Match[str]"], contexte: Optional[Dict[str, Any]], fichier: str) -> None:
        self.texte = texte
        self.simple = simplifier(texte)
        self.correspondance = correspondance
        self.contexte: Dict[str, Any] = contexte or {}
        self.appellation = str(self.contexte.get("appellation") or "monsieur")
        self.prenom = str(self.contexte.get("prenom") or "")
        self.ville = str(self.contexte.get("ville") or "")
        self.groupes: Dict[str, str] = {}
        if correspondance is not None:
            for nom in correspondance.re.groupindex:
                debut, fin = correspondance.span(nom)
                if debut >= 0:
                    self.groupes[nom] = texte[debut:fin].strip(" \t.,;:!?'\"«»")
        self._fichier = fichier
        self._stockage: Optional[Stockage] = None

    @property
    def stockage(self) -> Stockage:
        if self._stockage is None:
            nom = os.path.splitext(os.path.basename(self._fichier))[0]
            self._stockage = Stockage(os.path.join(_dossier_donnees(), f"{nom}.json"))
        return self._stockage

    def __repr__(self) -> str:
        return f"Requete(texte={self.texte!r}, groupes={self.groupes!r})"


class Reponse(dict):
    """Réponse enrichie.

    Reponse("J'ouvre la doc.", ouvrir="https://docs.python.org/fr/3/")
    Reponse("Minuteur lancé.", minuteur=300, nom_minuteur="Thé")
    Reponse("Voici la liste.", liste=["un", "deux"], titre="Ma liste")
    """

    def __init__(
        self,
        texte: str = "",
        *,
        ouvrir: Any = None,
        minuteur: Optional[float] = None,
        nom_minuteur: Optional[str] = None,
        liste: Optional[List[Any]] = None,
        titre: Optional[str] = None,
    ) -> None:
        super().__init__()
        self["texte"] = texte
        if ouvrir:
            self["ouvrir"] = ouvrir
        if minuteur:
            self["minuteur"] = int(minuteur)
        if nom_minuteur:
            self["nom_minuteur"] = nom_minuteur
        if liste is not None:
            self["liste"] = [str(x) for x in liste]
        if titre:
            self["titre"] = titre


def lancer(programme: str, *arguments: str) -> bool:
    """Lance un programme, un fichier ou un dossier sur le PC. Renvoie True si le lancement a réussi.

    lancer("notepad.exe")
    lancer(r"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe", r"C:\\Musique\\film.mp4")
    """
    programme = os.path.expandvars(os.path.expanduser(programme))
    try:
        if os.name == "nt":
            if arguments:
                drapeaux = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                subprocess.Popen([programme, *arguments], creationflags=drapeaux, close_fds=True)
            else:
                os.startfile(programme)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", programme, *(["--args", *arguments] if arguments else [])])
        else:
            cible = [programme, *arguments] if (arguments or shutil.which(programme)) else ["xdg-open", programme]
            subprocess.Popen(cible, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        return True
    except (OSError, ValueError):
        return False


def ouvrir_dossier(chemin: str) -> bool:
    """Ouvre un dossier dans l'explorateur de fichiers."""
    return lancer(chemin)
