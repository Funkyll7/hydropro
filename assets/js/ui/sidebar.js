/**
 * sidebar.js — la barre laterale : marque, navigation, resume, reglages.
 *
 * Elle porte aussi la liste des onglets, employee telle quelle par la barre du
 * bas sur telephone. Une seule definition, deux rendus : c'est ce qui evite
 * qu'un onglet ajoute apparaisse d'un cote et pas de l'autre.
 */

import { el } from "../core/dom.js";
import { icone, logo } from "./icones.js";
import { bouton } from "./champs.js";
import { listeTailles, listeThemes, poserTaille, poserTheme } from "./theme.js";
import { CONFIG } from "../config.js";
import { eurosRonds, pluriel, aujourdhui } from "../core/format.js";
import { joursDepuisExport } from "../domain/dossier.js";
import { calculer, statutEffectif } from "../domain/documents.js";
import { chiffreAffaires, moisCourant } from "../domain/stats.js";
import { rdvDuJour } from "../domain/agenda.js";
import { echeances } from "../domain/contrats.js";

/**
 * Les onglets, dans l'ordre de la journee d'un artisan : ce qu'il fait
 * aujourd'hui, ou il va, chez qui, ce qu'il a promis, ce qu'on lui doit.
 * Les reglages ferment la marche parce qu'on n'y va qu'une fois.
 */
export const ONGLETS = [
  { cle: "accueil", nom: "Aujourd'hui", court: "Auj.", ico: "accueil" },
  { cle: "agenda", nom: "Agenda", court: "Agenda", ico: "agenda" },
  { cle: "clients", nom: "Clients", court: "Clients", ico: "clients" },
  { cle: "devis", nom: "Devis", court: "Devis", ico: "devis" },
  { cle: "factures", nom: "Factures", court: "Factures", ico: "factures" },
  { cle: "interventions", nom: "Interventions", ico: "interventions" },
  { cle: "contrats", nom: "Contrats d'entretien", ico: "contrats" },
  { cle: "catalogue", nom: "Catalogue", ico: "catalogue" },
  { cle: "chiffres", nom: "Chiffres", ico: "chiffres" },
  { cle: "reglages", nom: "Réglages", ico: "reglages" },
];

/** Les cinq onglets de la barre du bas. Cinq, pas six : au-dela, on rate la cible. */
export const ONGLETS_BAS = ["accueil", "agenda", "clients", "devis", "factures"];

/**
 * Les compteurs affiches a droite de chaque onglet.
 *
 * Un compteur ROUGE ne s'emploie que pour ce qui coute de l'argent si on
 * l'oublie : une facture en retard, une visite d'entretien depassee. Tout le
 * reste se contente d'un chiffre gris, sans quoi le rouge cesse d'alerter.
 */
export function compteurs(dossier) {
  const auj = aujourdhui();
  let devisAttente = 0;
  let facturesRetard = 0;

  for (const doc of dossier.documents) {
    if (doc.kind === "devis") {
      if (statutEffectif(doc) === "envoye") devisAttente += 1;
      continue;
    }
    if (doc.kind !== "facture" || doc.statut === "brouillon" || doc.statut === "annulee") continue;
    if (statutEffectif(doc, calculer(doc, dossier.entreprise)) === "retard") facturesRetard += 1;
  }

  const dues = echeances(dossier, CONFIG.seuils.echeanceContratJours).filter((e) => e.etat.cle === "du");

  return {
    agenda: { n: rdvDuJour(dossier, auj).filter((r) => r.statut !== "annule").length },
    devis: { n: devisAttente },
    factures: { n: facturesRetard, alerte: facturesRetard > 0 },
    contrats: { n: dues.length, alerte: dues.length > 0 },
    clients: { n: dossier.clients.filter((c) => !c.archive).length },
  };
}

/* ============================== La barre ================================= */

export function rendreSidebar(ctx) {
  const { dossier, onglet } = ctx;
  const compte = compteurs(dossier);

  return el(
    "div.side__contenu",
    marque(dossier),
    resume(dossier),
    navigation(onglet, compte, ctx.aller),
    blocSauvegarde(ctx),
    el(
      "div.side__bloc",
      el("div.side__label", "Apparence"),
      listeThemes((cle) => {
        poserTheme(cle);
        ctx.rendre();
      })
    ),
    el(
      "div.side__bloc",
      el("div.side__label", "Taille du texte"),
      listeTailles((cle) => {
        poserTaille(cle);
        ctx.rendre();
      }),
      el(
        "div.side__raccourcis",
        el("kbd", "1"), " … ", el("kbd", "9"), " changer d'onglet", el("br"),
        el("kbd", "N"), " nouveau", el("br"),
        el("kbd", "/"), " rechercher", el("br"),
        el("kbd", "Échap"), " fermer"
      )
    ),
    el(
      "div.side__pied",
      `${CONFIG.nom} — ${CONFIG.baseline}.`,
      el("br"),
      "Tout reste dans ce navigateur : rien n'est envoyé, rien n'est partagé."
    )
  );
}

function marque(dossier) {
  return el(
    "div.marque",
    logo(34),
    el(
      "div.marque__texte",
      el("div.marque__nom", CONFIG.nom),
      el("div.marque__entreprise", dossier.entreprise.nom || "Entreprise à renseigner")
    ),
    el("div#temoin.temoin", { title: "Témoin d'enregistrement" })
  );
}

/**
 * Les trois chiffres qu'on veut voir sans changer d'ecran : ce qui est parti ce
 * mois-ci, ce qui est rentre, et ce qui manque. Le troisieme est le seul qui
 * reclame une action.
 */
function resume(dossier) {
  const mois = moisCourant();
  const ca = chiffreAffaires(dossier, mois.debut, mois.fin);

  let du = 0;
  for (const doc of dossier.documents) {
    if (doc.kind !== "facture" || doc.statut === "brouillon" || doc.statut === "annulee") continue;
    du += calculer(doc, dossier.entreprise).reste;
  }

  const ligne = (label, valeur, ton, discret) =>
    el(
      `div.resume__ligne${discret ? ".resume__ligne--discret" : ""}`,
      el("div.resume__label", label),
      el(`div.resume__valeur${ton ? `.resume__valeur--${ton}` : ""}`, valeur)
    );

  return el(
    "div.resume",
    ligne("Facturé ce mois", eurosRonds(ca.facture)),
    ligne("Encaissé", eurosRonds(ca.encaisse), "ok", true),
    ligne("Reste à encaisser", eurosRonds(du), du > 0 ? "alerte" : "", true)
  );
}

function navigation(actif, compte, aller) {
  return el(
    "nav.nav",
    { "aria-label": "Rubriques" },
    ONGLETS.map((o) => {
      const c = compte[o.cle];
      return el(
        `button.nav__item${actif === o.cle ? ".nav__item--actif" : ""}`,
        { type: "button", onclick: () => aller(o.cle), "aria-current": actif === o.cle ? "page" : null },
        el("span.nav__icone", icone(o.ico, 19)),
        el("span.nav__nom", o.nom),
        c && c.n
          ? el(`span.nav__badge${c.alerte ? ".nav__badge--alerte" : ""}`, c.n)
          : null
      );
    })
  );
}

/**
 * Le bloc de sauvegarde.
 *
 * Il n'est pas la pour faire joli. Le dossier vit dans le localStorage de ce
 * navigateur : un nettoyage d'historique, un mode prive, un telephone change,
 * et tout est perdu. Le rappel apparait au bout du delai regle dans config.js,
 * et il est ecrit en toutes lettres — pas une icone, pas un point rouge.
 */
function blocSauvegarde(ctx) {
  const jours = joursDepuisExport(ctx.dossier);
  const enRetard =
    CONFIG.rappelSauvegardeJours > 0 && (jours === null || jours >= CONFIG.rappelSauvegardeJours);

  return el(
    "div.side__bloc",
    el("div.side__label", "Sauvegarde"),
    enRetard
      ? el(
          "div.side__note.side__note--alerte",
          jours === null
            ? "Jamais sauvegardé. Un export met le dossier à l'abri d'un navigateur qui s'efface."
            : `Dernière sauvegarde il y a ${pluriel(jours, "jour")}.`
        )
      : el("div.side__note", `Sauvegardé il y a ${pluriel(jours, "jour")}.`),
    el(
      "div.side__boutons",
      bouton("Exporter", { ico: "export", onclick: ctx.exporter, petit: true }),
      bouton("Importer", { ico: "import", onclick: ctx.importer, petit: true })
    )
  );
}

/** La barre du bas, sur telephone. Memes onglets, memes compteurs. */
export function rendreBarreBasse(ctx) {
  const compte = compteurs(ctx.dossier);
  return ONGLETS_BAS.map((cle) => {
    const o = ONGLETS.find((x) => x.cle === cle);
    const c = compte[cle];
    return el(
      `button.basse__item${ctx.onglet === cle ? ".basse__item--actif" : ""}`,
      { type: "button", onclick: () => ctx.aller(cle), "aria-current": ctx.onglet === cle ? "page" : null },
      icone(o.ico, 21),
      el("span", o.court || o.nom),
      c && c.alerte && c.n ? el("span.basse__pastille", c.n) : null
    );
  });
}
