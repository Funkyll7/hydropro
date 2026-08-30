/**
 * chiffres.js — ce que l'entreprise a fait, et ce qu'on lui doit.
 *
 * UNE DISTINCTION COMMANDE TOUT CET ECRAN : le chiffre d'affaires FACTURE
 * n'est pas l'argent ENCAISSE. On peut avoir fait une bonne annee et ne pas
 * pouvoir payer ses fournisseurs parce que 18 000 € dorment chez des clients.
 * Les deux chiffres sont donc toujours donnes ensemble, et l'histogramme les
 * montre l'un a cote de l'autre, mois par mois.
 *
 * Ce que cet ecran N'EST PAS : une comptabilite. Il ne connait pas les factures
 * fournisseur, ni les cotisations, ni les amortissements. Il dit ce qui est
 * sorti et ce qui est rentre — ce qui suffit a piloter, et pas a declarer.
 */

import { el } from "../core/dom.js";
import { aide, carte, carteListe, kpi, segment, vide } from "./champs.js";
import { icone } from "./icones.js";
import { ligneDocument } from "./parts.js";
import {
  ajouteJours,
  aujourdhui,
  dateCourte,
  duree,
  euros,
  eurosRonds,
  pluriel,
  pourcent,
} from "../core/format.js";
import {
  anneeCourante,
  chiffreAffaires,
  encours,
  moisCourant,
  parMois,
  repartition,
  topClients,
  transformation,
  tvaCollectee,
} from "../domain/stats.js";
import { bilanPeriode } from "../domain/agenda.js";
import { caRecurrent } from "../domain/contrats.js";

export const titre = () => "Chiffres";

const PERIODES = [
  { cle: "mois", nom: "Ce mois" },
  { cle: "trimestre", nom: "3 mois" },
  { cle: "annee", nom: "Cette année" },
  { cle: "douze", nom: "12 mois" },
];

function bornes(cle) {
  const auj = aujourdhui();
  if (cle === "mois") {
    const m = moisCourant(auj);
    return { debut: m.debut, fin: m.fin, nom: "ce mois" };
  }
  if (cle === "trimestre") return { debut: ajouteJours(auj, -90), fin: auj, nom: "sur 3 mois" };
  if (cle === "douze") return { debut: ajouteJours(auj, -365), fin: auj, nom: "sur 12 mois" };
  const a = anneeCourante(auj);
  return { debut: a.debut, fin: a.fin, nom: `en ${a.annee}` };
}

export function rendre(ctx) {
  const periodeCle = ctx.vue.periode || "annee";
  const p = bornes(periodeCle);
  const { dossier } = ctx;

  if (!dossier.documents.length) {
    return vide({
      ico: "chiffres",
      titre: "Rien à compter pour l'instant",
      texte: "Les chiffres apparaîtront dès la première facture validée. Les brouillons ne comptent pas — ce ne sont pas encore des recettes.",
    });
  }

  const ca = chiffreAffaires(dossier, p.debut, p.fin);
  const enc = encours(dossier);
  const trans = transformation(dossier, p.debut, p.fin);
  const rep = repartition(dossier, p.debut, p.fin);
  const tva = tvaCollectee(dossier, p.debut, p.fin);
  const act = bilanPeriode(dossier, p.debut, p.fin, ctx.ref.reference.typesRdv);

  return el(
    "div.onglet",

    el(
      "div.barre-outils",
      segment(
        PERIODES.map((x) => ({ valeur: x.cle, nom: x.nom })),
        periodeCle,
        (v) => ctx.poserVue({ periode: v }),
        "Période"
      ),
      el("div.champ__aide.pousse", `Du ${dateCourte(p.debut)} au ${dateCourte(p.fin)}`)
    ),

    el(
      "div.grille.grille--4",
      kpi({ valeur: eurosRonds(ca.facture), label: `Facturé ${p.nom}`, detail: "hors taxes, avoirs déduits" }),
      kpi({ valeur: eurosRonds(ca.encaisse), label: "Encaissé", detail: "à la date du règlement", ton: "ok" }),
      kpi({
        valeur: eurosRonds(enc.total),
        label: "Encours total",
        detail: "toutes factures non soldées",
        ton: enc.total > 0 ? "avert" : "",
      }),
      kpi({
        valeur: eurosRonds(caRecurrent(dossier)),
        label: "Récurrent annuel",
        detail: "contrats d'entretien actifs",
      })
    ),

    histogramme(dossier),
    blocEncours(ctx, enc),
    el(
      "div.grille.grille--large",
      blocTransformation(trans),
      blocRepartition(rep),
      blocTva(ctx, tva, ca),
      blocActivite(act)
    ),
    blocTopClients(ctx, dossier, p)
  );
}

/* ============================== Histogramme ==============================
   Douze mois, deux barres par mois : ce qui est parti et ce qui est rentre.
   Des barres en CSS, pas une bibliotheque — douze valeurs ne justifient pas
   90 ko de dependance, et celle-ci marcherait mal hors ligne.
   ======================================================================== */

function histogramme(dossier) {
  const mois = parMois(dossier, 12);
  const max = Math.max(1, ...mois.map((m) => Math.max(m.facture, m.encaisse)));

  return carte({
    titre: "Les douze derniers mois",
    sousTitre: "Barre pleine : facturé. Barre verte : encaissé.",
    corps: [
      el(
        "div.histo",
        mois.map((m) =>
          el(
            "div.histo__col",
            { title: `${m.libelle} — facturé ${euros(m.facture)}, encaissé ${euros(m.encaisse)}` },
            el(
              "div.histo__barres",
              el("div.histo__barre", { style: { height: `${(Math.max(0, m.facture) / max) * 100}%` } }),
              el("div.histo__barre.histo__barre--encaisse", {
                style: { height: `${(Math.max(0, m.encaisse) / max) * 100}%` },
              })
            ),
            el("div.histo__label", m.libelle)
          )
        )
      ),
      el(
        "div.legende",
        el(
          "span.legende__item",
          el("span.legende__puce", { style: { background: "var(--accent)" } }),
          "Facturé HT"
        ),
        el(
          "span.legende__item",
          el("span.legende__puce", { style: { background: "var(--ok)" } }),
          "Encaissé TTC"
        )
      ),
    ],
  });
}

/* ================================ Encours ================================
   Le decoupage par anciennete n'est pas decoratif : au-dela de 90 jours, la
   probabilite de recouvrement s'effondre. C'est le moment de passer de la
   relance a la mise en demeure.
   ======================================================================== */

function blocEncours(ctx, enc) {
  if (enc.total <= 0) {
    return carte({
      variante: "ok",
      titre: "Encours",
      corps: aide("Aucune facture en attente de règlement. Tout ce qui est parti est rentré."),
    });
  }

  const tranches = Object.entries(enc.tranches).filter(([, t]) => t.montant > 0);

  return carteListe({
    variante: enc.tranches.plus.montant > 0 ? "alerte" : "avert",
    titre: "Ce qu'on vous doit",
    sousTitre: `${eurosRonds(enc.total)} au total`,
    contenu: el(
      "div",
      tranches.map(([cle, t]) =>
        el(
          "div",
          el(
            `div.ligne.ligne--marque.ligne--marque-${cle === "aEchoir" ? "info" : cle === "plus" ? "alerte" : "avert"}`,
            el(
              "div.ligne__icone",
              icone(cle === "aEchoir" ? "horloge" : "alerte", 18)
            ),
            el(
              "div.ligne__corps",
              el("div.ligne__titre", t.nom),
              el("div.ligne__meta", el("span", pluriel(t.docs.length, "facture")))
            ),
            el("div.ligne__droite", el("div.ligne__montant", euros(t.montant)))
          ),
          el(
            "div",
            { style: { paddingLeft: "16px" } },
            t.docs
              .sort((a, b) => b.reste - a.reste)
              .slice(0, 4)
              .map((x) => ligneDocument(ctx, x.doc, { onclick: () => ctx.aller("factures", x.doc.id) }))
          )
        )
      )
    ),
  });
}

/* ============================= Transformation ============================ */

function blocTransformation(t) {
  return carte({
    titre: "Devis : ce qui se signe",
    sousTitre: "Le chiffre le plus utile, et le plus ignoré",
    corps: [
      el(
        "div.grille.grille--2",
        kpi({
          valeur: t.taux === null ? "—" : `${t.taux} %`,
          label: "Taux de signature",
          detail: t.taux === null ? "aucun devis décidé" : `${t.acceptes} acceptés sur ${t.acceptes + t.refuses} décidés`,
          ton: t.taux === null ? "" : t.taux >= 40 ? "ok" : "avert",
        }),
        kpi({
          valeur: eurosRonds(t.panierMoyen),
          label: "Panier moyen",
          detail: "par devis signé",
        })
      ),
      el(
        "div.defs",
        el("div.def", el("div.def__label", "Émis"), el("div.def__valeur", `${t.emis} · ${eurosRonds(t.montantEmis)}`)),
        el(
          "div.def",
          el("div.def__label", "En attente"),
          el("div.def__valeur", `${t.enAttente} · ${eurosRonds(t.montantEnAttente)}`)
        ),
        el("div.def", el("div.def__label", "Expirés sans réponse"), el("div.def__valeur", String(t.expires)))
      ),
      t.taux !== null
        ? aide(
            t.taux < 30
              ? "Sous 30 %, c'est souvent le délai de réponse plus que le prix : un devis remis le jour de la visite se signe deux fois plus."
              : t.taux > 80
                ? "Au-dessus de 80 %, personne ne discute vos prix. C'est agréable, et c'est généralement le signe qu'ils sont trop bas."
                : "Un taux entre 40 et 60 % est le signe d'un chiffrage juste : ni bradé, ni hors marché."
          )
        : null,
    ],
  });
}

/* ============================== Répartition ============================== */

function blocRepartition(r) {
  const total = r.mainOeuvre + r.fournitures;

  return carte({
    titre: "D'où vient le chiffre d'affaires",
    corps: [
      total
        ? el(
            "div",
            el(
              "div.jauge",
              { style: { height: "14px" } },
              el("div.jauge__part", { style: { width: `${(r.mainOeuvre / total) * 100}%` } })
            ),
            el(
              "div.legende",
              { style: { marginTop: "8px" } },
              el(
                "span.legende__item",
                el("span.legende__puce", { style: { background: "var(--accent)" } }),
                `Main d'œuvre ${eurosRonds(r.mainOeuvre)}`
              ),
              el(
                "span.legende__item",
                el("span.legende__puce", { style: { background: "var(--bg-creux)" } }),
                `Fournitures ${eurosRonds(r.fournitures)}`
              )
            )
          )
        : el("div.champ__aide", "Aucune facture sur la période."),
      r.tauxMarge !== null
        ? el(
            "div.defs",
            el("div.def", el("div.def__label", "Achats de fournitures"), el("div.def__valeur", eurosRonds(r.achats))),
            el("div.def", el("div.def__label", "Marge brute"), el("div.def__valeur", eurosRonds(r.margeFournitures))),
            el("div.def", el("div.def__label", "Taux de marge"), el("div.def__valeur", `${r.tauxMarge} %`))
          )
        : aide(
            "Renseignez les prix d'achat dans le catalogue pour voir la marge réelle sur les fournitures."
          ),
      r.partMainOeuvre !== null && r.partMainOeuvre < 40
        ? aide(
            `La main d'œuvre ne représente que ${r.partMainOeuvre} % du chiffre : l'entreprise revend beaucoup de matériel, ce qui pèse sur la trésorerie — le fournisseur est payé avant le client.`,
            "avert"
          )
        : null,
    ],
  });
}

/* ================================== TVA ================================== */

function blocTva(ctx, tva, ca) {
  if (ctx.dossier.entreprise.assujettiTva === false) {
    return carte({
      titre: "TVA",
      corps: aide(
        "Entreprise en franchise en base : aucune TVA n'est facturée ni récupérée. Surveillez votre chiffre d'affaires cumulé — le dépassement des seuils fait basculer au régime réel."
      ),
    });
  }

  return carte({
    titre: "TVA collectée",
    sousTitre: "Ce que vous avez encaissé pour le Trésor",
    corps: [
      el(
        "table.tableau",
        el("thead", el("tr", el("th", "Taux"), el("th", "Base HT"), el("th", "TVA"))),
        el(
          "tbody",
          tva.parTaux.map((t) =>
            el("tr", el("td", pourcent(t.taux)), el("td.num", euros(t.base)), el("td.num", euros(t.montant)))
          ),
          el(
            "tr",
            el("td", el("strong", "Total")),
            el("td.num", euros(ca.facture)),
            el("td.num", el("strong", euros(tva.total)))
          )
        )
      ),
      aide(
        "Ce n'est PAS une déclaration de TVA : il manque la TVA déductible sur vos achats, que cette application ne connaît pas. Le chiffre sert à provisionner, pas à déclarer.",
        "avert"
      ),
    ],
  });
}

/* =============================== Activité ================================ */

function blocActivite(act) {
  return carte({
    titre: "Activité",
    sousTitre: "Ce que l'agenda dit du temps passé",
    corps: [
      el(
        "div.grille.grille--2",
        kpi({ valeur: String(act.nbJours), label: "Jours travaillés", detail: pluriel(act.nbRdv, "rendez-vous", "rendez-vous") }),
        kpi({ valeur: duree(act.minutes), label: "Temps planifié" })
      ),
      act.partDepannage > 0
        ? el(
            "div",
            el("div.champ__label", `Part de dépannage : ${act.partDepannage} %`),
            el(
              "div.jauge",
              el(`div.jauge__part${act.partDepannage > 60 ? ".jauge__part--alerte" : ""}`, {
                style: { width: `${act.partDepannage}%` },
              })
            ),
            el(
              "div.champ__aide",
              act.partDepannage > 60
                ? "Plus de six heures sur dix passées en dépannage : l'activité est subie plutôt que choisie. Les contrats d'entretien et les chantiers programmés sont ce qui rééquilibre."
                : "Un bon équilibre entre l'urgence et le planifié."
            )
          )
        : null,
    ],
  });
}

/* ============================== Top clients ============================== */

function blocTopClients(ctx, dossier, p) {
  const tops = topClients(dossier, p.debut, p.fin, 8);
  if (!tops.length) return null;

  const total = tops.reduce((s, t) => s + t.ht, 0);

  return carteListe({
    titre: "Meilleurs clients",
    sousTitre: `${p.nom}, en chiffre d'affaires hors taxes`,
    contenu: el(
      "div",
      tops.map((t) =>
        el(
          "button.ligne.ligne--cliquable",
          { type: "button", onclick: () => (t.client ? ctx.aller("clients", t.client.id) : null) },
          el("div.ligne__icone", icone("clients", 18)),
          el(
            "div.ligne__corps",
            el("div.ligne__titre", t.nom),
            el("div.ligne__meta", el("span", pluriel(t.nb, "facture"))),
            el(
              "div.jauge",
              { style: { marginTop: "4px" } },
              el("div.jauge__part", { style: { width: `${total ? (t.ht / total) * 100 : 0}%` } })
            )
          ),
          el("div.ligne__droite", el("div.ligne__montant", eurosRonds(t.ht)))
        )
      )
    ),
  });
}
