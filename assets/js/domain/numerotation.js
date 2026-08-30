/**
 * numerotation.js — les numeros de devis, de facture et de bon d'intervention.
 *
 * LA REGLE QUI COMMANDE TOUT LE RESTE : une facture porte un numero unique,
 * base sur une sequence CHRONOLOGIQUE ET CONTINUE. Pas de trou, pas de retour
 * en arriere, pas de numero reutilise. Un trou dans la numerotation est la
 * premiere chose que cherche un controle, parce que c'est ainsi qu'on
 * dissimule une recette.
 *
 * D'ou une consequence dans l'application, qui surprend au debut et qui est
 * volontaire : UNE FACTURE EN BROUILLON N'A PAS DE NUMERO. Le numero est
 * attribue au moment ou la facture est validee, c'est-a-dire au moment ou elle
 * part chez le client. Supprimer un brouillon ne laisse donc aucun trou ;
 * supprimer une facture validee, si — et l'application refuse de le faire,
 * elle propose de l'annuler par un avoir.
 *
 * Les devis n'ont aucune contrainte legale de sequence. Ils suivent malgre tout
 * la meme regle, pour une raison d'usage : deux comportements differents dans
 * le meme editeur obligeraient a se demander, chaque fois, lequel s'applique.
 */

import { entier } from "../core/format.js";

const FORMATS = {
  devis: { prefixe: "DEV", nom: "devis" },
  facture: { prefixe: "FA", nom: "facture" },
  avoir: { prefixe: "AV", nom: "avoir" },
  intervention: { prefixe: "BI", nom: "bon d'intervention" },
};

/** « DEV-2026-0007 ». Quatre chiffres : au-dela de 9 999 par an, on verra. */
function composer(kind, annee, rang) {
  const f = FORMATS[kind] || FORMATS.devis;
  return `${f.prefixe}-${annee}-${String(rang).padStart(4, "0")}`;
}

/**
 * Le prochain numero, SANS le consommer.
 *
 * Sert a l'afficher en gris dans l'editeur avant validation : on veut savoir a
 * quoi ressemblera le numero sans le figer, puisque valider un autre document
 * entre-temps le decalerait.
 */
export function prochainNumero(dossier, kind, date) {
  const annee = String(date || "").slice(0, 4) || String(new Date().getFullYear());
  const rang = (dossier.compteurs?.[kind]?.[annee] || 0) + 1;
  return composer(kind, annee, rang);
}

/**
 * Attribue et CONSOMME le prochain numero.
 *
 * Modifie les compteurs du dossier : l'appelant doit enregistrer derriere.
 * Une fois consomme, un numero ne revient jamais, meme si le document est
 * ensuite supprime — c'est precisement l'interet.
 */
export function attribuerNumero(dossier, kind, date) {
  const annee = String(date || "").slice(0, 4) || String(new Date().getFullYear());
  if (!dossier.compteurs[kind]) dossier.compteurs[kind] = {};
  const rang = (dossier.compteurs[kind][annee] || 0) + 1;
  dossier.compteurs[kind][annee] = rang;
  return composer(kind, annee, rang);
}

/**
 * Remet un compteur d'annee a une valeur donnee.
 *
 * Le cas reel : on reprend une numerotation commencee ailleurs — sur un carnet
 * a souche, dans un tableur, chez un ancien logiciel. Sans ce reglage, la
 * premiere facture emise ici serait la n° 1 alors que la n° 63 est deja partie,
 * et la sequence de l'annee serait cassee pour toujours.
 */
export function reglerCompteur(dossier, kind, annee, valeur) {
  if (!dossier.compteurs[kind]) dossier.compteurs[kind] = {};
  dossier.compteurs[kind][String(annee)] = Math.max(0, Math.round(valeur) || 0);
}

/** L'etat des compteurs, pour l'ecran des reglages. */
export function etatCompteurs(dossier) {
  const annees = new Set();
  for (const kind of Object.keys(FORMATS)) {
    for (const a of Object.keys(dossier.compteurs?.[kind] || {})) annees.add(a);
  }
  annees.add(String(new Date().getFullYear()));

  return [...annees]
    .sort()
    .reverse()
    .map((annee) => ({
      annee,
      lignes: Object.entries(FORMATS).map(([kind, f]) => ({
        kind,
        nom: f.nom,
        emis: dossier.compteurs?.[kind]?.[annee] || 0,
        prochain: composer(kind, annee, (dossier.compteurs?.[kind]?.[annee] || 0) + 1),
      })),
    }));
}

/**
 * Verifie qu'aucun numero n'est en double dans le dossier.
 *
 * Le cas arrive apres un import de deux sauvegardes fusionnees a la main, ou
 * apres un reglage de compteur trop bas. Deux factures qui portent le meme
 * numero, c'est une comptabilite invalide : autant le dire.
 */
export function doublons(dossier) {
  const vus = new Map();
  const trouves = [];
  for (const doc of dossier.documents) {
    if (!doc.numero) continue;
    if (vus.has(doc.numero)) {
      trouves.push({ numero: doc.numero, ids: [vus.get(doc.numero), doc.id] });
    } else {
      vus.set(doc.numero, doc.id);
    }
  }
  return trouves;
}

/**
 * Cherche les trous dans la sequence des factures d'une annee.
 *
 * Un trou n'est pas forcement une fraude — une facture peut avoir ete emise
 * ailleurs — mais il doit pouvoir s'expliquer, et on ne peut expliquer que ce
 * qu'on a vu.
 */
export function trous(dossier, kind = "facture", annee = String(new Date().getFullYear())) {
  const rangs = dossier.documents
    .filter((d) => d.kind === kind && d.numero && d.numero.includes(`-${annee}-`))
    .map((d) => Number(d.numero.split("-").pop()))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!rangs.length) return [];
  const manquants = [];
  for (let n = 1; n <= rangs[rangs.length - 1]; n += 1) {
    if (!rangs.includes(n)) manquants.push(composer(kind, annee, n));
  }
  return manquants;
}

/** « 7 devis émis en 2026 » — la phrase de l'ecran des reglages. */
export function resume(dossier, kind, annee) {
  const n = dossier.compteurs?.[kind]?.[annee] || 0;
  const f = FORMATS[kind];
  return `${entier(n)} ${f.nom}${n > 1 ? "s" : ""} émis en ${annee}`;
}
