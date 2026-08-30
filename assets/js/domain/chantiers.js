/**
 * chantiers.js — le lieu de travail, et ce qui s'y rattache.
 *
 * UN CLIENT N'EST PAS UNE ADRESSE. C'est la distinction que ce module
 * introduit, et elle change ce qu'on peut savoir : un syndic a trente
 * immeubles, un proprietaire a sa maison et l'appartement qu'il loue, un
 * particulier fait refaire sa salle de bain deux ans apres sa chaufferie.
 *
 * Tant que l'adresse n'etait qu'un texte recopie sur chaque devis, personne ne
 * pouvait repondre a la seule question qui compte en arrivant sur place :
 * « qu'est-ce qu'on a deja fait ICI, et qu'est-ce qu'on y a photographie ? »
 *
 * Les documents, les rendez-vous et les interventions portent desormais un
 * `chantierId` FACULTATIF. Facultatif, parce qu'un depannage ponctuel chez un
 * particulier n'a pas besoin qu'on lui ouvre un chantier, et qu'obliger a en
 * creer un ferait abandonner la fonction au troisieme appel.
 */

import { arrondi, normalise } from "../core/format.js";
import { calculer, statutEffectif } from "./documents.js";
import { adresseCourte as adresseClient } from "./clients.js";

/** Le nom affiche d'un chantier : son intitule, a defaut son adresse. */
export function nomChantier(chantier) {
  if (!chantier) return "";
  return chantier.nom || adresseCourte(chantier) || "Chantier sans nom";
}

/** « 8 allée des Peupliers, 69100 Villeurbanne » — sur une ligne. */
export function adresseCourte(chantier) {
  if (!chantier) return "";
  return [chantier.adresse, [chantier.cp, chantier.ville].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

/**
 * L'adresse a imprimer sur un document.
 *
 * Un chantier sans adresse propre est un chantier a l'adresse du client —
 * c'est le cas courant du particulier qui n'en a qu'un. On retombe donc sur
 * celle du client plutot que d'imprimer un bloc vide.
 */
export function adressePourDocument(chantier, client) {
  const propre = [chantier?.adresse, chantier?.complement, [chantier?.cp, chantier?.ville].filter(Boolean).join(" ")]
    .filter((l) => l && l.trim())
    .join("\n");
  return propre || adresseClient(client) || "";
}

/* ============================== Les liens ================================ */

export function documentsDuChantier(dossier, chantierId, kind = null) {
  if (!chantierId) return [];
  return dossier.documents
    .filter((d) => d.chantierId === chantierId && (!kind || d.kind === kind))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function rdvDuChantier(dossier, chantierId) {
  if (!chantierId) return [];
  return dossier.rdv
    .filter((r) => r.chantierId === chantierId)
    .sort((a, b) => b.debut.localeCompare(a.debut));
}

export function interventionsDuChantier(dossier, chantierId) {
  if (!chantierId) return [];
  return dossier.interventions
    .filter((i) => i.chantierId === chantierId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Ce que le chantier a rapporte, et ce qu'il doit encore.
 *
 * Meme logique que le bilan d'un client : les brouillons ne comptent pas, les
 * avoirs se deduisent. La difference est qu'ici on peut comparer DEUX chantiers
 * du meme client — celui qui a bien marche et celui qui a debordé.
 */
export function bilan(dossier, chantierId) {
  let facture = 0;
  let encaisse = 0;
  let du = 0;
  let devisEnAttente = 0;
  let devisAcceptes = 0;

  for (const doc of documentsDuChantier(dossier, chantierId)) {
    const calc = calculer(doc, dossier.entreprise);
    if (doc.kind === "devis") {
      if (statutEffectif(doc, calc) === "envoye") devisEnAttente += 1;
      if (doc.statut === "accepte") devisAcceptes += 1;
      continue;
    }
    if (doc.statut === "brouillon" || doc.statut === "annulee") continue;

    const signe = doc.kind === "avoir" ? -1 : 1;
    facture += signe * calc.ht;
    encaisse += signe * calc.paye;
    if (doc.kind === "facture") du += calc.reste;
  }

  return {
    facture: arrondi(facture),
    encaisse: arrondi(encaisse),
    du: arrondi(du),
    devisEnAttente,
    devisAcceptes,
  };
}

/* ============================== Les photos =============================== */

/** Les photos rangees par phase, dans l'ordre du chantier. */
export function photosParPhase(chantier) {
  const phases = [
    { cle: "avant", nom: "Avant" },
    { cle: "pendant", nom: "Pendant" },
    { cle: "apres", nom: "Après" },
  ];
  const photos = [...(chantier?.photos || [])].sort((a, b) => (a.prise || "").localeCompare(b.prise || ""));
  return phases
    .map((p) => ({ ...p, photos: photos.filter((x) => (x.phase || "pendant") === p.cle) }))
    .filter((p) => p.photos.length);
}

/** Le poids cumule des photos d'un chantier, en octets. */
export function poidsPhotos(chantier) {
  return (chantier?.photos || []).reduce((s, p) => s + (p.octets || 0), 0);
}

/**
 * Le couple avant / apres le plus parlant.
 *
 * La premiere photo « avant » et la derniere « apres » : c'est la comparaison
 * qu'on montre a un client qui a oublie dans quel etat etait sa chaufferie, et
 * a un assureur qui demande des preuves.
 */
export function avantApres(chantier) {
  const photos = chantier?.photos || [];
  const avant = photos.filter((p) => p.phase === "avant").sort((a, b) => (a.prise || "").localeCompare(b.prise || ""))[0];
  const apres = photos.filter((p) => p.phase === "apres").sort((a, b) => (b.prise || "").localeCompare(a.prise || ""))[0];
  return avant && apres ? { avant, apres } : null;
}

/* ============================ Recherche et tri =========================== */

export function correspond(chantier, client, requete) {
  const q = normalise(requete);
  if (!q) return true;
  const champs = [
    chantier.nom,
    chantier.adresse,
    chantier.ville,
    chantier.cp,
    chantier.notes,
    chantier.acces,
    client?.nom,
    client?.prenom,
    client?.societe,
    ...(chantier.photos || []).map((p) => p.legende),
  ];
  return champs.some((c) => normalise(c).includes(q));
}

/**
 * L'etat d'un chantier, tel qu'il s'affiche.
 *
 * « En cours » est le seul etat qui reclame quelque chose : c'est pour cela
 * qu'il est le seul en couleur d'accent, et que la liste le remonte en tete.
 */
export function etat(chantier, statuts = []) {
  const s = statuts.find((x) => x.cle === chantier.statut);
  return s || { cle: chantier.statut || "en-cours", nom: chantier.statut || "En cours", couleur: "neutre" };
}

const RANG = { "en-cours": 0, prevu: 1, termine: 2 };

/** Les chantiers en cours d'abord, puis les prevus, puis les termines. */
export function trier(liste) {
  return [...liste].sort((a, b) => {
    const ra = RANG[a.chantier.statut] ?? 3;
    const rb = RANG[b.chantier.statut] ?? 3;
    if (ra !== rb) return ra - rb;
    return (b.chantier.debut || b.chantier.creeLe || "").localeCompare(a.chantier.debut || a.chantier.creeLe || "");
  });
}

/**
 * Ce qui empeche de supprimer un chantier.
 *
 * Meme regle que pour un client : un document comptable ne doit pas se
 * retrouver rattache a un lieu qui n'existe plus. Les photos, elles, ne
 * retiennent rien — elles suivent le chantier dans la tombe.
 */
export function raisonsDeGarder(dossier, chantierId) {
  const raisons = [];
  const docs = documentsDuChantier(dossier, chantierId);
  const factures = docs.filter((d) => d.kind !== "devis" && d.statut !== "brouillon").length;
  const devis = docs.filter((d) => d.kind === "devis").length;

  if (factures) raisons.push(`${factures} facture${factures > 1 ? "s" : ""} — à conserver 10 ans`);
  if (devis) raisons.push(`${devis} devis`);
  return raisons;
}
