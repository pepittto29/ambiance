# Ambiance

Application Windows de bruits blancs et d'ambiances sonores (inspirée d'Ambie White Noise),
avec toutes les fonctions « premium » incluses gratuitement et une souris de bureau en pixel art.

## Installer

Téléchargez `Ambiance Setup 1.2.0.exe` (environ 116 Mo, 273 Mo une fois installé) depuis la page
[Releases](https://github.com/pepittto29/ambiance/releases) et lancez-le
(ou compilez-le vous-même avec `npm run dist`, il apparaît alors dans `dist\`). L'installateur crée un raccourci sur le Bureau et dans le menu Démarrer,
et l'application apparaît dans « Applications installées » de Windows (désinstallation classique).

> L'installateur n'est pas signé : Windows SmartScreen peut afficher « Windows a protégé votre ordinateur ».
> Cliquez sur **Informations complémentaires → Exécuter quand même**.

## Fonctionnalités

- **Modes** (page d'accueil) : Normal, Focus, Détente, Fun, Rétro, et vos propres modes. Un clic change l'ambiance sonore,
  l'énergie du compagnon et des réglages de Windows : noir et blanc, écran chaud (moins de lumière bleue),
  atténuation, thème sombre/clair, notifications coupées, icônes du bureau masquées, barre des tâches masquée,
  mode d'alimentation, fond d'écran, mise en veille empêchée, applications distrayantes réduites, sites ou
  programmes à ouvrir. **Tout est restauré** en quittant le mode ou l'application, même après un plantage.
  Changement rapide : icône près de l'horloge ou **Ctrl + Alt + M**.
- **Parler à son compagnon** (page Compagnon) : demandez-lui un son (« mets de la pluie et du vent »), un mode
  (« mode focus »), une tâche (« ajoute la tâche appeler Léa demain »), une session Focus, ce qu'il vous reste à
  faire, ou de **créer un mode à partir d'une phrase** (« crée un mode pour réviser le soir avec de la pluie »).
  Il retient votre prénom et vos goûts, et vous pouvez lui donner un nom. Sans rien installer, il comprend les
  commandes et répond avec des phrases toutes faites.
- **IA locale facultative** : en un clic, Ambiance télécharge un petit modèle de langage (Qwen2.5, licence
  Apache 2.0 : « Léger » 491 Mo ou « Malin » 1,1 Go, conseillé selon la mémoire du PC) et le moteur llama.cpp
  (20 Mo). Le compagnon comprend alors les phrases libres et discute avec sa personnalité. Tout tourne sur le
  processeur, sans carte graphique, et **rien ne quitte le PC** ; les fichiers sont vérifiés par empreinte et le
  moteur s'arrête tout seul quand on ne lui parle plus.
- **Mode Rétro** : fonds d'écran en pixel art dessinés par l'application (coucher de soleil, nuit étoilée,
  grand jour, arcade), curseurs en pixels, couleur d'accent de Windows au choix, musique **chiptune** ou
  **salle d'arcade** générée en direct, et cadre décoratif sur l'écran (bordure en pixels ou vieil écran
  cathodique). Chaque élément peut s'ajouter à n'importe quel mode, et tout est remis d'origine en quittant.
  La barre des tâches peut aussi changer d'apparence avec [Windhawk](https://windhawk.net/) (facultatif).
- **Tâches** : liste avec priorités (haute, normale, basse), échéances (en rouge si en retard), modification
  par double-clic, filtres et barre de progression. Partagée avec la page Focus et le compagnon.
- **Le compagnon et vos tâches** : double-cliquez sur lui pour voir où vous en êtes (progression, prochaine tâche,
  bouton « C'est fait »). Il fête chaque tâche terminée et vous fait de petits rappels (sauf en mode calme).
- **Musique** : Ambiance affiche ce que joue **n'importe quelle application** (Spotify, Deezer, YouTube Music,
  Apple Music, un navigateur…) avec la pochette, et la pilote (lecture/pause, suivant, précédent), aussi depuis
  l'icône près de l'horloge. Chaque mode peut lancer sa musique (lien Spotify, Deezer, YouTube Music…).
- **Connexion Spotify** (facultative) : parcourez vos playlists et vos titres likés, cherchez et lancez de la musique
  depuis Ambiance ou automatiquement avec un mode. Spotify impose à chaque utilisateur de créer son propre
  identifiant (gratuit, 5 minutes, guidé dans l'application) ; le pilotage demande Spotify Premium.
  Les jetons de connexion sont chiffrés par Windows et restent sur votre PC.
- **Horloge de bureau** pixel art, déplaçable, toujours visible, avec la date ou le temps restant d'une session Focus.
- **Vrais enregistrements** (licence CC0, domaine public) : pluie, orage, plage, vent, feu de cheminée, café,
  oiseaux, ruisseau, bruit brun… plus une vingtaine d'ambiances dans le **Catalogue** (forêt tropicale, rivière,
  fonds marins, ville, océan, grillons, grenouilles, train, avion, chat qui ronronne, horloge, clavier, feu de camp…).
  Lecture en boucle avec fondu enchaîné, sans coupure audible.
- **Mixage** : superposez plusieurs sons, volume réglable pour chacun + volume général.
- **Import** : ajoutez vos propres fichiers audio (mp3, wav, ogg, flac, m4a…).
- **Focus** : sessions Pomodoro (durées et nombre de sessions réglables), cloche de fin, notifications Windows,
  liste de tâches, statistiques (minutes du jour, total, jours d'affilée, graphique de la semaine).
- **Chaînes** : ambiances immersives en plein écran (orage, feu de camp, chalet d'hiver, océan, forêt tropicale,
  abysses, nuit à la campagne, aurore boréale) — une scène animée et un mixage assorti.
- **Respiration guidée** : cohérence cardiaque, respiration carrée, 4-7-8, apaisement.
- **Minuteur de sommeil** : 5 min à 2 h, Pomodoro 25 min, avec fondu de sortie.
- **Mixages enregistrés**, **mode compact** (mini-lecteur toujours visible), **écran de veille** automatique.
- **Compagnon de bureau** : un petit animal rétro 2D façon jeu de plateforme, au choix **souris, hamster,
  lapin ou chat**, chacun avec sa nourriture préférée (fromage, carotte, poisson) et sa petite voix.
  - Il marche sur le bord supérieur des fenêtres, sur les lignes d'interface visibles à l'écran (séparateurs,
    cadres, zones de saisie, repérés par contraste) et sur la barre des tâches — **jamais sur le texte**.
    Il saute de l'une à l'autre, grimpe le long des bords de l'écran et se promène au plafond.
  - Mouvements soignés : accélération progressive, il s'accroupit avant de sauter, amortit ses atterrissages,
    hésite au bord avant de se laisser tomber.
  - Si la fenêtre sous lui se ferme ou bouge, il suit le mouvement ou tombe jusqu'en bas, rebondit et roule.
  - **Terrier** : placez sa maison où vous voulez (Paramètres → Placer le terrier). Il y rentre dormir et en ressort.
    Les trous aléatoires n'apparaissent que sur le bas de l'écran.
  - **Il apprend vos habitudes** (fichier local `pet-memory.json`) : il évite de rester là où vous travaillez,
    se fait discret quand vous tapez beaucoup, dort plus aux heures où vous êtes habituellement absent et
    retourne aux endroits où vous l'avez caressé.
  - Survolez-le (il adore ça), cliquez dessus (il saute ; trois clics d'affilée l'énervent), attrapez-le ou lancez-le.
  - Émotions : joie, amour, curiosité, surprise, peur, colère, tristesse, ennui, faim, étourdissement, sommeil.
  - À manger tous les quarts d'heure (ou « Donner à manger » depuis l'icône près de l'horloge).
  - L'analyse de l'écran se fait localement, en mémoire ; rien n'est enregistré ni envoyé. Désactivable.
- **Zone de notification** : la croix coupe le son et range l'application près de l'horloge ; le compagnon continue.
  Clic droit sur l'icône : lecture/pause, afficher/masquer le compagnon, donner à manger, quitter.
- **Fluent Design** : effet Mica sous Windows 11, thème clair/sombre et couleur d'accent du système.
- Raccourci **Espace** = lecture/pause. Option « Lancer avec Windows ». Aucun compte Ambiance ; seule la connexion Spotify, si vous l'activez, communique avec Spotify.

## Crédits sonores

Tous les enregistrements viennent de [Freesound](https://freesound.org) sous licence Creative Commons 0.
La liste complète (titre, auteur, lien) est dans **Paramètres → Crédits**. Les 13 sons de base sont ceux
qu'utilise le projet open source Ambie.

## Développement

```bash
npm install
npm start                          # lance l'application
npm run dist                       # génère l'installateur dans dist/
npm run icon                       # régénère assets/icon.png
node scripts/fetch-freesound.js    # (re)télécharge les ambiances CC0 du catalogue
```

Si `npm run dist` échoue avec « Cannot create symbolic link », activez le Mode développeur de Windows
(Paramètres → Système → Pour les développeurs) ou lancez le terminal en administrateur, puis relancez.
