# Ambiance

Application Windows de bruits blancs et d'ambiances sonores (inspirée d'Ambie White Noise),
avec toutes les fonctions « premium » incluses gratuitement et une souris de bureau en pixel art.

## Installer

Téléchargez `Ambiance Setup 1.1.0.exe` (environ 116 Mo, 273 Mo une fois installé) depuis la page
[Releases](https://github.com/pepittto29/ambiance/releases) et lancez-le
(ou compilez-le vous-même avec `npm run dist`, il apparaît alors dans `dist\`). L'installateur crée un raccourci sur le Bureau et dans le menu Démarrer,
et l'application apparaît dans « Applications installées » de Windows (désinstallation classique).

> L'installateur n'est pas signé : Windows SmartScreen peut afficher « Windows a protégé votre ordinateur ».
> Cliquez sur **Informations complémentaires → Exécuter quand même**.

## Fonctionnalités

- **Modes** (page d'accueil) : Normal, Focus, Détente, Fun, et vos propres modes. Un clic change l'ambiance sonore,
  l'énergie du compagnon et des réglages de Windows : noir et blanc, écran chaud (moins de lumière bleue),
  atténuation, thème sombre/clair, notifications coupées, icônes du bureau masquées, barre des tâches masquée,
  mode d'alimentation, fond d'écran, mise en veille empêchée, applications distrayantes réduites, sites ou
  programmes à ouvrir. **Tout est restauré** en quittant le mode ou l'application, même après un plantage.
  Changement rapide : icône près de l'horloge ou **Ctrl + Alt + M**.
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
- Raccourci **Espace** = lecture/pause. Option « Lancer avec Windows ». Aucun compte, rien n'est envoyé en ligne.

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
