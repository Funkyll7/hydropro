/**
 * agenda.js — la grille du mois, la journee, les conflits, les jours feries.
 *
 * L'agenda d'un artisan n'est pas celui d'un bureau : les depannages tombent
 * sans prevenir, les chantiers debordent, et deux rendez-vous poses par erreur
 * sur le meme creneau se paient d'un client qui attend pour rien. D'ou deux
 * fonctions qui n'existeraient pas ailleurs : `conflits` et `charge`.
 */

import {
  ajouteJours,
  ajouteMinutes,
  aujourdhui,
  heureDe,
  instant,
  isoInstant,
  isoJour,
  jourDe,
  minutesEntre,
  versDate,
} from "../core/format.js";
import { CONFIG } from "../config.js";

/* ===========================================================================
   JOURS FERIES

   Calcules, jamais listes : une liste en dur serait a completer chaque annee,
   et l'application serait fausse le 1er janvier suivant. Les quatre feries
   mobiles derivent tous de Paques, dont la date se calcule par l'algorithme de
   Meeus, exact pour le calendrier gregorien.
   ======================================================================== */

/** Le dimanche de Paques d'une annee, en « AAAA-MM-JJ ». */
export function paques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return isoJour(new Date(annee, mois - 1, jour));
}

/** Les jours feries d'une annee, en « AAAA-MM-JJ » → nom. */
export function feries(annee) {
  const p = paques(annee);
  return {
    [`${annee}-01-01`]: "Jour de l'an",
    [ajouteJours(p, 1)]: "Lundi de Pâques",
    [`${annee}-05-01`]: "Fête du travail",
    [`${annee}-05-08`]: "Victoire 1945",
    [ajouteJours(p, 39)]: "Ascension",
    [ajouteJours(p, 50)]: "Lundi de Pentecôte",
    [`${annee}-07-14`]: "Fête nationale",
    [`${annee}-08-15`]: "Assomption",
    [`${annee}-11-01`]: "Toussaint",
    [`${annee}-11-11`]: "Armistice 1918",
    [`${annee}-12-25`]: "Noël",
  };
}

const cacheFeries = new Map();

/** Le nom du jour ferie, ou `null`. Le cache evite de recalculer Paques. */
export function ferie(jour) {
  const annee = Number(String(jour).slice(0, 4));
  if (!Number.isFinite(annee)) return null;
  if (!cacheFeries.has(annee)) cacheFeries.set(annee, feries(annee));
  return cacheFeries.get(annee)[jour] || null;
}

/* ===========================================================================
   LA GRILLE DU MOIS
   ======================================================================== */

/**
 * Les 35 ou 42 cases d'un mois, semaines completes, du lundi au dimanche.
 *
 * La semaine commence le LUNDI : `getDay()` rend 0 pour dimanche, d'ou le
 * decalage. Une grille qui commence le dimanche fait chercher le samedi au
 * mauvais endroit pendant des semaines.
 */
export function grilleMois(annee, mois) {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7;
  const debut = new Date(annee, mois, 1 - decalage);

  const nbJoursMois = new Date(annee, mois + 1, 0).getDate();
  const cases = Math.ceil((decalage + nbJoursMois) / 7) * 7;

  return Array.from({ length: cases }, (_, i) => {
    const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i);
    const jour = isoJour(d);
    return {
      jour,
      numero: d.getDate(),
      horsMois: d.getMonth() !== mois,
      weekend: d.getDay() === 0 || d.getDay() === 6,
      ferie: ferie(jour),
      auj: jour === aujourdhui(),
    };
  });
}

/* ===========================================================================
   LES RENDEZ-VOUS
   ======================================================================== */

/** Les rendez-vous d'un jour, tries par heure de debut. */
export function rdvDuJour(dossier, jour) {
  return dossier.rdv
    .filter((r) => jourDe(r.debut) === jour)
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

/** Les rendez-vous d'une periode, tries. Bornes incluses. */
export function rdvEntre(dossier, debut, fin) {
  return dossier.rdv
    .filter((r) => {
      const j = jourDe(r.debut);
      return j >= debut && j <= fin;
    })
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

/** Les rendez-vous d'un jour, indexes par jour. Pour peindre un mois d'un coup. */
export function indexParJour(rdvs) {
  const index = new Map();
  for (const r of rdvs) {
    const j = jourDe(r.debut);
    if (!index.has(j)) index.set(j, []);
    index.get(j).push(r);
  }
  for (const liste of index.values()) liste.sort((a, b) => a.debut.localeCompare(b.debut));
  return index;
}

/** La duree d'un rendez-vous en minutes, sa valeur par defaut a defaut de fin. */
export function dureeRdv(rdv, typesRdv = []) {
  if (rdv.fin) {
    const m = minutesEntre(rdv.debut, rdv.fin);
    if (m > 0) return m;
  }
  const type = typesRdv.find((t) => t.cle === rdv.type);
  return type?.dureeMin || CONFIG.dureeRdvMin;
}

/** La fin effective d'un rendez-vous, calculee si elle n'est pas saisie. */
export function finRdv(rdv, typesRdv = []) {
  return rdv.fin || ajouteMinutes(rdv.debut, dureeRdv(rdv, typesRdv));
}

/**
 * Les rendez-vous qui chevauchent celui-ci.
 *
 * Deux creneaux se chevauchent si chacun commence avant que l'autre ne
 * finisse. Les annules ne comptent pas — ils ne bloquent plus rien — et le
 * rendez-vous compare a lui-meme non plus, ce qui arrive a chaque fois qu'on
 * modifie l'heure d'un rendez-vous existant.
 */
export function conflits(dossier, rdv, typesRdv = []) {
  if (!rdv.debut) return [];
  const debut = rdv.debut;
  const fin = finRdv(rdv, typesRdv);

  return rdvDuJour(dossier, jourDe(debut)).filter((autre) => {
    if (autre.id === rdv.id || autre.statut === "annule") return false;
    return debut < finRdv(autre, typesRdv) && autre.debut < fin;
  });
}

/**
 * Le temps occupe dans une journee, en minutes, hors rendez-vous annules.
 *
 * Sert a colorer la charge d'une journee dans le mois et a repondre a « est-ce
 * que je peux caser un depannage jeudi ? » sans ouvrir jeudi.
 */
export function chargeJour(dossier, jour, typesRdv = []) {
  return rdvDuJour(dossier, jour)
    .filter((r) => r.statut !== "annule")
    .reduce((s, r) => s + dureeRdv(r, typesRdv), 0);
}

/**
 * Le premier creneau libre d'au moins `minutes`, a partir d'un jour donne.
 *
 * Balaye la journee de travail par pas d'un quart d'heure, saute les week-ends
 * et les feries, et s'arrete au bout de 60 jours — au-dela, ce n'est plus une
 * proposition, c'est un aveu.
 */
export function prochainCreneau(dossier, minutes = 60, depuis = aujourdhui(), typesRdv = []) {
  const { debut: hDebut, fin: hFin } = CONFIG.journee;

  for (let n = 0; n < 60; n += 1) {
    const jour = ajouteJours(depuis, n);
    const d = versDate(jour);
    if (!d || d.getDay() === 0 || d.getDay() === 6 || ferie(jour)) continue;

    const occupes = rdvDuJour(dossier, jour)
      .filter((r) => r.statut !== "annule")
      .map((r) => [r.debut, finRdv(r, typesRdv)]);

    for (let m = hDebut * 60; m + minutes <= hFin * 60; m += 15) {
      const debut = instant(jour, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
      const fin = ajouteMinutes(debut, minutes);
      // On ne propose pas un creneau deja passe dans la journee en cours.
      // `isoInstant` et non `toISOString` : ce dernier rend de l'UTC, et
      // proposerait des creneaux deja ecoules pendant deux heures en ete.
      if (jour === aujourdhui() && debut < isoInstant()) continue;
      const libre = occupes.every(([od, of_]) => fin <= od || debut >= of_);
      if (libre) return { debut, fin };
    }
  }
  return null;
}

/** Deplace un rendez-vous en gardant sa duree. */
export function deplacer(rdv, nouveauDebut, typesRdv = []) {
  const minutes = dureeRdv(rdv, typesRdv);
  return { ...rdv, debut: nouveauDebut, fin: ajouteMinutes(nouveauDebut, minutes) };
}

/**
 * Le titre affiche d'un rendez-vous.
 *
 * Le titre saisi gagne toujours ; a defaut, le nom du client ; a defaut, le
 * libelle du type. Une pastille vide dans un calendrier n'apprend rien.
 */
export function titreRdv(rdv, client, typesRdv = []) {
  if (rdv.titre) return rdv.titre;
  if (client) {
    if (client.societe) return client.societe;
    return [client.nom, client.prenom].filter(Boolean).join(" ") || "Client";
  }
  return typesRdv.find((t) => t.cle === rdv.type)?.nom || "Rendez-vous";
}

/** L'heure affichee : « 14:30 » ou « 14:30 → 16:00 ». */
export function creneauTexte(rdv, typesRdv = []) {
  const debut = heureDe(rdv.debut);
  const fin = heureDe(finRdv(rdv, typesRdv));
  return fin && fin !== debut ? `${debut} → ${fin}` : debut;
}

/**
 * Les jours ou l'artisan a travaille sur une periode.
 *
 * Sert au recapitulatif : combien de jours travailles, combien d'heures, et
 * quelle part de depannage — le chiffre qui dit si l'activite est subie ou
 * choisie.
 */
export function bilanPeriode(dossier, debut, fin, typesRdv = []) {
  const rdvs = rdvEntre(dossier, debut, fin).filter((r) => r.statut !== "annule");
  const jours = new Set(rdvs.map((r) => jourDe(r.debut)));
  const minutes = rdvs.reduce((s, r) => s + dureeRdv(r, typesRdv), 0);

  const parType = {};
  for (const r of rdvs) {
    parType[r.type] = (parType[r.type] || 0) + dureeRdv(r, typesRdv);
  }

  return {
    nbRdv: rdvs.length,
    nbJours: jours.size,
    minutes,
    heures: Math.round(minutes / 6) / 10,
    parType,
    partDepannage: minutes ? Math.round(((parType.depannage || 0) / minutes) * 100) : 0,
  };
}
