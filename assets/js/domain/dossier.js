/**
 * dossier.js — le schema du dossier, sa persistance, son import et son export.
 *
 * LE DOSSIER EST LA SEULE SOURCE DE VERITE. Tout ce qui se facture, se
 * planifie ou se retrouve dans un an vit ici, dans un unique objet JSON ecrit
 * dans le localStorage de ce navigateur. Rien n'est envoye nulle part : il n'y
 * a pas de serveur, pas de compte, pas de mot de passe a perdre.
 *
 * La contrepartie est claire et doit l'etre pour l'utilisateur : effacer les
 * donnees du site efface le dossier. D'ou l'export, le rappel de sauvegarde,
 * et le fait que l'import accepte n'importe quel export, meme ancien.
 *
 * FORME DU DOSSIER
 * ----------------
 *   entreprise   la fiche de l'artisan : identite, assurances, taux, mentions
 *   clients[]    avec leurs equipements ET leurs chantiers imbriques : une
 *                chaudiere comme un chantier appartiennent a un client, et
 *                n'existent pas sans lui. Un client peut avoir plusieurs
 *                chantiers — c'est le cas normal d'un syndic ou d'un bailleur.
 *                Les photos d'un chantier ne sont ici que sous forme
 *                d'ETIQUETTES : les images vivent dans IndexedDB, voir
 *                core/photos.js.
 *   rdv[]        les rendez-vous de l'agenda
 *   interventions[]  les bons d'intervention, relies a un rendez-vous
 *   documents[]  devis, factures et avoirs, dans une seule liste
 *   contrats[]   les contrats d'entretien
 *   catalogue[]  prestations et fournitures
 *   compteurs    la numerotation, par annee
 *   meta         dates de creation, de derniere modification, de dernier export
 *
 * Les listes sont PLATES et reliees par identifiant. Un devis ne contient pas
 * une copie du client : il porte son `clientId`. Sans quoi corriger un numero
 * de telephone obligerait a le corriger dans chaque document.
 */

import { CONFIG } from "../config.js";
import { id } from "../core/store.js";
import { aujourdhui, isoInstant } from "../core/format.js";
import { pourExport } from "../core/photos.js";

/** La version du schema. Toute migration part de la version lue dans le fichier. */
export const VERSION = 1;

const CLE = CONFIG.storage.dossier;

/* ===========================================================================
   LA FICHE ENTREPRISE

   Tout ce qui doit figurer sur un devis ou une facture, plus les valeurs par
   defaut de l'application. Les champs vides ne sont pas une erreur : on peut
   travailler des le premier lancement, l'application signale seulement ce qui
   manquera a l'impression.
   ======================================================================== */
export function entrepriseVide() {
  return {
    nom: "",
    forme: "",
    responsable: "",
    adresse: "",
    cp: "",
    ville: "",
    tel: "",
    email: "",
    web: "",

    siret: "",
    ape: "",
    rcs: "",
    tvaIntra: "",
    /** false = franchise en base : aucune TVA n'est facturee ni affichee. */
    assujettiTva: true,
    capital: "",

    assureur: "",
    contratAssurance: "",
    couvertureAssurance: "France métropolitaine",
    qualifications: "",

    iban: "",
    bic: "",
    banque: "",

    mediateur: "",
    mediateurUrl: "",

    /** Le logo, en data URI. Reste dans le dossier, donc dans l'export. */
    logo: "",

    tauxHoraire: 55,
    validiteDevis: CONFIG.validiteDevisJours,
    delaiPaiement: CONFIG.delaiPaiementJours,
    /** Taux annuel des penalites de retard, en pourcentage. */
    penalites: 12,
    acompteDefaut: 30,
    tvaDefaut: 10,
    conditions: "",
    piedDePage: "",
  };
}

/** Un dossier vierge, tel qu'il existe au tout premier lancement. */
export function dossierVide() {
  return {
    version: VERSION,
    entreprise: entrepriseVide(),
    clients: [],
    rdv: [],
    interventions: [],
    documents: [],
    contrats: [],
    catalogue: [],
    compteurs: { devis: {}, facture: {}, avoir: {}, intervention: {} },
    meta: {
      creeLe: aujourdhui(),
      majLe: isoInstant(),
      dernierExport: null,
      catalogueCharge: false,
    },
  };
}

/* ===========================================================================
   FABRIQUES

   Chaque objet du dossier nait ici, jamais dans une vue. Une vue qui fabrique
   son propre objet finit toujours par oublier un champ, et le bug apparait
   trois ecrans plus loin, a la lecture.
   ======================================================================== */

export function clientVide(patch = {}) {
  return {
    id: id("cli"),
    type: "particulier",
    civilite: "",
    nom: "",
    prenom: "",
    societe: "",
    siret: "",
    tel: "",
    tel2: "",
    email: "",
    adresse: "",
    complement: "",
    cp: "",
    ville: "",
    acces: "",
    notes: "",
    tags: [],
    equipements: [],
    chantiers: [],
    archive: false,
    creeLe: aujourdhui(),
    ...patch,
  };
}

/**
 * Un chantier : un LIEU de travail, pas un client.
 *
 * La distinction n'est pas theorique. Un syndic a trente adresses, un
 * proprietaire a sa maison et l'appartement qu'il loue, un client fait refaire
 * sa salle de bain deux ans apres sa chaufferie. Tant que l'adresse n'etait
 * qu'un texte libre recopie sur chaque devis, l'historique se dispersait : on
 * ne pouvait pas repondre a « qu'est-ce qu'on a deja fait ICI ? ».
 *
 * Le chantier appartient au client, comme l'equipement : il n'existe pas sans
 * lui, et il est donc imbrique plutot que range dans une liste a part.
 *
 * `photos` ne contient QUE des etiquettes. Les images elles-memes vivent dans
 * IndexedDB — voir core/photos.js pour la raison, qui tient en une phrase :
 * une photo dans le localStorage rendrait le dossier inecrivable.
 */
export function chantierVide(patch = {}) {
  return {
    id: id("cha"),
    nom: "",
    adresse: "",
    complement: "",
    cp: "",
    ville: "",
    acces: "",
    notes: "",
    debut: "",
    fin: "",
    statut: "en-cours",
    photos: [],
    creeLe: aujourdhui(),
    ...patch,
  };
}

/**
 * L'etiquette d'une photo. L'image, elle, est dans IndexedDB sous ce meme `id`.
 *
 * `phase` vaut « avant », « pendant » ou « apres » : c'est ce qui transforme un
 * tas d'images en preuve utilisable devant une assurance ou un client qui
 * conteste.
 */
export function photoVide(patch = {}) {
  return {
    id: id("pho"),
    legende: "",
    phase: "pendant",
    prise: isoInstant(),
    octets: 0,
    ...patch,
  };
}

export function equipementVide(patch = {}) {
  return {
    id: id("eq"),
    categorie: "chaudiere",
    marque: "",
    modele: "",
    numeroSerie: "",
    energie: "gaz",
    puissance: "",
    installeLe: "",
    garantieJusquau: "",
    emplacement: "",
    dernierEntretien: "",
    notes: "",
    ...patch,
  };
}

export function rdvVide(patch = {}) {
  return {
    id: id("rdv"),
    clientId: "",
    chantierId: "",
    type: "depannage",
    titre: "",
    debut: "",
    fin: "",
    adresse: "",
    note: "",
    statut: "prevu",
    urgent: false,
    equipementId: "",
    contratId: "",
    documentId: "",
    ...patch,
  };
}

export function interventionVide(patch = {}) {
  return {
    id: id("int"),
    numero: "",
    rdvId: "",
    clientId: "",
    chantierId: "",
    equipementId: "",
    date: aujourdhui(),
    arrivee: "",
    depart: "",
    motif: "",
    diagnostic: "",
    travaux: "",
    lignes: [],
    aFacturer: true,
    documentId: "",
    signature: "",
    ...patch,
  };
}

export function ligneVide(patch = {}) {
  return {
    id: id("lg"),
    type: "presta",
    ref: "",
    designation: "",
    detail: "",
    quantite: 1,
    unite: "u",
    pu: 0,
    tva: 10,
    remise: 0,
    ...patch,
  };
}

export function documentVide(kind, patch = {}) {
  return {
    id: id(kind === "devis" ? "dev" : "fac"),
    kind,
    numero: "",
    clientId: "",
    chantierId: "",
    date: aujourdhui(),
    /** Devis : date de fin de validite. Facture : date d'echeance. */
    echeance: "",
    objet: "",
    chantier: "",
    lignes: [],
    remiseGlobale: { type: "pourcent", valeur: 0 },
    acompte: { type: "pourcent", valeur: 0 },
    statut: "brouillon",
    paiements: [],
    devisSource: "",
    factureSource: "",
    interventionId: "",
    motifRefus: "",
    notes: "",
    conditions: "",
    envoyeLe: "",
    relanceLe: "",
    accepteLe: "",
    ...patch,
  };
}

export function contratVide(patch = {}) {
  return {
    id: id("ctr"),
    clientId: "",
    equipementId: "",
    intitule: "Contrat d'entretien annuel",
    montant: 0,
    tva: 10,
    frequenceMois: 12,
    debut: aujourdhui(),
    dernierPassage: "",
    prochainPassage: "",
    reconduction: true,
    actif: true,
    notes: "",
    ...patch,
  };
}

export function articleVide(patch = {}) {
  return {
    id: id("art"),
    kind: "presta",
    ref: "",
    categorie: "Divers",
    designation: "",
    detail: "",
    unite: "u",
    pu: 0,
    achat: 0,
    tva: 10,
    favori: false,
    ...patch,
  };
}

/* ===========================================================================
   PERSISTANCE
   ======================================================================== */

/**
 * Lit le dossier du localStorage.
 *
 * Ne leve JAMAIS : un dossier illisible rend un dossier vierge plutot qu'un
 * ecran blanc. Le cas se produit surtout apres un import rate ou un quota
 * plein en cours d'ecriture.
 */
export function charger() {
  try {
    const brut = localStorage.getItem(CLE) || reprendreAncienneCle();
    if (!brut) return dossierVide();
    return normaliser(JSON.parse(brut));
  } catch (e) {
    console.warn("Dossier illisible, repart d'un dossier vierge.", e);
    return dossierVide();
  }
}

/**
 * Recupere le dossier range sous l'ancien nom de l'application.
 *
 * Ne s'execute qu'une fois : la valeur est recopiee sous la nouvelle cle et
 * l'ancienne effacee. Sans cela, un artisan qui avait deja saisi ses clients
 * aurait retrouve une application vide apres le changement de nom — ses
 * donnees toujours dans le navigateur, mais plus personne pour les lire.
 */
function reprendreAncienneCle() {
  try {
    const ancien = localStorage.getItem(CONFIG.storageAncien.dossier);
    if (!ancien) return null;
    localStorage.setItem(CLE, ancien);
    localStorage.removeItem(CONFIG.storageAncien.dossier);
    return ancien;
  } catch {
    return null;
  }
}

/**
 * Ecrit le dossier.
 *
 * Rend `true` si l'ecriture a reussi. Le seul echec courant est le quota
 * depasse — un logo de 3 Mo colle en data URI y suffit. L'appelant DOIT
 * afficher l'echec : perdre une facture en silence est le pire de tous les
 * comportements possibles.
 */
export function enregistrer(dossier) {
  try {
    dossier.meta.majLe = isoInstant();
    localStorage.setItem(CLE, JSON.stringify(dossier));
    return true;
  } catch (e) {
    console.error("Enregistrement impossible", e);
    return false;
  }
}

/** Efface tout. Sans confirmation : c'est a l'appelant de la demander. */
export function effacer() {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien a faire : il n'y avait deja rien a effacer */
  }
}

/**
 * Complete un dossier lu ou importe.
 *
 * Toute cle absente reprend sa valeur par defaut, recursivement sur la fiche
 * entreprise. C'est ce qui permet d'ouvrir un export d'il y a six mois sans
 * migration explicite : les champs ajoutes depuis apparaissent vides au lieu
 * de faire planter la premiere vue qui les lit.
 */
export function normaliser(brut) {
  const base = dossierVide();
  if (!brut || typeof brut !== "object") return base;

  const d = {
    ...base,
    ...brut,
    version: VERSION,
    entreprise: { ...base.entreprise, ...(brut.entreprise || {}) },
    compteurs: { ...base.compteurs, ...(brut.compteurs || {}) },
    meta: { ...base.meta, ...(brut.meta || {}) },
  };

  for (const cle of ["clients", "rdv", "interventions", "documents", "contrats", "catalogue"]) {
    d[cle] = Array.isArray(brut[cle]) ? brut[cle] : [];
  }

  // Les equipements sont imbriques : un client importe sans le tableau ferait
  // lever la fiche client des son ouverture.
  d.clients = d.clients.map((c) => ({
    ...clientVide(),
    ...c,
    equipements: Array.isArray(c.equipements) ? c.equipements : [],
    tags: Array.isArray(c.tags) ? c.tags : [],
    // `chantiers` est arrive apres les premiers dossiers : un client importe
    // d'un export anterieur n'en a pas, et la fiche client leverait des son
    // ouverture si on ne lui en donnait pas un tableau vide.
    chantiers: (Array.isArray(c.chantiers) ? c.chantiers : []).map((ch) => ({
      ...chantierVide(),
      ...ch,
      photos: Array.isArray(ch.photos) ? ch.photos : [],
    })),
  }));

  d.documents = d.documents.map((doc) => ({
    ...documentVide(doc.kind || "devis"),
    ...doc,
    lignes: Array.isArray(doc.lignes) ? doc.lignes : [],
    paiements: Array.isArray(doc.paiements) ? doc.paiements : [],
    remiseGlobale: doc.remiseGlobale || { type: "pourcent", valeur: 0 },
    acompte: doc.acompte || { type: "pourcent", valeur: 0 },
  }));

  d.interventions = d.interventions.map((i) => ({
    ...interventionVide(),
    ...i,
    lignes: Array.isArray(i.lignes) ? i.lignes : [],
  }));

  return d;
}

/* ===========================================================================
   IMPORT / EXPORT

   Le format d'export est le dossier lui-meme, tel quel, en JSON indente. Pas
   de format proprietaire : le fichier s'ouvre dans n'importe quel editeur de
   texte, ce qui est la meilleure garantie de le recuperer dans dix ans meme
   si cette application n'existe plus.
   ======================================================================== */

/**
 * Le contenu du fichier de sauvegarde, sans les photos.
 *
 * C'est l'export courant : quelques dizaines de kilo-octets, qu'on peut faire
 * toutes les semaines sans y penser. Il contient tout ce qui se facture.
 */
export function exporter(dossier) {
  return JSON.stringify({ ...dossier, exporteLe: isoInstant() }, null, 2);
}

/**
 * Le meme, photos comprises.
 *
 * Les images sont relues dans IndexedDB et encodees en base64 — ce qui les
 * alourdit d'un tiers. Un chantier de vingt photos donne un fichier d'environ
 * 7 Mo. C'est lourd, et c'est pour cela que ce n'est pas l'export par defaut :
 * une sauvegarde qu'on renonce a faire parce qu'elle prend trois minutes ne
 * protege personne.
 */
export async function exporterComplet(dossier) {
  const photos = await pourExport(toutesLesPhotos(dossier));
  return JSON.stringify({ ...dossier, photos, exporteLe: isoInstant() }, null, 2);
}

/** Un nom de fichier date, qui se trie tout seul dans un dossier. */
export function nomExport(dossier) {
  const nom = (dossier.entreprise.nom || "hydropro")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return `${nom || "hydropro"}-${aujourdhui()}.json`;
}

/**
 * Relit un fichier de sauvegarde.
 *
 * Leve avec un message en francais si le fichier n'est pas un dossier : c'est
 * le seul endroit de l'application ou l'utilisateur ouvre un fichier
 * quelconque, et « SyntaxError: Unexpected token » ne lui apprend rien.
 */
export function importer(texte) {
  let brut;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new Error("Ce fichier n'est pas un fichier de sauvegarde lisible.");
  }
  if (!brut || typeof brut !== "object" || !("clients" in brut || "documents" in brut)) {
    throw new Error("Ce fichier ne contient pas de dossier Hydropro.");
  }

  // Les photos voyagent a cote du dossier, jamais dedans : elles repartent
  // dans IndexedDB, et le dossier reste leger dans le localStorage.
  const photos = brut.photos && typeof brut.photos === "object" ? brut.photos : null;
  delete brut.photos;

  return { dossier: normaliser(brut), photos };
}

/* ===========================================================================
   ACCES
   ======================================================================== */

/** L'objet d'une liste, par identifiant. `null` si l'identifiant ne dit rien. */
export const parId = (liste, identifiant) =>
  (Array.isArray(liste) ? liste : []).find((x) => x.id === identifiant) || null;

/** L'equipement d'un client, ou qu'il soit dans le dossier. */
export function equipementParId(dossier, equipementId) {
  if (!equipementId) return null;
  for (const client of dossier.clients) {
    const eq = client.equipements.find((e) => e.id === equipementId);
    if (eq) return { ...eq, client };
  }
  return null;
}

/**
 * Le chantier et SON client, ou qu'il soit dans le dossier.
 *
 * Rend l'objet reel — pas une copie — pour qu'on puisse le modifier dans un
 * `ctx.maj()`, et le client a cote, parce qu'on n'affiche jamais un chantier
 * sans dire chez qui il est.
 */
export function chantierParId(dossier, chantierId) {
  if (!chantierId) return null;
  for (const client of dossier.clients) {
    const chantier = (client.chantiers || []).find((c) => c.id === chantierId);
    if (chantier) return { chantier, client };
  }
  return null;
}

/** Tous les chantiers du dossier, avec leur client. */
export function tousLesChantiers(dossier) {
  return dossier.clients.flatMap((client) =>
    (client.chantiers || []).map((chantier) => ({ chantier, client }))
  );
}

/** Les identifiants de toutes les photos citees par le dossier. */
export function toutesLesPhotos(dossier) {
  return tousLesChantiers(dossier).flatMap(({ chantier }) =>
    (chantier.photos || []).map((p) => p.id)
  );
}

/**
 * Le nombre de jours depuis le dernier export, ou `null` si jamais exporte.
 * Sert au rappel de sauvegarde de la barre laterale.
 */
export function joursDepuisExport(dossier) {
  const d = dossier.meta.dernierExport;
  if (!d) return null;
  const ecart = Date.now() - new Date(d).getTime();
  return Math.floor(ecart / 86400000);
}

/**
 * Le poids du dossier, en kilo-octets.
 *
 * Le localStorage plafonne autour de 5 Mo par site. Un artisan n'y arrivera
 * jamais avec du texte ; il y arrivera tres vite avec des logos ou des photos
 * en data URI. Le chiffre est affiche dans les reglages pour que le probleme
 * se voie AVANT que l'ecriture echoue.
 */
export function poidsKo(dossier) {
  try {
    return Math.round(new Blob([JSON.stringify(dossier)]).size / 1024);
  } catch {
    return 0;
  }
}
