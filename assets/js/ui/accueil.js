/**
 * accueil.js — l'ecran d'ouverture : ce qu'il y a a faire aujourd'hui.
 *
 * C'est le seul ecran qu'on regarde tous les matins, et il repond a quatre
 * questions dans cet ordre : ou est-ce que je vais aujourd'hui ; qu'est-ce qui
 * m'attend ; qu'est-ce qui traine ; combien j'ai fait ce mois-ci.
 *
 * Ce qui n'y figure PAS est aussi delibere : pas de graphique, pas de
 * comparaison avec l'an dernier, pas d'objectif. Un tableau de bord qu'on
 * regarde debout, une tasse a la main, doit tenir en un ecran.
 */

import { el } from "../core/dom.js";
import { CONFIG } from "../config.js";
import { bouton, carte, carteListe, kpi, vide, sectionTitre, aide } from "./champs.js";
import { icone } from "./icones.js";
import { ligneDocument, ligneRdv } from "./parts.js";
import { ouvrirRdv } from "./agenda.js";
import { creerDocument } from "./documents.js";
import {
  ajouteJours,
  aujourdhui,
  dateJourLongue,
  duree,
  euros,
  eurosRonds,
  heureDe,
  jourDe,
  joursEntre,
  pluriel,
  relatif,
} from "../core/format.js";
import { calculer, statutEffectif, joursAvantExpiration, joursRetard } from "../domain/documents.js";
import { chiffreAffaires, moisCourant } from "../domain/stats.js";
import { chargeJour, prochainCreneau, rdvDuJour, rdvEntre } from "../domain/agenda.js";
import { echeances, prochaineVisite, decrire } from "../domain/contrats.js";
import { parId } from "../domain/dossier.js";
import { nomClient } from "../domain/clients.js";

export const titre = () => "Aujourd'hui";

export function actions(ctx) {
  return [
    bouton("Rendez-vous", { ico: "agenda", onclick: () => ouvrirRdv(ctx, null), petit: true }),
    bouton("Devis", { ico: "plus", variante: "plein", onclick: () => creerDocument(ctx, "devis"), petit: true }),
  ];
}

export const nouveau = (ctx) => ouvrirRdv(ctx, null);

export function rendre(ctx) {
  const { dossier } = ctx;
  const auj = aujourdhui();

  return el(
    "div.onglet",
    demarrage(ctx),
    chiffres(ctx),
    journee(ctx, auj),
    aFaire(ctx),
    semaine(ctx, auj)
  );
}

/* ============================== Le demarrage ============================== */

/**
 * La carte qui n'apparait qu'au debut.
 *
 * Elle disparait des que la fiche entreprise est remplie. Un ecran d'accueil
 * qui montre trois cartes vides et aucun chemin est la meilleure facon de
 * faire fermer une application au premier lancement.
 */
function demarrage(ctx) {
  const e = ctx.dossier.entreprise;
  if (e.nom && e.siret) return null;

  const etapes = [
    { fait: Boolean(e.nom && e.siret), texte: "Renseigner l'entreprise : nom, adresse, SIRET, assurance décennale", vers: "reglages" },
    { fait: ctx.dossier.clients.length > 0, texte: "Créer un premier client", vers: "clients" },
    { fait: ctx.dossier.documents.length > 0, texte: "Établir un devis", vers: "devis" },
  ];

  return carte({
    variante: "cuivre",
    titre: "Bienvenue",
    sousTitre: "Trois choses à faire avant le premier devis",
    corps: [
      el("p", "Cette application vit entièrement dans ce navigateur : aucun compte, aucun envoi, aucun abonnement. En contrepartie, pensez à exporter votre dossier régulièrement — le bouton est dans la barre de gauche."),
      el(
        "div.liste",
        etapes.map((s) =>
          el(
            "button.ligne.ligne--cliquable",
            { type: "button", onclick: () => ctx.aller(s.vers) },
            el(`div.ligne__icone${s.fait ? ".ligne__icone--ok" : ""}`, icone(s.fait ? "coche" : "droite", 18)),
            el("div.ligne__corps", el("div.ligne__titre", s.texte))
          )
        )
      ),
    ],
  });
}

/* ================================ Chiffres =============================== */

function chiffres(ctx) {
  const { dossier } = ctx;
  const mois = moisCourant();
  const ca = chiffreAffaires(dossier, mois.debut, mois.fin);

  let du = 0;
  let retard = 0;
  let devisAttente = 0;
  let montantDevis = 0;

  for (const doc of dossier.documents) {
    const calc = calculer(doc, dossier.entreprise);
    if (doc.kind === "devis") {
      if (statutEffectif(doc, calc) === "envoye") {
        devisAttente += 1;
        montantDevis += calc.ttc;
      }
      continue;
    }
    if (doc.kind !== "facture" || doc.statut === "brouillon" || doc.statut === "annulee") continue;
    du += calc.reste;
    if (statutEffectif(doc, calc) === "retard") retard += calc.reste;
  }

  return el(
    "div.grille.grille--4",
    kpi({
      valeur: eurosRonds(ca.facture),
      label: "Facturé ce mois",
      detail: "hors taxes, avoirs déduits",
      onclick: () => ctx.aller("chiffres"),
    }),
    kpi({
      valeur: eurosRonds(ca.encaisse),
      label: "Encaissé ce mois",
      detail: "ce qui est réellement rentré",
      ton: "ok",
      onclick: () => ctx.aller("chiffres"),
    }),
    kpi({
      valeur: eurosRonds(du),
      label: "Reste à encaisser",
      detail: retard > 0 ? `dont ${eurosRonds(retard)} en retard` : "aucune facture en retard",
      ton: retard > 0 ? "alerte" : "",
      onclick: () => ctx.aller("factures"),
    }),
    kpi({
      valeur: String(devisAttente),
      label: "Devis en attente",
      detail: devisAttente ? `${eurosRonds(montantDevis)} en jeu` : "rien à relancer",
      ton: devisAttente ? "avert" : "",
      onclick: () => ctx.aller("devis"),
    })
  );
}

/* ================================ Journee ================================ */

function journee(ctx, auj) {
  const types = ctx.ref.reference.typesRdv;
  const rdvs = rdvDuJour(ctx.dossier, auj).filter((r) => r.statut !== "annule");
  const minutes = chargeJour(ctx.dossier, auj, types);

  const contenu = rdvs.length
    ? el(
        "div",
        rdvs.map((r) => ligneRdv(ctx, r, { onclick: () => ouvrirRdv(ctx, r) }))
      )
    : vide({
        ico: "agenda",
        titre: "Rien de prévu aujourd'hui",
        texte: "Journée libre : c'est le bon moment pour relancer les devis en attente ou appeler les contrats d'entretien à échéance.",
        action: bouton("Poser un rendez-vous", { variante: "plein", ico: "plus", onclick: () => ouvrirRdv(ctx, null) }),
      });

  const creneau = prochainCreneau(ctx.dossier, 90, auj, types);

  return carteListe({
    titre: dateJourLongue(auj),
    sousTitre: rdvs.length
      ? `${pluriel(rdvs.length, "rendez-vous", "rendez-vous")} · ${duree(minutes)} de travail prévu`
      : "aucun rendez-vous",
    actions: [bouton("Voir l'agenda", { onclick: () => ctx.aller("agenda"), petit: true })],
    contenu,
    pied: creneau
      ? [
          el(
            "div.champ__aide",
            `Prochain créneau libre d'1 h 30 : ${relatif(creneau.debut)} à ${heureDe(creneau.debut)}.`
          ),
        ]
      : null,
  });
}

/* ================================= À faire ===============================
   La liste des choses qui coutent de l'argent si on les oublie. Elle est
   triee par ce que ca coute, pas par date : une facture de 4 000 € en retard
   de 40 jours passe avant un devis a relancer.
   ======================================================================== */

function aFaire(ctx) {
  const { dossier } = ctx;
  const auj = aujourdhui();
  const items = [];

  for (const doc of dossier.documents) {
    const calc = calculer(doc, dossier.entreprise);
    const cle = statutEffectif(doc, calc);

    if (doc.kind === "facture" && cle === "retard") {
      items.push({
        poids: 1000 + calc.reste,
        node: ligneDocument(ctx, doc, { onclick: () => ctx.aller("factures", doc.id) }),
        section: "impayes",
        texte: `${joursRetard(doc)} jours de retard`,
      });
    }

    if (doc.kind === "devis" && cle === "envoye") {
      const restant = joursAvantExpiration(doc);
      const sansReponse = doc.envoyeLe ? joursEntre(doc.envoyeLe, auj) : 0;
      const aRelancer = sansReponse >= CONFIG.seuils.relanceDevisJours;
      const expireBientot = restant !== null && restant <= CONFIG.seuils.expirationDevisJours;
      if (aRelancer || expireBientot) {
        items.push({
          poids: 500 + calc.ttc / 100,
          node: ligneDocument(ctx, doc, { onclick: () => ctx.aller("devis", doc.id) }),
          section: "devis",
          texte: expireBientot ? `expire ${relatif(doc.echeance)}` : "sans réponse",
        });
      }
    }
  }

  const contrats = echeances(ctx.dossier, CONFIG.seuils.echeanceContratJours);
  const interventionsAFacturer = dossier.interventions.filter((i) => i.aFacturer && !i.documentId);

  const sections = [];

  const impayes = items.filter((i) => i.section === "impayes").sort((a, b) => b.poids - a.poids);
  if (impayes.length) {
    sections.push(
      carteListe({
        variante: "alerte",
        titre: "Factures en retard",
        sousTitre: `${pluriel(impayes.length, "facture")} · à relancer`,
        contenu: el("div", impayes.map((i) => i.node)),
      })
    );
  }

  const relances = items.filter((i) => i.section === "devis").sort((a, b) => b.poids - a.poids);
  if (relances.length) {
    sections.push(
      carteListe({
        variante: "avert",
        titre: "Devis à relancer",
        sousTitre: `sans réponse depuis plus de ${CONFIG.seuils.relanceDevisJours} jours, ou proches de l'expiration`,
        contenu: el("div", relances.map((i) => i.node)),
      })
    );
  }

  if (contrats.length) {
    sections.push(
      carteListe({
        variante: "cuivre",
        titre: "Entretiens à programmer",
        sousTitre: `${pluriel(contrats.length, "contrat")} dont la visite arrive à échéance`,
        contenu: el(
          "div",
          contrats.slice(0, 6).map(({ contrat, etat: e }) => {
            const d = decrire(ctx.dossier, contrat);
            return el(
              "button.ligne.ligne--cliquable.ligne--marque.ligne--marque-cuivre",
              { type: "button", onclick: () => ctx.aller("contrats", contrat.id) },
              el("div.ligne__icone.ligne__icone--cuivre", icone("flamme", 18)),
              el(
                "div.ligne__corps",
                el("div.ligne__titre", d.client),
                el(
                  "div.ligne__meta",
                  el("span", d.appareil),
                  el("span", `visite ${relatif(prochaineVisite(contrat))}`)
                )
              ),
              el("div.ligne__droite", el("span", `${euros(contrat.montant)}`))
            );
          })
        ),
        pied: contrats.length > 6 ? [bouton("Voir tous les contrats", { onclick: () => ctx.aller("contrats"), petit: true })] : null,
      })
    );
  }

  if (interventionsAFacturer.length) {
    sections.push(
      carteListe({
        titre: "Interventions à facturer",
        sousTitre: `${pluriel(interventionsAFacturer.length, "intervention")} terminée(s) sans facture`,
        contenu: el(
          "div",
          interventionsAFacturer.slice(0, 6).map((i) => {
            const client = parId(ctx.dossier.clients, i.clientId);
            return el(
              "button.ligne.ligne--cliquable",
              { type: "button", onclick: () => ctx.aller("interventions", i.id) },
              el("div.ligne__icone", icone("interventions", 18)),
              el(
                "div.ligne__corps",
                el("div.ligne__titre", client ? nomClient(client) : "Sans client"),
                el("div.ligne__meta", el("span", i.motif || "Intervention"), el("span", relatif(i.date)))
              )
            );
          })
        ),
      })
    );
  }

  if (!sections.length) {
    return carte({
      titre: "À faire",
      corps: aide("Rien ne traîne : aucune facture en retard, aucun devis à relancer, aucun entretien en attente. C'est rare, profitez-en."),
    });
  }

  return el("div.grille.grille--large", sections);
}

/* =============================== La semaine ============================== */

function semaine(ctx, auj) {
  const fin = ajouteJours(auj, 7);
  const rdvs = rdvEntre(ctx.dossier, ajouteJours(auj, 1), fin).filter((r) => r.statut !== "annule");
  if (!rdvs.length) return null;

  const parJour = new Map();
  for (const r of rdvs) {
    const j = jourDe(r.debut);
    if (!parJour.has(j)) parJour.set(j, []);
    parJour.get(j).push(r);
  }

  return el(
    "div",
    sectionTitre("Les sept prochains jours"),
    el(
      "div.grille.grille--large",
      [...parJour.entries()].map(([jour, liste]) =>
        carteListe({
          titre: dateJourLongue(jour),
          sousTitre: pluriel(liste.length, "rendez-vous", "rendez-vous"),
          contenu: el(
            "div",
            liste.map((r) => ligneRdv(ctx, r, { onclick: () => ouvrirRdv(ctx, r) }))
          ),
        })
      )
    )
  );
}
