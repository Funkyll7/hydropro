/**
 * contrats.js — les contrats d'entretien.
 *
 * L'ecran repond a une seule question : QUI DOIS-JE APPELER MAINTENANT ? Les
 * contrats sont donc tries par echeance, les retards en premier, et chaque
 * ligne porte le bouton qui pose le rendez-vous. Tout le reste est secondaire.
 *
 * Un contrat d'entretien, c'est du chiffre d'affaires connu douze mois a
 * l'avance et un client qu'on revoit chaque annee. La deuxieme partie de
 * l'ecran liste donc les appareils qui devraient etre sous contrat et ne le
 * sont pas : la liste des conversions faciles.
 */

import { el } from "../core/dom.js";
import { CONFIG } from "../config.js";
import {
  aide,
  bouton,
  boutonIcone,
  carte,
  carteListe,
  champ,
  champDate,
  champMontant,
  champSelect,
  champZone,
  coche,
  filtres,
  kpi,
  vide,
} from "./champs.js";
import { icone } from "./icones.js";
import { retour } from "./parts.js";
import { ouvrirRdv } from "./agenda.js";
import { creerDocument } from "./documents.js";
import { aujourdhui, dateCourte, euros, eurosRonds, pluriel, relatif } from "../core/format.js";
import { contratVide, parId, equipementParId } from "../domain/dossier.js";
import { nomClient, adresseCourte } from "../domain/clients.js";
import { caRecurrent, decrire, echeances, etat as etatContrat, marquerPassage, prochaineVisite, sansContrat } from "../domain/contrats.js";

export function titre(ctx) {
  const c = ctx.params ? parId(ctx.dossier.contrats, ctx.params) : null;
  return c ? c.intitule : "Contrats d'entretien";
}

export function actions(ctx) {
  return [bouton("Nouveau contrat", { ico: "plus", variante: "plein", petit: true, onclick: () => ouvrirContrat(ctx, null) })];
}

export const nouveau = (ctx) => ouvrirContrat(ctx, null);

export function rendre(ctx) {
  const contrat = ctx.params ? parId(ctx.dossier.contrats, ctx.params) : null;
  if (ctx.params && !contrat) {
    return vide({
      ico: "contrats",
      titre: "Contrat introuvable",
      action: bouton("Revenir à la liste", { variante: "plein", onclick: () => ctx.aller("contrats") }),
    });
  }
  return contrat ? fiche(ctx, contrat) : liste(ctx);
}

/* ================================= La liste =============================== */

function liste(ctx) {
  const filtre = ctx.vue.filtre || "actifs";
  const dus = echeances(ctx.dossier, CONFIG.seuils.echeanceContratJours);
  const orphelins = sansContrat(ctx.dossier, ctx.ref.reference.categoriesEquipement);

  const tous = [...ctx.dossier.contrats].sort((a, b) =>
    (prochaineVisite(a) || "9999").localeCompare(prochaineVisite(b) || "9999")
  );

  const visibles = tous.filter((c) => {
    if (filtre === "actifs") return c.actif;
    if (filtre === "echeance") return dus.some((d) => d.contrat.id === c.id);
    if (filtre === "inactifs") return !c.actif;
    return true;
  });

  return el(
    "div.onglet",

    el(
      "div.grille.grille--3",
      kpi({
        valeur: String(ctx.dossier.contrats.filter((c) => c.actif).length),
        label: "Contrats actifs",
        detail: "clients revus chaque année sans démarchage",
      }),
      kpi({
        valeur: eurosRonds(caRecurrent(ctx.dossier)),
        label: "Chiffre d'affaires récurrent",
        detail: "sur douze mois, hors taxes",
        ton: "ok",
      }),
      kpi({
        valeur: String(dus.length),
        label: "Visites à programmer",
        detail: dus.length ? "dont certaines sont en retard" : "rien d'urgent",
        ton: dus.length ? "avert" : "",
      })
    ),

    filtres([
      { nom: "Actifs", n: tous.filter((c) => c.actif).length, actif: filtre === "actifs", onclick: () => ctx.poserVue({ filtre: "actifs" }) },
      { nom: "À programmer", n: dus.length, actif: filtre === "echeance", onclick: () => ctx.poserVue({ filtre: "echeance" }) },
      { nom: "Inactifs", n: tous.filter((c) => !c.actif).length, actif: filtre === "inactifs", onclick: () => ctx.poserVue({ filtre: "inactifs" }) },
      { nom: "Tous", n: tous.length, actif: filtre === "tous", onclick: () => ctx.poserVue({ filtre: "tous" }) },
    ]),

    visibles.length
      ? carteListe({
          titre: pluriel(visibles.length, "contrat"),
          sousTitre: "Triés par date de prochaine visite",
          contenu: el("div", visibles.map((c) => ligneContrat(ctx, c))),
        })
      : vide({
          ico: "contrats",
          titre: "Aucun contrat",
          texte:
            "L'entretien annuel d'une chaudière est obligatoire pour l'occupant. Le contrat transforme cette obligation en rendez-vous programmé — et en chiffre d'affaires prévisible.",
          action: bouton("Nouveau contrat", { variante: "plein", ico: "plus", onclick: () => ouvrirContrat(ctx, null) }),
        }),

    orphelins.length ? propositions(ctx, orphelins) : null
  );
}

function ligneContrat(ctx, contrat) {
  const e = etatContrat(contrat, CONFIG.seuils.echeanceContratJours);
  const d = decrire(ctx.dossier, contrat);
  const prochaine = prochaineVisite(contrat);

  return el(
    `div.ligne.ligne--marque.ligne--marque-${e.couleur === "neutre" ? "" : e.couleur}`,
    el("div.ligne__icone.ligne__icone--cuivre", icone("contrats", 18)),
    el(
      "div.ligne__corps",
      el("div.ligne__titre", d.client),
      el(
        "div.ligne__meta",
        el("span", d.appareil),
        el("span", d.periodicite),
        prochaine ? el("span", `visite ${relatif(prochaine)}`) : el("span", "date à fixer")
      )
    ),
    el(
      "div.ligne__droite",
      el("div.ligne__montant", euros(contrat.montant)),
      el(`span.etat.etat--${e.couleur}`, e.nom)
    ),
    el(
      "div.ligne__actions",
      boutonIcone("agenda", "Programmer la visite", {
        onclick: () =>
          ouvrirRdv(ctx, null, {
            clientId: contrat.clientId,
            equipementId: contrat.equipementId,
            contratId: contrat.id,
            type: "entretien",
            jour: prochaine || aujourdhui(),
          }),
      }),
      boutonIcone("crayon", "Ouvrir le contrat", { onclick: () => ctx.aller("contrats", contrat.id) })
    )
  );
}

/**
 * Les appareils sans contrat.
 *
 * On les entretient deja, une fois par an, a la demande. Le contrat ne change
 * rien au travail : il change qui appelle qui, et donc le taux de visites
 * effectivement realisees.
 */
function propositions(ctx, orphelins) {
  return carteListe({
    variante: "cuivre",
    titre: "Appareils sans contrat",
    sousTitre: `${pluriel(orphelins.length, "appareil")} qui relèvent d'un entretien périodique`,
    contenu: el(
      "div",
      orphelins.slice(0, 12).map(({ client, equipement }) =>
        el(
          "div.ligne",
          el("div.ligne__icone.ligne__icone--cuivre", icone("flamme", 18)),
          el(
            "div.ligne__corps",
            el("div.ligne__titre", nomClient(client)),
            el(
              "div.ligne__meta",
              el("span", [equipement.marque, equipement.modele].filter(Boolean).join(" ") || "Appareil"),
              el("span", adresseCourte(client))
            )
          ),
          el(
            "div.ligne__actions",
            bouton("Proposer un contrat", {
              petit: true,
              onclick: () => ouvrirContrat(ctx, null, { clientId: client.id, equipementId: equipement.id }),
            })
          )
        )
      )
    ),
  });
}

/* ================================= La fiche =============================== */

function fiche(ctx, contrat) {
  const client = parId(ctx.dossier.clients, contrat.clientId);
  const eq = equipementParId(ctx.dossier, contrat.equipementId);
  const e = etatContrat(contrat, CONFIG.seuils.echeanceContratJours);
  const prochaine = prochaineVisite(contrat);

  const visites = ctx.dossier.rdv
    .filter((r) => r.contratId === contrat.id)
    .sort((a, b) => b.debut.localeCompare(a.debut));

  return el(
    "div.onglet",
    el("div.barre-outils.no-print", retour(ctx, "contrats", "Tous les contrats")),

    carte({
      variante: e.couleur === "alerte" ? "alerte" : "cuivre",
      titre: contrat.intitule,
      sousTitre: client ? nomClient(client) : "Client non renseigné",
      actions: [el(`span.etat.etat--${e.couleur}`, e.nom)],
      corps: [
        el(
          "div.grille.grille--3",
          kpi({ valeur: euros(contrat.montant), label: "Montant par visite" }),
          kpi({
            valeur: prochaine ? dateCourte(prochaine) : "—",
            label: "Prochaine visite",
            // Le nombre de jours, et non la date repetee : la carte porte deja
            // la date en gros, et « dans 19 jours » est ce qui fait decrocher
            // le telephone.
            detail:
              e.jours === null
                ? "à fixer"
                : e.jours < 0
                  ? `en retard de ${-e.jours} jours`
                  : `dans ${e.jours} jours`,
            ton: e.jours !== null && e.jours < 0 ? "alerte" : "",
          }),
          kpi({ valeur: contrat.dernierPassage ? dateCourte(contrat.dernierPassage) : "—", label: "Dernier passage" })
        ),
        el(
          "div.rang",
          bouton("Programmer la visite", {
            variante: "plein",
            ico: "agenda",
            onclick: () =>
              ouvrirRdv(ctx, null, {
                clientId: contrat.clientId,
                equipementId: contrat.equipementId,
                contratId: contrat.id,
                type: "entretien",
                jour: prochaine || aujourdhui(),
              }),
          }),
          bouton("Visite faite aujourd'hui", {
            ico: "coche",
            onclick: () => {
              ctx.maj((d) => {
                const c = parId(d.contrats, contrat.id);
                marquerPassage(c, aujourdhui());
              });
              ctx.toast("Passage enregistré, prochaine visite reprogrammée.");
            },
          }),
          bouton("Facturer le contrat", {
            ico: "factures",
            onclick: () =>
              creerDocument(ctx, "facture", {
                clientId: contrat.clientId,
                objet: contrat.intitule,
                lignes: [
                  {
                    id: `lg-${Math.random().toString(36).slice(2, 8)}`,
                    type: "presta",
                    ref: "",
                    designation: contrat.intitule,
                    detail: eq ? [eq.marque, eq.modele].filter(Boolean).join(" ") : "",
                    quantite: 1,
                    unite: "forfait",
                    pu: contrat.montant,
                    tva: contrat.tva,
                    remise: 0,
                  },
                ],
              }),
          })
        ),
      ],
    }),

    formulaire(ctx, contrat, client),

    carteListe({
      titre: "Visites",
      sousTitre: visites.length ? pluriel(visites.length, "visite") : "Aucune visite enregistrée sous ce contrat",
      contenu: visites.length
        ? el(
            "div",
            visites.map((r) =>
              el(
                "button.ligne.ligne--cliquable",
                { type: "button", onclick: () => ouvrirRdv(ctx, r) },
                el("div.ligne__icone.ligne__icone--cuivre", icone("agenda", 18)),
                el(
                  "div.ligne__corps",
                  el("div.ligne__titre", dateCourte(r.debut.slice(0, 10))),
                  el("div.ligne__meta", el("span", r.statut === "fait" ? "faite" : "prévue"))
                )
              )
            )
          )
        : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Les rendez-vous posés depuis cette fiche apparaîtront ici."),
    })
  );
}

function formulaire(ctx, contrat, client) {
  const equipements = client?.equipements || [];

  return carte({
    titre: "Conditions",
    corps: [
      champ("Intitulé", {
        valeur: contrat.intitule,
        oninput: (v) => ctx.majSilencieux(() => {
          contrat.intitule = v;
        }),
      }),
      equipements.length
        ? champSelect("Appareil couvert", {
            valeur: contrat.equipementId,
            options: [
              { valeur: "", nom: "— aucun —" },
              ...equipements.map((e) => ({
                valeur: e.id,
                nom: [e.marque, e.modele, e.emplacement].filter(Boolean).join(" · ") || "Appareil",
              })),
            ],
            onchange: (v) => ctx.maj(() => {
              contrat.equipementId = v;
            }),
          })
        : null,
      el(
        "div.grille.grille--3",
        champMontant("Montant par visite", {
          valeur: contrat.montant,
          onchange: (v) => ctx.maj(() => {
            contrat.montant = v;
          }),
        }),
        champSelect("Périodicité", {
          valeur: contrat.frequenceMois,
          options: ctx.ref.reference.frequencesContrat.map((f) => ({ valeur: f.mois, nom: f.nom })),
          onchange: (v) => ctx.maj(() => {
            contrat.frequenceMois = Number(v);
          }),
        }),
        champSelect("TVA", {
          valeur: contrat.tva,
          options: ctx.ref.tva.taux.filter((t) => t.valeur > 0).map((t) => ({ valeur: t.valeur, nom: `${t.valeur} %` })),
          onchange: (v) => ctx.maj(() => {
            contrat.tva = Number(v);
          }),
        })
      ),
      el(
        "div.grille.grille--3",
        champDate("Début du contrat", {
          valeur: contrat.debut,
          onchange: (v) => ctx.maj(() => {
            contrat.debut = v;
          }),
        }),
        champDate("Dernier passage", {
          valeur: contrat.dernierPassage,
          aide: "C'est lui qui commande la prochaine échéance.",
          onchange: (v) => ctx.maj(() => {
            contrat.dernierPassage = v;
            contrat.prochainPassage = "";
          }),
        }),
        champDate("Prochaine visite", {
          valeur: contrat.prochainPassage || prochaineVisite(contrat) || "",
          aide: "Modifiable si le client demande un autre mois.",
          onchange: (v) => ctx.maj(() => {
            contrat.prochainPassage = v;
          }),
        })
      ),
      el(
        "div.grille.grille--2",
        coche("Contrat actif", {
          valeur: contrat.actif === true,
          note: "Décochez en cas de résiliation : le contrat sort des échéances sans être supprimé.",
          onchange: (v) => ctx.maj(() => {
            contrat.actif = v;
          }),
        }),
        coche("Reconduction tacite", {
          valeur: contrat.reconduction === true,
          note: "Pour mémoire — pensez au préavis de résiliation prévu au contrat.",
          onchange: (v) => ctx.maj(() => {
            contrat.reconduction = v;
          }),
        })
      ),
      champZone("Ce que couvre le contrat", {
        valeur: contrat.notes,
        lignes: 3,
        placeholder: "Visite annuelle, pièces d'usure, déplacement inclus, délai d'intervention garanti…",
        aide: "S'imprime sur la facture du contrat : c'est ce que le client croit avoir acheté.",
        oninput: (v) => ctx.majSilencieux(() => {
          contrat.notes = v;
        }),
      }),
      aide(
        ctx.ref.checklist.obligationsClient.find((o) => o.cle === "entretien-chaudiere")?.texte || "",
        "avert"
      ),
      bouton("Supprimer ce contrat", {
        variante: "danger",
        ico: "poubelle",
        onclick: async () => {
          const ok = await ctx.confirmer({
            titre: "Supprimer ce contrat ?",
            texte: "Les rendez-vous déjà posés sont conservés. Pour arrêter un contrat, préférez le décocher « actif ».",
          });
          if (!ok) return;
          ctx.aller("contrats");
          ctx.maj((d) => {
            d.contrats = d.contrats.filter((c) => c.id !== contrat.id);
          });
        },
      }),
    ],
  });
}

/* ============================== Création ================================= */

/** Cree un contrat et ouvre sa fiche. */
export function ouvrirContrat(ctx, existant, patch = {}) {
  if (existant) {
    ctx.aller("contrats", existant.id);
    return;
  }

  const client = patch.clientId ? parId(ctx.dossier.clients, patch.clientId) : null;
  const eq = patch.equipementId ? equipementParId(ctx.dossier, patch.equipementId) : null;

  const contrat = contratVide({
    ...patch,
    intitule: eq
      ? `Contrat d'entretien ${[eq.marque, eq.modele].filter(Boolean).join(" ") || "annuel"}`
      : "Contrat d'entretien annuel",
    montant: 130,
    dernierPassage: eq?.dernierEntretien || "",
  });

  void client;
  ctx.maj((d) => d.contrats.push(contrat));
  ctx.aller("contrats", contrat.id);
}
