# La carte du projet

À lire avant toute modification. Chaque fichier, son rôle, et les décisions
qu'il porte.

**Si vous ajoutez, déplacez ou supprimez un fichier, mettez ce document à jour
dans le même changement — et rouvrez `tools/verification.html`.**

---

## Le principe

Site **statique** : pas de build, pas de dépendance, pas de serveur. Des modules
ES natifs, du CSS écrit à la main, des données en JSON. On ouvre un fichier, on
le modifie, on recharge la page.

Tout se passe dans le navigateur. Le dossier de l'artisan — ses clients, ses
devis, ses factures — vit dans le `localStorage` et n'en sort que par un export
volontaire.

---

## L'arborescence

```
index.html                  la coquille : préchargements, écran de chargement,
                            barre latérale vide, page vide
manifest.webmanifest        application installable
sw.js                       cache hors ligne
.nojekyll                   sans lui, GitHub Pages ignore certains dossiers

data/                       les listes fixes, et rien d'autre
  reference.json            types de rendez-vous, états, unités, équipements
  tva.json                  les taux, leurs conditions, l'attestation
  mentions.json             mentions légales imprimées, modèles de relance
  checklist.json            obligations réglementaires, check-lists de terrain
  catalogue.json            le catalogue de départ, copié une fois au premier
                            lancement puis plus jamais relu

assets/css/
  theme.css                 les jetons de design : sept palettes, toutes les
                            couleurs du site
  base.css                  reset, échelle typographique, champs, boutons
  layout.css                l'ossature : chargement, barre latérale, tiroir,
                            page, barre du bas, modale, bandeau
  components.css            cartes, listes, calendrier, éditeur de lignes,
                            totaux, histogramme, feuille de document
  print.css                 ce qui sort de l'imprimante (chargé en media=print)

assets/img/
  favicon.svg               la marque : une goutte qui porte une flamme.
                            Sert aussi d'icône de manifeste — il n'y a AUCUNE
                            image binaire dans le dépôt (voir tools/icones.html)

assets/js/
  config.js                 les réglages qu'on veut changer sans lire le code
  main.js                   l'assemblage : état, routage, enregistrement,
                            modales, bandeaux, raccourcis clavier

  core/                     des briques sans connaissance du métier
    dom.js                  el(), fill(), repli() — fabriquer du DOM
    store.js                un store minimal, debounce(), id()
    format.js               nombres, dates et heures en français
    prefs.js                les réglages de CE navigateur (thème, taille)
    data.js                 chargement des JSON, avec cache
    photos.js               le magasin d'images, dans IndexedDB (voir § 9)

  domain/                   le calcul. Aucun accès au DOM, testable seul
    dossier.js              le schéma du dossier, sa persistance, import/export
    numerotation.js         DEV-2026-0001, FA-2026-0001 — séquence continue
    documents.js            le calcul d'un devis, d'une facture, d'un avoir
    clients.js              recherche, adresses, bilan, doublons
    chantiers.js            les lieux de travail, leurs photos, leurs liens
    agenda.js               jours fériés, grille du mois, conflits, créneaux
    contrats.js             contrats d'entretien et échéances de visite
    catalogue.js            prestations, fournitures, marges, hausse de prix
    stats.js                chiffre d'affaires, encours, transformation, TVA
    mentions.js             les mentions légales, remplies depuis la fiche
                            entreprise ; les modèles de relance

  ui/                       une vue par onglet, plus les briques partagées
    icones.js               les pictogrammes, dessinés à la main
    champs.js               TOUS les contrôles de l'application
    parts.js                les fragments partagés (ligne de rendez-vous,
                            ligne de document, actions client)
    theme.js                les sept palettes, le mode automatique, la taille
    sidebar.js              marque, résumé, navigation, sauvegarde, réglages
    impression.js           la feuille A4 : devis, facture, avoir
    accueil.js              le tableau de bord du matin
    agenda.js               mois, semaine, jour, et la fiche d'un rendez-vous
    clients.js              le fichier clients et la fiche d'un client
    chantiers.js            la liste des chantiers et la fiche de l'un d'eux
    photos.js               prise de vue, galerie, visionneuse
    documents.js            devis et factures : liste, éditeur, aperçu
    interventions.js        les bons d'intervention
    contrats.js             les contrats d'entretien
    catalogue.js            le catalogue et le calcul du taux horaire
    chiffres.js             les chiffres de l'entreprise
    reglages.js             la fiche entreprise, la numérotation, les données

tools/                      hors site — jamais chargés par l'application
  verification.html         125 contrôles : calcul, dates, numérotation, et la
                            liste du cache hors ligne
  icones.html               fabrique les PNG d'icône si on en veut
```

---

## Les décisions, et pourquoi

### 1. Le dossier ne quitte jamais le navigateur

Il n'y a ni compte, ni serveur, ni abonnement. C'est ce qui rend l'application
gratuite, instantanée et utilisable dans une cave sans réseau.

La contrepartie est réelle et doit rester visible : **effacer les données de
navigation efface le dossier**. D'où le bloc de sauvegarde en permanence dans la
barre latérale, le rappel au bout de quatorze jours sans export
(`CONFIG.rappelSauvegardeJours`), et un format d'export qui est le dossier
lui-même, en JSON indenté — lisible dans un éditeur de texte dans dix ans, même
si cette application n'existe plus.

### 2. Une facture ne reçoit son numéro qu'à sa validation

La loi impose une séquence de numéros **chronologique et continue**. Si le
numéro était attribué à la création, chaque brouillon abandonné laisserait un
trou — et un trou dans la numérotation est la première chose que cherche un
contrôle.

Conséquences dans l'application, toutes volontaires :

- un brouillon n'a pas de numéro, et peut être supprimé sans conséquence ;
- un document numéroté **ne peut plus être supprimé** : on l'annule par un avoir ;
- `tools/verification.html` et l'écran des réglages signalent trous et doublons ;
- le compteur est réglable, pour reprendre une numérotation commencée ailleurs.

### 3. Facturé n'est pas encaissé

C'est la distinction qui coule les artisans : on peut avoir fait une bonne année
et ne pas pouvoir payer ses fournisseurs. Les deux chiffres sont donc **toujours
donnés ensemble**, jamais l'un sans l'autre — dans la barre latérale, sur le
tableau de bord, et dans l'histogramme des douze mois où ils forment deux barres
côte à côte (jamais empilées : les additionner ne voudrait rien dire).

### 4. Le calcul est arrondi au centime, ligne par ligne

`0.1 + 0.2` vaut `0.30000000000000004`. Sur un devis de trente lignes, ces
poussières s'additionnent et le total TTC finit par différer d'un centime de la
somme des lignes. Tout montant passe donc par `arrondi()` avant d'être stocké ou
comparé, et `tools/verification.html` vérifie que `HT + TVA = TTC` au centime.

La remise globale se répartit **au prorata sur chaque taux de TVA**. Un chantier
qui mêle 10 % de main d'œuvre et 20 % de chaudière gaz, avec 3 % de geste
commercial, doit voir les deux bases réduites dans la même proportion — sinon la
TVA due change.

### 5. Les dates sont locales, jamais UTC

`new Date().toISOString().slice(0, 10)` rend **la veille** pour tout le monde à
l'est de Greenwich après 22 h en été. Un rendez-vous posé à 23 h le 3 septembre
serait tombé le 2. Toutes les conversions passent par `isoJour()` et
`isoInstant()`, qui lisent les composantes locales.

Conventions : une date seule s'écrit `2026-09-03`, un instant `2026-09-03T14:30`.
Les deux se trient chronologiquement par simple comparaison de chaînes.

### 6. Le re-rendu ne doit jamais manger la saisie

L'application se re-rend à chaque changement de structure. Un champ texte qui
déclencherait un re-rendu à chaque frappe ferait sauter le curseur. D'où deux
chemins d'écriture, dans `main.js` :

- `ctx.maj(fn)` — modifie, enregistre, **re-rend tout** ;
- `ctx.majSilencieux(fn)` — modifie, enregistre en différé, **ne re-rend rien**.

L'éditeur de documents va plus loin : il garde la liste des fonctions qui
mettent à jour chaque case de total, et les rappelle une par une. Le DOM n'est
pas reconstruit, le curseur ne bouge pas, et les totaux suivent la frappe.

### 7. Il n'y a pas de générateur de PDF

Une bibliothèque de PDF pèse plusieurs centaines de kilo-octets, rend mal les
accents, et il faudrait la maintenir. Le navigateur sait déjà imprimer et sait
déjà « Enregistrer au format PDF », sur Windows comme sur iPhone. `print.css`
lui donne une feuille propre, `ui/impression.js` la dessine, et le PDF obtenu
contient du vrai texte, sélectionnable et cherchable.

`main.js` écoute `beforeprint` : un Ctrl+P depuis l'éditeur bascule d'abord sur
l'aperçu, pour ne pas imprimer le formulaire de saisie.

### 8. Le téléphone n'est pas un bureau rétréci

Trois points de rupture, et chacun change la FORME de la page, pas seulement sa
largeur :

- **900 px** — la barre latérale devient un tiroir, et une barre de navigation
  apparaît en bas de l'écran ;
- **860 px** — l'éditeur de lignes abandonne la grille à huit colonnes pour une
  pile de cartes étiquetées ;
- **560 px** — les boutons d'en-tête qui portent un pictogramme perdent leur
  libellé (`:has(svg)`), les actions marquées `optionnel` quittent la barre, les
  pastilles de chiffres se mettent deux par ligne, et les titres de liste passent
  sur deux lignes au lieu d'être tronqués.

Une règle vaut d'être retenue, parce qu'elle a coûté une page cassée :
`.onglet > * { min-width: 0 }`. La valeur par défaut d'un enfant de flexbox est
`min-width: auto`, c'est-à-dire « ne descends jamais sous la largeur de ton
contenu ». Un seul tableau large — la feuille d'un bon d'intervention — poussait
la colonne entière hors de l'écran, et **toute** la page se mettait à défiler
horizontalement. Le contrôle qui l'a trouvé compare `documentElement.scrollWidth`
à `innerWidth` sur chaque écran, à 320 px puis à 375 px.

### 9. Les photos ne sont PAS dans le localStorage

C'est la décision qui commande tout `core/photos.js`, et elle vaut d'être
comprise avant d'y toucher.

Le dossier entier est écrit **d'un seul bloc** par `enregistrer()`, dans un
`localStorage` dont le quota tourne autour de 5 Mo. Une photo de téléphone pèse
3 Mo, et le localStorage n'accepte que du texte : encodée en base64, elle en
pèse 4. Deux photos, et l'écriture échoue.

Or ce n'est pas la photo qu'on perdrait : **c'est le dossier**. L'écriture est
atomique — au-dessus du quota, elle échoue en entier, et la facture qu'on venait
de saisir ne s'enregistre pas. Mettre des photos dans le localStorage, c'est
troquer une comptabilité contre un album.

Les images vivent donc dans **IndexedDB** : magasin séparé, quota en centaines
de mégaoctets, et des `Blob` binaires — pas d'inflation de 33 %. Le dossier ne
garde que les **étiquettes** : identifiant, légende, phase, date, poids.
Quelques dizaines d'octets par photo.

Trois conséquences, toutes assumées :

- **l'export JSON habituel ne contient pas les images.** L'écran d'export
  propose les deux formats dès qu'il y a des photos, et dit lequel protège
  quoi. Un export léger qu'on fait chaque semaine vaut mieux qu'un export
  complet qu'on renonce à lancer ;
- **une étiquette peut survivre à son image** — dossier importé sans les
  photos, stockage vidé par le navigateur. La galerie l'affiche alors comme
  « image absente de cet appareil », au lieu d'un carré gris ;
- **on demande la persistance** (`navigator.storage.persist()`) à la première
  photo, pas au démarrage : sans elle, le navigateur peut supprimer les images
  tout seul pour faire de la place. Une permission demandée avant d'avoir rien
  montré se refuse par réflexe.

La compression est faite au passage : 1600 px et JPEG, soit environ 250 Ko au
lieu de 3 Mo. Le passage par un canvas **supprime aussi les données EXIF, donc
le GPS** — une photo prise chez un client n'a pas à se promener avec l'adresse
de son domicile. Et `imageOrientation: "from-image"` évite le défaut classique
des galeries faites à la main : les photos en portrait couchées sur le côté.

### 10. Aucune image binaire dans le dépôt

La marque est un SVG de quinze lignes, qui sert d'icône partout où le navigateur
l'accepte. Deux endroits ne l'acceptent pas — l'écran d'accueil d'un iPhone et
l'écran de lancement Android — et `tools/icones.html` fabrique les PNG à la
demande. Tant qu'ils ne sont pas déposés, l'application s'installe quand même.

### 11. Renommer l'application ne doit effacer le dossier de personne

L'application s'est d'abord appelée « Clé de 12 », et ses clés de `localStorage`
portaient ce nom. Les renommer en `hydropro.*` sans précaution n'aurait rien
supprimé — le dossier serait resté dans le navigateur, intact — mais **plus
personne ne serait allé le chercher**, ce qui revient au même pour l'artisan qui
retrouve une application vide.

`CONFIG.storageAncien` garde donc les anciennes clés, et `charger()` comme
`lirePrefs()` les relisent une seule fois : la valeur est recopiée sous la
nouvelle clé, l'ancienne est effacée. Ces quelques lignes pourront disparaître le
jour où plus personne ne peut avoir ouvert l'ancienne version.

La même prudence vaut pour `VERSION` dans `sw.js` : la changer invalide les
anciens caches, ce qui est ici **voulu** — sans cela, un téléphone qui avait
installé l'application aurait continué à servir l'ancienne coquille.

### 12. Les informations réglementaires sont datées et sourcées

`data/tva.json` et `data/checklist.json` portent un champ `verifieLe` et des
liens vers les textes officiels. Ce sont des **aide-mémoire**, affichés comme
tels dans l'application, avec l'avertissement qu'ils changent à chaque loi de
finances. Le code ne décide jamais d'un taux à la place de l'artisan : il propose
un défaut, explique les conditions, et laisse le choix sur chaque ligne.

---

## Le cache hors ligne

`sw.js` emploie deux stratégies, et la distinction porte sur ce qui casse quand
on se trompe :

- la **coquille** (HTML, CSS, JS) est servie depuis le cache puis rafraîchie en
  arrière-plan — priorité au démarrage instantané ;
- les **données de référence** (`data/`) sont demandées au réseau d'abord, le
  cache ne servant que de repli. Un taux de TVA périmé servi silencieusement
  produirait une facture fausse.

Deux pièges, tous deux **silencieux** — le site continue de marcher en ligne, et
rien ne signale que le mode hors ligne ne s'est jamais installé.

`cache.addAll()` est **atomique** : un seul fichier manquant dans la liste
`COQUE` fait échouer toute l'installation.

Et l'inscription elle-même doit tester `document.readyState`. `demarrer()` est
asynchrone : il attend les données de référence. Sur un vrai réseau,
l'évènement `load` est donc **déjà passé** quand `brancherHorsLigne()` s'exécute,
et un écouteur posé à ce moment-là ne se déclenche jamais. En local, où les
fichiers arrivent en une milliseconde, `load` arrivait après et le bug restait
invisible : il n'est apparu qu'à la première mise en ligne. `tools/verification.html` compare cette liste
au contenu réel du dossier et aux `modulepreload` de `index.html` — c'est le
contrôle le plus utile de la page.

**En développement**, pensez-y : le service worker sert la version en cache. Si
une modification ne s'affiche pas, désinscrivez-le (outils de développement,
onglet Application) ou passez `CONFIG.offline` à `false` — ce qui désinscrit
aussi celui qui serait déjà en place.

---

## Où ajouter quoi

| Ce qu'on veut ajouter | Où |
| --- | --- |
| Un type de rendez-vous, un état, une unité | `data/reference.json` |
| Une mention légale imprimée | `data/mentions.json`, bloc `blocs` |
| Un modèle de relance | `data/mentions.json`, bloc `relances` |
| Une prestation ou une fourniture | dans l'application, onglet Catalogue |
| Une couleur | `assets/css/theme.css`, et nulle part ailleurs |
| Un contrôle de formulaire | `assets/js/ui/champs.js` |
| Un pictogramme | `assets/js/ui/icones.js`, table `D` |
| Un calcul | `assets/js/domain/`, jamais dans une vue |
| Un onglet | `ui/sidebar.js` (`ONGLETS`), `main.js` (`VUES`), et un module `ui/` |
| Un fichier, quel qu'il soit | + `sw.js` (`COQUE`), + `index.html` si c'est un module |
