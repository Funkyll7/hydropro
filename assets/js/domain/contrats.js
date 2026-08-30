/**
 * contrats.js — les contrats d'entretien, et les visites qu'ils declenchent.
 *
 * C'est le module qui rapporte de l'argent sans qu'on y pense : un contrat
 * d'entretien, c'est un chiffre d'affaires connu douze mois a l'avance, un
 * client qu'on revoit chaque annee, et la porte d'entree de tous les
 * remplacements de chaudiere. Encore faut-il ne pas oublier de passer.
 *
 * L'application ne cree PAS les rendez-vous toute seule. Elle signale les
 * echeances et propose de les poser : un rendez-vous apparu sans qu'on l'ait
 * decide est un rendez-vous auquel personne ne va.
 */

import { ajouteMois, aujourdhui, joursEntre, arrondi, nombre } from "../core/format.js";
import { parId, equipementParId } from "./dossier.js";
import { nomClient } from "./documents.js";

/**
 * La date de la prochaine visite.
 *
 * Elle se calcule a partir du DERNIER PASSAGE, pas de la date de debut du
 * contrat : un entretien fait avec deux mois de retard decale legitimement le
 * suivant, sinon on se retrouve a devoir deux visites la meme annee.
 */
export function prochaineVisite(contrat) {
  if (contrat.prochainPassage) return contrat.prochainPassage;
  const base = contrat.dernierPassage || contrat.debut;
  if (!base) return null;
  return ajouteMois(base, nombre(contrat.frequenceMois, 12) || 12);
}

/**
 * L'etat d'un contrat vis-a-vis du calendrier.
 *
 *   « a jour »   la prochaine visite est loin
 *   « bientot »  elle tombe dans la fenetre de rappel
 *   « du »       la date est passee : la visite aurait du etre faite
 *   « inactif »  contrat resilie ou non reconduit
 */
export function etat(contrat, fenetreJours = 45, date = aujourdhui()) {
  if (!contrat.actif) return { cle: "inactif", nom: "Inactif", couleur: "neutre", jours: null };
  const prochaine = prochaineVisite(contrat);
  if (!prochaine) return { cle: "ajour", nom: "À jour", couleur: "ok", jours: null };

  const jours = joursEntre(date, prochaine);
  if (jours < 0) {
    return { cle: "du", nom: `En retard de ${-jours} j`, couleur: "alerte", jours };
  }
  if (jours <= fenetreJours) {
    return { cle: "bientot", nom: `Dans ${jours} j`, couleur: "avert", jours };
  }
  return { cle: "ajour", nom: "À jour", couleur: "ok", jours };
}

/** Les contrats dont la visite est due ou proche, du plus urgent au plus loin. */
export function echeances(dossier, fenetreJours = 45, date = aujourdhui()) {
  return dossier.contrats
    .filter((c) => c.actif)
    .map((c) => ({ contrat: c, etat: etat(c, fenetreJours, date), prochaine: prochaineVisite(c) }))
    .filter((x) => x.etat.cle === "du" || x.etat.cle === "bientot")
    .sort((a, b) => (a.prochaine || "").localeCompare(b.prochaine || ""));
}

/**
 * Enregistre le passage : la visite du jour devient le dernier passage, et la
 * suivante se recalcule. C'est le geste unique de fin d'entretien.
 */
export function marquerPassage(contrat, date = aujourdhui()) {
  contrat.dernierPassage = date;
  contrat.prochainPassage = ajouteMois(date, nombre(contrat.frequenceMois, 12) || 12);
  return contrat;
}

/**
 * Le chiffre d'affaires recurrent : ce que les contrats actifs rapportent sur
 * douze mois. Un contrat semestriel a 90 € rapporte 180 € par an.
 */
export function caRecurrent(dossier) {
  return arrondi(
    dossier.contrats
      .filter((c) => c.actif)
      .reduce((s, c) => {
        const parAn = 12 / (nombre(c.frequenceMois, 12) || 12);
        return s + nombre(c.montant, 0) * parAn;
      }, 0)
  );
}

/** Le libelle complet d'un contrat : client, appareil, periodicite. */
export function decrire(dossier, contrat) {
  const client = parId(dossier.clients, contrat.clientId);
  const eq = equipementParId(dossier, contrat.equipementId);
  const appareil = eq ? [eq.marque, eq.modele].filter(Boolean).join(" ") : "";
  return {
    client: client ? nomClient(client) : "Client inconnu",
    appareil: appareil || contrat.intitule,
    periodicite:
      nombre(contrat.frequenceMois, 12) === 12
        ? "annuel"
        : nombre(contrat.frequenceMois, 12) === 6
          ? "semestriel"
          : `tous les ${contrat.frequenceMois} mois`,
  };
}

/**
 * Les equipements qui devraient etre sous contrat et ne le sont pas.
 *
 * Un client qui a une chaudiere, qu'on entretient deja tous les ans a la
 * demande, et a qui personne n'a propose de contrat : c'est la liste des
 * conversions faciles.
 */
export function sansContrat(dossier, categoriesEquipement = []) {
  const couverts = new Set(dossier.contrats.filter((c) => c.actif).map((c) => c.equipementId));
  const aEntretenir = new Set(
    categoriesEquipement.filter((c) => c.entretienMois > 0).map((c) => c.cle)
  );

  const trouves = [];
  for (const client of dossier.clients) {
    if (client.archive) continue;
    for (const eq of client.equipements || []) {
      if (couverts.has(eq.id) || !aEntretenir.has(eq.categorie)) continue;
      trouves.push({ client, equipement: eq });
    }
  }
  return trouves;
}

/**
 * La date de l'entretien obligatoire d'un equipement, contrat ou pas.
 *
 * L'entretien annuel d'une chaudiere est une obligation qui pese sur
 * l'occupant, et l'artisan qui la lui rappelle rend service autant qu'il
 * remplit son planning de septembre.
 */
export function entretienDu(equipement, categoriesEquipement = [], date = aujourdhui()) {
  const cat = categoriesEquipement.find((c) => c.cle === equipement.categorie);
  if (!cat || !cat.entretienMois) return null;
  const base = equipement.dernierEntretien || equipement.installeLe;
  if (!base) return null;
  const echeance = ajouteMois(base, cat.entretienMois);
  return { echeance, jours: joursEntre(date, echeance), obligation: cat.aide || "" };
}
