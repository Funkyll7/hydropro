/**
 * format.js — lire et ecrire des nombres, des dates et des heures en francais.
 *
 * Ce fichier existe pour deux raisons precises.
 *
 * 1. `parseFloat("1 234,50")` rend 1. Or c'est exactement ce qu'un artisan
 *    francais tape, et ce que ses factures fournisseur affichent. Tout champ
 *    chiffre passe donc par `nombre()`, jamais par `parseFloat` ni `Number`.
 *
 * 2. `new Date().toISOString().slice(0, 10)` rend LA VEILLE pour tout le monde
 *    a l'est de Greenwich apres 22 h en ete. Un rendez-vous pose a 23 h le 3
 *    septembre serait tombe le 2. Toutes les conversions de date d'ici sont
 *    donc faites sur les composantes LOCALES, jamais sur l'UTC.
 */

const EURO = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const EURO_ROND = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const NOMBRE_2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

const valide = (n) => (Number.isFinite(n) ? n : 0);

/** « 1 234,50 € » — le centime, parce qu'une facture se paie au centime. */
export const euros = (n) => EURO.format(arrondi(valide(n)));

/** « 1 235 € » — pour les totaux d'un tableau de bord, ou le centime est du bruit. */
export const eurosRonds = (n) => EURO_ROND.format(Math.round(valide(n)));

/** « 12 345 » sans unite. */
export const entier = (n) => NOMBRE.format(Math.round(valide(n)));

/** « 12,5 » — jusqu'a deux decimales, sans zero inutile. */
export const decimal = (n) => NOMBRE_2.format(valide(n));

/** « 20 % », « 5,5 % » — la virgule, pas le point. */
export const pourcent = (n, decimales = null) => {
  const v = valide(n);
  const d = decimales === null ? (Number.isInteger(v) ? 0 : 1) : decimales;
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v)} %`;
};

/** « + 1 234,00 € » / « − 1 234,00 € », avec le vrai signe moins. */
export function signe(n) {
  const v = arrondi(valide(n));
  if (v === 0) return euros(0);
  return `${v > 0 ? "+" : "−"} ${EURO.format(Math.abs(v))}`;
}

/**
 * L'arrondi comptable, au centime.
 *
 * `0.1 + 0.2` vaut 0.30000000000000004 en virgule flottante. Sur une facture
 * de trente lignes, ces poussieres s'additionnent et le total TTC affiche
 * finit par differer d'un centime de la somme des lignes — ce qui est
 * exactement le genre d'ecart qu'un comptable releve. Tout montant calcule
 * passe par ici avant d'etre stocke ou compare.
 */
export function arrondi(n, decimales = 2) {
  const f = 10 ** decimales;
  return Math.round((valide(n) + Number.EPSILON) * f) / f;
}

/**
 * Lit un nombre tape a la main, en francais ou non.
 *
 * Accepte « 1 234,50 », « 1234.50 », « 1 234,50 € », « 1234 », "" et null.
 * Les espaces insecables des copier-coller depuis un PDF fournisseur sont
 * traites comme des espaces ordinaires — c'est le cas le plus frequent de
 * saisie qui echouait silencieusement en rendant zero.
 */
export function nombre(valeur, defaut = 0) {
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : defaut;
  if (valeur === null || valeur === undefined) return defaut;

  const propre = String(valeur)
    // `\s` couvre deja l'espace insecable et l'espace fine insecable, qui sont
    // ce que collent les PDF fournisseur et les tableurs.
    .replace(/\s/g, "")
    .replace(/[€$%]/g, "")
    .replace(",", ".");

  if (propre === "" || propre === "-" || propre === ".") return defaut;
  const n = Number(propre);
  return Number.isFinite(n) ? n : defaut;
}

/** Un entier positif borne. Sert aux quantites, aux delais, aux durees. */
export function entierBorne(valeur, min = 0, max = Infinity, defaut = 0) {
  const n = Math.round(nombre(valeur, defaut));
  return Math.min(max, Math.max(min, n));
}

/* ===========================================================================
   DATES

   Convention de toute l'application :
     - une DATE seule s'ecrit « 2026-09-03 » (chaine, jamais d'objet Date) ;
     - un INSTANT s'ecrit « 2026-09-03T14:30 » (heure locale, sans fuseau).
   Ces deux formats se trient dans l'ordre chronologique par simple comparaison
   de chaines, ce qui evite de construire un objet Date pour chaque tri.
   ======================================================================== */

const p2 = (n) => String(n).padStart(2, "0");

/** « 2026-09-03 » a partir d'un objet Date, en heure LOCALE. */
export function isoJour(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** « 2026-09-03T14:30 » a partir d'un objet Date, en heure LOCALE. */
export function isoInstant(d = new Date()) {
  return `${isoJour(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** La date du jour, « 2026-09-03 ». */
export const aujourdhui = () => isoJour(new Date());

/** L'heure courante, arrondie au quart d'heure suivant. « 14:45 » */
export function maintenantArrondi() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Un objet Date a partir de « 2026-09-03 » ou « 2026-09-03T14:30 ». */
export function versDate(iso) {
  if (!iso) return null;
  const s = String(iso);
  // Midi pour une date seule : a minuit, un decalage d'heure d'ete d'une heure
  // en arriere fait basculer au jour precedent.
  const d = s.includes("T") ? new Date(s) : new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** La partie date d'un instant. « 2026-09-03T14:30 » → « 2026-09-03 ». */
export const jourDe = (iso) => (iso ? String(iso).slice(0, 10) : "");

/** La partie heure d'un instant. « 2026-09-03T14:30 » → « 14:30 ». */
export const heureDe = (iso) => (iso && String(iso).includes("T") ? String(iso).slice(11, 16) : "");

/** Recompose un instant a partir d'un jour et d'une heure. */
export const instant = (jour, heure) => `${jour}T${(heure || "00:00").slice(0, 5)}`;

/** Ajoute des jours a une date ISO. Rend une date ISO. */
export function ajouteJours(iso, n) {
  const d = versDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return isoJour(d);
}

/**
 * Ajoute des mois a une date ISO, en bornant le quantieme.
 *
 * `setMonth` fait deborder : 31 janvier + 1 mois donne le 3 mars. Pour une
 * echeance de contrat d'entretien, on veut le 28 ou 29 fevrier.
 */
export function ajouteMois(iso, n) {
  const d = versDate(iso);
  if (!d) return iso;
  const jour = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const dernier = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(jour, dernier));
  return isoJour(d);
}

/** Ajoute des minutes a un instant. Rend un instant. */
export function ajouteMinutes(iso, minutes) {
  const d = versDate(iso);
  if (!d) return iso;
  d.setMinutes(d.getMinutes() + minutes);
  return isoInstant(d);
}

/** Le nombre de jours entiers de `a` a `b`. Negatif si `b` precede `a`. */
export function joursEntre(a, b) {
  const da = versDate(a);
  const db = versDate(b);
  if (!da || !db) return 0;
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** Le nombre de minutes de l'instant `a` a l'instant `b`. */
export function minutesEntre(a, b) {
  const da = versDate(a);
  const db = versDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 60000);
}

/** « 3 septembre 2026 ». */
export function dateLongue(iso) {
  const d = versDate(iso);
  if (!d) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** « 03/09/2026 ». */
export function dateCourte(iso) {
  const d = versDate(iso);
  if (!d) return "";
  return d.toLocaleDateString("fr-FR");
}

/** « jeu. 3 sept. » — l'etiquette d'une journee d'agenda. */
export function dateJour(iso) {
  const d = versDate(iso);
  if (!d) return "";
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/** « jeudi 3 septembre 2026 » — le titre d'une journee. */
export function dateJourLongue(iso) {
  const d = versDate(iso);
  if (!d) return "";
  const s = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « septembre 2026 » — le titre d'un mois. */
export function moisLong(iso) {
  const d = versDate(iso);
  if (!d) return "";
  const s = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « 14:30 » a partir d'un instant. */
export const heure = (iso) => heureDe(iso);

/**
 * « aujourd'hui », « demain », « dans 5 jours », « il y a 12 jours ».
 *
 * Le relatif bat la date absolue pour tout ce qui est proche : « dans 3
 * jours » se comprend sans calcul, « le 6 septembre » demande de savoir quel
 * jour on est. Au-dela de deux semaines, la date absolue reprend le dessus.
 */
export function relatif(iso, reference = aujourdhui()) {
  const n = joursEntre(reference, jourDe(iso));
  if (n === 0) return "aujourd'hui";
  if (n === 1) return "demain";
  if (n === -1) return "hier";
  if (n === 2) return "après-demain";
  if (n > 0 && n <= 14) return `dans ${n} jours`;
  if (n < 0 && n >= -14) return `il y a ${-n} jours`;
  return dateCourte(iso);
}

/** « 1 h 30 », « 45 min », « 2 h ». */
export function duree(minutes) {
  const m = Math.max(0, Math.round(valide(minutes)));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const reste = m % 60;
  return reste ? `${h} h ${p2(reste)}` : `${h} h`;
}

/** « 3 devis » / « 1 devis » — le pluriel, avec son nombre. */
export function pluriel(n, singulier, plurielMot = `${singulier}s`) {
  const v = Math.round(valide(n));
  return `${NOMBRE.format(v)} ${Math.abs(v) >= 2 ? plurielMot : singulier}`;
}

/**
 * Un montant en toutes lettres.
 *
 * Utile sur les factures d'un certain montant, ou la somme en lettres fait
 * foi en cas de discordance avec les chiffres.
 */
export function enLettres(montant) {
  const v = arrondi(Math.abs(valide(montant)));
  const partieEntiere = Math.floor(v);
  const centimes = Math.round((v - partieEntiere) * 100);
  const txt = groupes(partieEntiere);
  const euro = partieEntiere > 1 ? "euros" : "euro";
  if (!centimes) return `${txt} ${euro}`;
  return `${txt} ${euro} et ${groupes(centimes)} centime${centimes > 1 ? "s" : ""}`;
}

const PETITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept",
  "dix-huit", "dix-neuf",
];
const DIZAINES = [
  "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante",
  "quatre-vingt", "quatre-vingt",
];

function souscent(n) {
  if (n < 20) return PETITS[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  // 70 et 90 se disent « soixante-dix » et « quatre-vingt-dix » : la dizaine
  // reste celle de 60 et 80, et l'unite monte jusqu'a 19.
  // 71 garde le « et » de 61 — « soixante et onze » — mais pas 91, qui se dit
  // « quatre-vingt-onze ». C'est une exception, et elle n'a pas d'autre regle
  // qu'elle-meme.
  if (d === 7 || d === 9) {
    if (u === 1 && d === 7) return "soixante et onze";
    return `${DIZAINES[d]}-${PETITS[10 + u]}`;
  }
  if (u === 0) return d === 8 ? "quatre-vingts" : DIZAINES[d];
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${PETITS[u]}`;
}

function souscmille(n) {
  if (n < 100) return souscent(n);
  const c = Math.floor(n / 100);
  const r = n % 100;
  const tete = c === 1 ? "cent" : `${PETITS[c]} cent${r === 0 ? "s" : ""}`;
  return r ? `${tete} ${souscent(r)}` : tete;
}

function groupes(n) {
  if (n === 0) return "zéro";
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1000);
  const reste = n % 1000;
  const bouts = [];
  if (milliards) bouts.push(`${souscmille(milliards)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) bouts.push(`${souscmille(millions)} million${millions > 1 ? "s" : ""}`);
  if (milliers) bouts.push(milliers === 1 ? "mille" : `${souscmille(milliers)} mille`);
  if (reste) bouts.push(souscmille(reste));
  return bouts.join(" ");
}

/** Sans accents ni majuscules : la forme sur laquelle on compare une recherche. */
export function normalise(texte) {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
