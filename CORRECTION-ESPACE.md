# Correction du mode Espace — 24 septembre 2026

Le code source a été modifié et compilé. La copie vers l'installation a été refusée par le contrôle automatique ; lancer Appliquer-mode-espace.cmd pour l'appliquer, puis rouvrir JARVIS.

- Maintenant ×1 remet réellement l'horloge à l'heure actuelle après une simulation accélérée.
- Simulation fondée sur le temps écoulé, pas sur le nombre de déclenchements des minuteurs.
- Globe avec contours Natural Earth (domaine public), atmosphère, fond étoilé, zoom et hauteur des satellites.
- Planètes éclairées et anneaux de Saturne, système solaire cadré au démarrage. Rendu illustratif : éclairage décoratif, dimensions et distances non à l'échelle.
- Éléments orbitaux JSON OMM, cache sur disque et catalogue de secours du 23 septembre 2026.
- Dates de calcul/catalogue/éléments affichées, avertissements de données partielles ou hors ligne.
- Catalogue conservant la sélection précédente : stations, GPS, échantillon de 70 Starlink. Ce n'est pas l'ensemble des objets orbitaux.
- Les positions sont calculées par SGP4 ; le système solaire emploie des éphémérides képlériennes simplifiées. Ce n'est pas de l'imagerie en direct.

Validation : TypeScript et build de production réussis ; test hors ligne HTTP403 à froid, ISS et progression à +60 secondes ; vérification visuelle des deux vues et retour de simulation à l'heure actuelle.

Sauvegarde des sources initiales : Documents/Codex/2026-09-23/je-x20/work/space-1102-backup. Le lanceur crée sa sauvegarde du programme installé dans sauvegardes-espace avant application. Clés, base de données, profil et plugins ne sont pas modifiés.
