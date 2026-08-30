# Hydropro

**La gestion d'une entreprise de plomberie-chauffage, dans un navigateur.**

Agenda, fichier clients, appareils installés, devis, factures, bons
d'intervention, contrats d'entretien et chiffres — sans compte, sans serveur,
sans abonnement, et sans réseau une fois la page ouverte.

**→ [funkyll7.github.io/hydropro](https://funkyll7.github.io/hydropro/)**

Ouvrez cette adresse sur votre téléphone, puis « Ajouter à l'écran d'accueil » :
l'application s'installe et fonctionne ensuite hors ligne. Le site est public,
**vos données ne le sont pas** — elles restent dans le navigateur de votre
appareil et ne sont envoyées nulle part.

---

## Ce que ça fait

**Aujourd'hui** — les rendez-vous du jour, ce qui est facturé et encaissé ce
mois-ci, et la liste de ce qui coûte de l'argent si on l'oublie : factures en
retard, devis sans réponse, entretiens à programmer, interventions non facturées.

**Agenda** — le mois, la semaine, la journée. Jours fériés calculés (y compris
Pâques et ses quatre dérivés), chevauchements signalés, recherche du prochain
créneau libre. Chaque rendez-vous porte son client, son adresse, son appareil.

**Clients** — coordonnées, accès (digicode, étage, où se garer), notes, et
surtout **les appareils** : marque, modèle, numéro de série, date de pose,
dernier entretien. Plus l'historique complet : rendez-vous, interventions,
devis, factures, ce qui a été payé et avec quel retard.

**Chantiers et photos** — un client n'est pas une adresse : un syndic a trente
immeubles, un bailleur autant de logements, un particulier finit par avoir la
salle de bain *et* la chaufferie. Chaque client porte donc autant de chantiers
qu'il en a, et c'est le chantier qui rassemble les photos, les devis, les
factures, les rendez-vous et le code de la porte.

Les photos se prennent **avec l'appareil photo du téléphone**, depuis la fiche
du chantier, et se rangent en trois temps :

- **avant** — l'état trouvé en arrivant. C'est la photo qui protège d'un
  « c'était déjà comme ça » trois semaines plus tard ;
- **pendant** — ce que plus personne ne reverra une fois le mur refermé :
  passages de tuyaux, saignées, raccords encastrés ;
- **après** — le travail fini, à montrer au client et à garder pour la garantie.

Chaque photo prend une légende. Elles sont réduites et recompressées à
l'enregistrement (environ 250 Ko au lieu de 3 Mo), ce qui **efface au passage
les données GPS** : une photo prise chez un client ne se promène pas avec
l'adresse de son domicile.

**Devis et factures** — éditeur de lignes avec catalogue, TVA multi-taux, remise
par ligne et remise globale, acompte, sections et commentaires. Mentions légales
remplies automatiquement depuis la fiche entreprise. Aperçu conforme au papier,
impression et PDF par le navigateur. Devis accepté → facture, facture d'acompte,
facture de solde, avoir.

**Bons d'intervention** — à remplir sur place : heure d'arrivée et de départ
pointées d'un bouton, motif, diagnostic, travaux, pièces posées. Mémos de
terrain (entretien gaz, PAC, recherche de fuite…). Devient une facture en un clic.

**Contrats d'entretien** — échéances de visite calculées depuis le dernier
passage, liste de qui appeler maintenant, et la liste des appareils qui
*devraient* être sous contrat et ne le sont pas.

**Catalogue** — prestations et fournitures, avec prix d'achat et marge (qui ne
sortent jamais de cet écran), hausse de prix en un geste, et un calcul du taux
horaire minimum qui couvre vos charges.

**Chiffres** — facturé contre encaissé sur douze mois, encours par ancienneté
(c'est à 90 jours que le recouvrement s'effondre), taux de signature des devis,
part main d'œuvre / fournitures, TVA collectée, meilleurs clients.

---

## Ce que ça ne fait pas

- **Ce n'est pas une comptabilité.** Il n'y a pas de factures fournisseur, pas
  de charges, pas d'amortissements. La TVA affichée est *collectée*, pas
  *déclarable* : il manque la TVA déductible sur vos achats.
- **Ce n'est pas un conseil juridique ou fiscal.** Les taux de TVA, les mentions
  obligatoires et les obligations réglementaires sont des aide-mémoire, datés et
  sourcés dans `data/`. Ils changent à chaque loi de finances : vérifiez auprès
  de votre comptable avant un chantier important.
- **Ce n'est pas une plateforme de facturation électronique.** La réforme rendra
  obligatoire le passage par une plateforme agréée ; cette application produit
  des PDF classiques. Voir la liste des obligations dans l'écran Réglages.
- **Il n'y a aucune synchronisation.** Deux appareils, deux dossiers. On passe
  de l'un à l'autre par l'export et l'import.

---

## Vos données

**Rien ne sort de votre navigateur.** Pas de compte, pas de serveur, pas la
moindre requête réseau après le chargement. Le dossier vit dans le
`localStorage` et n'en sort que par un export volontaire, dans un fichier que
vous rangez où vous voulez.

C'est ce qui rend l'application gratuite, instantanée, et utilisable dans une
chaufferie sans réseau. **C'est aussi ce qui la rend fragile :**

> Effacer les données de navigation efface le dossier. Le mode privé n'enregistre
> rien. Changer de téléphone laisse tout derrière.

Alors **exportez régulièrement** — le bouton est en permanence dans la barre de
gauche — et rangez le fichier ailleurs : clé USB, disque externe, espace de
stockage en ligne. Passé quatorze jours sans export, l'application vous le
rappelle. Le fichier obtenu est du JSON lisible : vous pourrez le relire dans
dix ans, même sans cette application.

### Les photos sont rangées à part

Elles ne tiendraient pas dans la même mémoire que le reste : une seule photo
suffirait à la remplir, et c'est alors **le dossier entier** qui ne s'écrirait
plus — la facture saisie juste après serait perdue. Les images vivent donc dans
un second magasin du navigateur, plus grand.

Conséquence directe : dès qu'il y a des photos, l'export vous demande lequel des
deux vous voulez.

- **Sans les photos** — quelques dizaines de kilo-octets. Tout ce qui se
  facture. C'est celui à faire chaque semaine.
- **Avec les photos** — plusieurs mégaoctets. Le seul qui les protège aussi.
  À faire de temps en temps, quand un chantier important est fini.

Si vous restaurez un export léger sur un autre appareil, les photos y
apparaîtront comme « image absente de cet appareil » : leurs légendes sont là,
les images non.

---

## Installation

### L'ouvrir

Le site est **entièrement statique**. Mais un double-clic sur `index.html` ne
suffit pas : les navigateurs refusent de lire les fichiers voisins depuis
`file://`, et les données de référence ne se chargeraient pas. Il faut un petit
serveur local. Python fait l'affaire :

```bash
python -m http.server 4175
```

Puis ouvrir <http://localhost:4175>.

Sous Windows sans Python installé, celui livré avec LibreOffice fonctionne :

```bash
"C:/Program Files (x86)/LibreOffice/program/python.exe" -m http.server 4175
```

### L'installer sur le téléphone

Une fois la page ouverte, le navigateur propose « Installer l'application » ou
« Ajouter à l'écran d'accueil ». Elle s'ouvre alors en plein écran, sans barre
d'adresse, et **fonctionne hors ligne**.

Sur iPhone, l'icône de l'écran d'accueil réclame un PNG que le dépôt ne contient
pas (il n'y a aucune image binaire ici). Ouvrez `tools/icones.html`, téléchargez
`icon-180.png` dans `assets/img/`, puis décommentez la ligne `apple-touch-icon`
de `index.html`.

### La mettre en ligne

Le dossier tel quel se publie sur n'importe quel hébergement statique — GitHub
Pages, Netlify, un simple dossier chez un hébergeur. Le fichier `.nojekyll` est
là pour GitHub Pages, qui sans lui ignore certains dossiers.

**Attention si vous publiez sur un dépôt public** : le site ne contient aucune
donnée (elles sont dans le navigateur de chacun), mais vérifiez que vous n'y
avez pas laissé un export.

---

## Les premiers pas

1. **Réglages** — nom, adresse, SIRET, TVA, et surtout **l'assurance décennale**
   (assureur et numéro de contrat) et le **médiateur de la consommation** : ce
   sont des mentions obligatoires sur tout devis et toute facture de travaux.
   L'écran liste ce qui manque tant que ce n'est pas complet.
2. **Numérotation** — si vous reprenez une numérotation commencée ailleurs
   (carnet à souche, tableur, ancien logiciel), réglez le compteur de l'année.
3. **Catalogue** — soixante-quatre articles de départ sont fournis, avec des
   prix indicatifs. **Remplacez-les par les vôtres** : ils dépendent de votre
   région, de vos fournisseurs et de votre marge. Le calcul du taux horaire
   minimum, en bas de l'écran, est un bon point de départ.
4. **Un client**, puis **un devis**. Le bouton *Aperçu* montre exactement ce qui
   sortira de l'imprimante.

---

## Imprimer et envoyer

Le bouton **Imprimer** ouvre la boîte d'impression du navigateur. Deux réglages
à poser une fois :

- **marges : aucune** — elles sont dans la feuille, en millimètres ;
- **graphiques d'arrière-plan : activés** — sans quoi les en-têtes de tableau
  sortent blancs sur blanc.

Pour envoyer par courriel, choisissez **« Enregistrer au format PDF »** comme
destination : le PDF obtenu contient du vrai texte, sélectionnable et cherchable.

Les relances (devis sans réponse, facture impayée, mise en demeure) préparent le
texte et l'ouvrent dans votre logiciel de messagerie. **Rien n'est jamais envoyé
sans vous** : vous relisez, vous cliquez.

---

## Raccourcis clavier

| Touche | Effet |
| --- | --- |
| `1` … `9` | changer d'onglet |
| `N` | nouveau (rendez-vous, client, devis… selon l'écran) |
| `/` | aller au champ de recherche |
| `Échap` | fermer le tiroir ou la fenêtre |

---

## Sur téléphone

Ce n'est pas un site de bureau rétréci : la mise en page change de forme.

- **une barre du bas** à cinq entrées, sous le pouce, plutôt qu'un menu à ouvrir ;
- **l'en-tête garde le titre** — les boutons qui portent un pictogramme perdent
  leur libellé, et les actions secondaires (« Refusé », « Imprimer ») quittent la
  barre puisqu'elles ont un autre chemin dans la page ;
- **l'éditeur de lignes devient une pile de cartes** : un tableau à huit colonnes
  ne se remplit pas au doigt ;
- **le mois n'affiche que des points de couleur** — six caractères tronqués ne
  renseignent personne, un point dit « il y a quelque chose ce jour-là » ;
- **les fenêtres s'ouvrent en plein écran**, et les cibles font 44 px ;
- **la feuille du devis se réempile** pour se lire à l'écran, sans changer d'un
  millimètre ce qui sort de l'imprimante.

Vérifié sans débordement horizontal de 320 à 375 px, sur les quinze écrans.

## Clair et sombre

Un bouton dans l'en-tête, sur toutes les pages, bascule clair ↔ sombre en un
appui — on en a besoin au moment où l'écran devient illisible, c'est-à-dire au
pire moment pour aller le chercher dans un menu. Il se souvient de la palette
sombre que vous préférez.

Le tiroir de gauche donne les **sept palettes** : Clair, Papier, Contraste clair,
Sombre, Nuit (presque noir, pour les écrans OLED), Ardoise, Contraste sombre.
Les deux « contraste » doublent les traits et poussent tout à 7:1, pour lire en
plein soleil sur un chantier. Par défaut, l'application **suit le réglage du
téléphone** et passe au sombre en même temps que lui.

Quatre tailles de texte agrandissent titres, notes et montants ensemble, sans
casser la mise en page.

---

## Vérifier après une modification

Ouvrir <http://localhost:4175/tools/verification.html>. La page exécute plus d'une
centaine de contrôles : lecture des nombres à la française, dates et jours
fériés, calcul complet d'un devis multi-taux, numérotation, chevauchements de
rendez-vous, compatibilité des anciens exports — et surtout la **liste du cache
hors ligne**, qui est atomique : un fichier oublié dans `sw.js` fait échouer
toute l'installation du mode hors ligne, en silence.

---

## Sous le capot

Modules ES natifs, CSS écrit à la main, données en JSON. Aucune dépendance,
aucun build, aucun outil à installer. Le détail des choix — pourquoi les
factures ne sont numérotées qu'à la validation, pourquoi les dates ne passent
jamais par UTC, pourquoi il n'y a pas de générateur de PDF — est dans
[PROJET.md](PROJET.md).
