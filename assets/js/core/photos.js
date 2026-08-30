/**
 * photos.js — le magasin des photos de chantier.
 *
 * POURQUOI PAS LE localStorage, COMME TOUT LE RESTE.
 *
 * Le dossier entier — clients, devis, factures — est écrit d'un seul bloc dans
 * `localStorage`, dont le quota tourne autour de 5 Mo pour un site. Une photo
 * de téléphone pèse 3 Mo, et le localStorage n'accepte que du texte : en base64
 * elle en pèserait 4. Deux photos, et l'écriture du dossier échoue.
 *
 * Or ce n'est pas la photo qu'on perdrait : c'est LE DOSSIER. `enregistrer()`
 * réécrit tout d'un coup ; si l'écriture passe au-dessus du quota, elle échoue
 * en entier, et la facture qu'on venait de saisir ne s'enregistre pas. Mettre
 * des photos dans le localStorage, c'est donc troquer une comptabilité contre
 * un album.
 *
 * Les photos vivent donc dans IndexedDB : un magasin séparé, qui accepte des
 * Blob binaires (pas d'inflation de 33 % due au base64) et dont le quota se
 * compte en centaines de mégaoctets. Le dossier, lui, ne garde que les
 * ÉTIQUETTES — identifiant, légende, date, phase — quelques dizaines d'octets
 * par photo. Il reste léger, et il reste écrivable.
 *
 * CONSÉQUENCE À ASSUMER : l'export JSON du dossier ne contient pas les images.
 * `domain/dossier.js` sait les y remettre à la demande (export « avec les
 * photos »), et l'écran des réglages dit lequel des deux exports on prend.
 */

const BASE = "hydropro-photos";
const MAGASIN = "photos";
const VERSION = 1;

let promesseBase = null;

/**
 * Ouvre la base, une fois pour toutes.
 *
 * Rend `null` si IndexedDB est refusé — navigation privée sur certains
 * navigateurs, stockage désactivé. TOUT le module tolère ce `null` : sans
 * magasin, l'application marche, elle ne sait simplement pas garder de photos,
 * et l'interface le dit au lieu de planter.
 */
function ouvrir() {
  if (promesseBase) return promesseBase;

  promesseBase = new Promise((resoudre) => {
    if (!("indexedDB" in window)) return resoudre(null);
    let requete;
    try {
      requete = indexedDB.open(BASE, VERSION);
    } catch {
      return resoudre(null);
    }
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN);
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => resoudre(null);
    requete.onblocked = () => resoudre(null);
  });

  return promesseBase;
}

/** Exécute une transaction et rend son résultat. `null` si le magasin manque. */
async function transaction(mode, action) {
  const db = await ouvrir();
  if (!db) return null;
  return new Promise((resoudre) => {
    let sortie = null;
    let tx;
    try {
      tx = db.transaction(MAGASIN, mode);
    } catch {
      return resoudre(null);
    }
    const magasin = tx.objectStore(MAGASIN);
    try {
      sortie = action(magasin);
    } catch {
      return resoudre(null);
    }
    tx.oncomplete = () => resoudre(sortie && sortie.result !== undefined ? sortie.result : sortie);
    tx.onerror = () => resoudre(null);
    tx.onabort = () => resoudre(null);
  });
}

/**
 * Range une photo : l'image et sa vignette, sous le même identifiant.
 *
 * Rend `true` si c'est écrit. Un `false` doit être MONTRÉ : une photo qu'on
 * croit avoir prise et qui n'existe pas est pire que pas de photo du tout.
 */
export async function ranger(id, { plein, vignette }) {
  const ok = await transaction("readwrite", (m) => m.put({ plein, vignette }, id));
  return ok !== null;
}

/** L'entrée complète d'une photo, ou `null`. */
export async function lire(id) {
  return transaction("readonly", (m) => m.get(id));
}

export async function supprimer(id) {
  oublierUrl(id);
  return transaction("readwrite", (m) => m.delete(id));
}

/** Supprime plusieurs photos — à la suppression d'un chantier ou d'un client. */
export async function supprimerLot(ids) {
  for (const id of ids) await supprimer(id);
}

/** Tous les identifiants présents dans le magasin. Sert au ménage. */
export async function tousLesIds() {
  const cles = await transaction("readonly", (m) => m.getAllKeys());
  return Array.isArray(cles) ? cles : [];
}

/* ===========================================================================
   LES ADRESSES D'AFFICHAGE

   Un Blob ne s'affiche pas directement : il lui faut une URL d'objet. En
   fabriquer une à chaque rendu fuirait — l'application se re-rend à chaque
   frappe — et les révoquer trop tôt ferait disparaître les images sous les
   yeux. Elles sont donc fabriquées une fois et mémorisées ici, pour la durée
   de la session. Le navigateur les libère en fermant l'onglet.
   ======================================================================== */

const urls = new Map();

/** L'URL affichable d'une photo. `taille` vaut "vignette" ou "plein". */
export async function url(id, taille = "vignette") {
  const cle = `${id}:${taille}`;
  if (urls.has(cle)) return urls.get(cle);

  const entree = await lire(id);
  const blob = entree && (taille === "plein" ? entree.plein : entree.vignette || entree.plein);
  if (!blob) return null;

  const adresse = URL.createObjectURL(blob);
  urls.set(cle, adresse);
  return adresse;
}

function oublierUrl(id) {
  for (const taille of ["vignette", "plein"]) {
    const cle = `${id}:${taille}`;
    if (urls.has(cle)) {
      URL.revokeObjectURL(urls.get(cle));
      urls.delete(cle);
    }
  }
}

/* ===========================================================================
   LA PLACE DISPONIBLE
   ======================================================================== */

/**
 * Ce que le navigateur accorde et ce qui est déjà pris, en octets.
 *
 * `estimate()` compte TOUT le stockage du site, pas seulement les photos —
 * c'est justement ce qu'on veut savoir avant d'en ajouter une.
 */
export async function place() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { utilise: usage || 0, quota: quota || 0, part: quota ? usage / quota : 0 };
  } catch {
    return null;
  }
}

/**
 * Demande au navigateur de ne PAS effacer ce stockage quand la place manque.
 *
 * Sans cela, les photos font partie du stockage « au mieux » : le navigateur
 * peut les supprimer tout seul pour faire de la place, sans prévenir. Chrome
 * accorde la permission silencieusement à un site installé ou visité souvent ;
 * Firefox pose la question. On ne la demande qu'à la PREMIÈRE photo, parce
 * qu'une demande de permission au premier lancement, avant même d'avoir montré
 * quoi que ce soit, se refuse par réflexe.
 */
export async function demanderPersistance() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/* ===========================================================================
   PRÉPARATION D'UNE PRISE DE VUE
   ======================================================================== */

/** La photo pleine : assez grande pour zoomer sur un raccord, pas plus. */
const COTE_PLEIN = 1600;
/** La vignette : ce qu'on voit dans la grille, une trentaine de kilo-octets. */
const COTE_VIGNETTE = 320;

/**
 * Réduit et recomprime une photo sortie de l'appareil.
 *
 * Une photo de téléphone fait 4000 px et 3 Mo ; à 1600 px et en JPEG, elle en
 * fait 250 Ko, et on y voit toujours le numéro de série d'une chaudière. Sur
 * un chantier de vingt photos, c'est 60 Mo évités.
 *
 * DEUX EFFETS DE BORD, tous deux souhaitables :
 *   - le passage par un canvas SUPPRIME les données EXIF, donc les
 *     coordonnées GPS. Une photo prise chez un client ne doit pas se promener
 *     avec l'adresse de son domicile ;
 *   - `imageOrientation: "from-image"` applique la rotation EXIF avant de
 *     dessiner. Sans cela, les photos prises en portrait ressortent couchées,
 *     ce qui est le défaut le plus courant des galeries faites à la main.
 */
export async function preparer(fichier) {
  const source = await decoder(fichier);
  const largeur = source.width || source.naturalWidth;
  const hauteur = source.height || source.naturalHeight;

  // La vignette est tiree du canvas DEJA REDUIT, pas de l'original : lire
  // 1600 px coute moins que relire les 3000 px de depart, et l'image source
  // peut etre liberee tout de suite.
  //
  // L'essentiel du temps part malgre tout dans les DEUX encodages JPEG, et il
  // n'y a pas moyen d'y couper : c'est le prix d'une photo qui pese 250 Ko au
  // lieu de 3 Mo. D'ou le message d'attente cote interface — sans lui, on
  // appuie une deuxieme fois sur le bouton.
  const canvasPlein = redimensionner(source, COTE_PLEIN);
  if (source.close) source.close();

  const plein = await versJpeg(canvasPlein, 0.75);
  const vignette = await versJpeg(redimensionner(canvasPlein, COTE_VIGNETTE), 0.7);

  return { plein, vignette, octets: plein.size, largeur, hauteur };
}

async function decoder(fichier) {
  try {
    return await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    // Repli pour les navigateurs qui refusent les options de `createImageBitmap`.
    // Les <img> appliquent l'orientation EXIF d'eux-mêmes depuis 2020.
    return new Promise((resoudre, rejeter) => {
      const adresse = URL.createObjectURL(fichier);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(adresse);
        resoudre(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(adresse);
        rejeter(new Error("image illisible"));
      };
      img.src = adresse;
    });
  }
}

/** Dessine la source dans un canvas dont le plus grand cote vaut `coteMax`. */
function redimensionner(source, coteMax) {
  const largeur = source.width || source.naturalWidth;
  const hauteur = source.height || source.naturalHeight;
  const ratio = Math.min(1, coteMax / Math.max(largeur, hauteur));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(largeur * ratio));
  canvas.height = Math.max(1, Math.round(hauteur * ratio));

  const ctx = canvas.getContext("2d");
  // Un fond blanc : un PNG transparent recomprimé en JPEG donnerait du noir.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function versJpeg(canvas, qualite) {
  return new Promise((resoudre) => {
    canvas.toBlob((blob) => resoudre(blob), "image/jpeg", qualite);
  });
}

/* ===========================================================================
   EXPORT ET IMPORT

   Les photos ne sont pas dans le JSON du dossier. Pour l'export « complet »,
   on les relit et on les encode ; à l'import, on fait le chemin inverse.
   ======================================================================== */

/** Les photos demandées, en data URI, prêtes à être écrites dans un export. */
export async function pourExport(ids) {
  const sortie = {};
  for (const id of ids) {
    const entree = await lire(id);
    if (!entree?.plein) continue;
    sortie[id] = await blobVersDataUri(entree.plein);
  }
  return sortie;
}

/** Remet dans le magasin les photos trouvées dans un fichier importé. */
export async function depuisExport(paquet) {
  let comptees = 0;
  for (const [id, dataUri] of Object.entries(paquet || {})) {
    try {
      const plein = await dataUriVersBlob(dataUri);
      const source = await decoder(plein);
      const vignette = await versJpeg(redimensionner(source, COTE_VIGNETTE), 0.7);
      if (source.close) source.close();
      if (await ranger(id, { plein, vignette })) comptees += 1;
    } catch {
      /* une photo illisible ne doit pas faire échouer tout l'import */
    }
  }
  return comptees;
}

function blobVersDataUri(blob) {
  return new Promise((resoudre) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(lecteur.result);
    lecteur.onerror = () => resoudre(null);
    lecteur.readAsDataURL(blob);
  });
}

async function dataUriVersBlob(dataUri) {
  return (await fetch(dataUri)).blob();
}
