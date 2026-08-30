/**
 * impression.js — la feuille qui part chez le client.
 *
 * Ce module dessine le devis, la facture ou l'avoir tels qu'ils sortiront de
 * l'imprimante. Il est employe a deux endroits — l'apercu a l'ecran et
 * l'impression — et c'est le meme code : un apercu qui ne ressemble pas au
 * resultat ne sert a rien.
 *
 * IL N'Y A PAS DE GENERATEUR DE PDF. Le navigateur sait deja imprimer et sait
 * deja « Enregistrer au format PDF » — sur Windows, sur Android, sur iPhone.
 * Le PDF obtenu contient du vrai texte, selectionnable et cherchable, ce
 * qu'une bibliotheque de 300 ko n'aurait pas mieux fait.
 */

import { el } from "../core/dom.js";
import {
  dateLongue,
  decimal,
  euros,
  enLettres,
  pourcent,
} from "../core/format.js";
import { calculer, estChiffree, nomClient } from "../domain/documents.js";
import { adresseLignes } from "../domain/clients.js";
import { mentionsDocument, piedDePage } from "../domain/mentions.js";
import { parId } from "../domain/dossier.js";

const NOMS = { devis: "Devis", facture: "Facture", avoir: "Avoir" };

/** La feuille complete. `ctx` fournit le dossier et les mentions. */
export function feuille(ctx, doc) {
  const { dossier, ref } = ctx;
  const e = dossier.entreprise;
  const client = parId(dossier.clients, doc.clientId);
  const calc = calculer(doc, e);

  return el(
    "div.doc",
    tete(e, doc),
    parties(e, doc, client),
    doc.objet
      ? el("div.doc__objet", el("strong", "Objet"), doc.objet)
      : null,
    tableau(doc, calc, e),
    bas(doc, calc, e),
    mentions(ref, e, doc, calc),
    doc.kind === "devis" ? signature(ref, calc) : null,
    el("div.doc__pied", piedDePage(e))
  );
}

/* ================================ En-tete ================================= */

function tete(e, doc) {
  return el(
    "div.doc__tete",
    el(
      "div",
      e.logo ? el("img.doc__logo", { src: e.logo, alt: "" }) : null,
      el(
        "div.doc__emetteur",
        el("strong", e.nom || "Votre entreprise"),
        e.forme ? el("div", e.forme) : null,
        e.adresse ? el("div", e.adresse) : null,
        el("div", [e.cp, e.ville].filter(Boolean).join(" ")),
        e.tel ? el("div", `Tél. ${e.tel}`) : null,
        e.email ? el("div", e.email) : null,
        e.siret ? el("div", `SIRET ${e.siret}`) : null,
        e.assujettiTva && e.tvaIntra ? el("div", `TVA ${e.tvaIntra}`) : null
      )
    ),
    el(
      "div",
      el("div.doc__titre", NOMS[doc.kind] || "Document"),
      el("div.doc__numero", doc.numero || "— brouillon —"),
      el(
        "div.doc__dates",
        el("div", `Établi le ${dateLongue(doc.date)}`),
        doc.echeance
          ? el(
              "div",
              doc.kind === "devis"
                ? `Valable jusqu'au ${dateLongue(doc.echeance)}`
                : `Échéance : ${dateLongue(doc.echeance)}`
            )
          : null
      )
    )
  );
}

function parties(e, doc, client) {
  return el(
    "div.doc__parties",
    el(
      "div.doc__bloc",
      el("div.doc__bloc-titre", doc.kind === "devis" ? "Devis établi pour" : "Facturé à"),
      client
        ? adresseLignes(client).map((l) => el("div", l))
        : el("div", "Client non renseigné"),
      client?.tel ? el("div", `Tél. ${client.tel}`) : null
    ),
    doc.chantier
      ? el(
          "div.doc__bloc",
          el("div.doc__bloc-titre", "Adresse du chantier"),
          doc.chantier.split("\n").map((l) => el("div", l))
        )
      : null
  );
}

/* ================================ Tableau ================================= */

function tableau(doc, calc, e) {
  const assujetti = e.assujettiTva !== false;

  const enTete = el(
    "thead",
    el(
      "tr",
      el("th", "Désignation"),
      el("th.num", "Qté"),
      el("th", "Unité"),
      el("th.num", "P.U. HT"),
      assujetti ? el("th.num", "TVA") : null,
      el("th.num", "Total HT")
    )
  );

  const corps = el(
    "tbody",
    (doc.lignes || []).map((l) => {
      if (l.type === "section") {
        return el("tr.doc__section", el("td", { colspan: assujetti ? 6 : 5 }, l.designation || ""));
      }
      if (l.type === "texte") {
        return el("tr.doc__texte", el("td", { colspan: assujetti ? 6 : 5 }, l.designation || ""));
      }

      const d = calc.detail.find((x) => x.ligne.id === l.id);
      if (!d) return null;

      return el(
        "tr",
        el(
          "td",
          l.designation || "",
          l.detail ? el("span.doc__ligne-note", l.detail) : null,
          l.remise ? el("span.doc__ligne-note", `Remise ${pourcent(l.remise)}`) : null
        ),
        el("td.num", decimal(d.quantite)),
        el("td", l.unite || ""),
        el("td.num", euros(d.pu)),
        assujetti ? el("td.num", pourcent(d.taux)) : null,
        el("td.num", euros(d.ht))
      );
    })
  );

  return el("table.doc__table", enTete, corps);
}

/* ================================= Totaux ================================= */

function bas(doc, calc, e) {
  const assujetti = e.assujettiTva !== false;

  const recapTva = assujetti && calc.tva.length
    ? el(
        "table.doc__tva",
        el("thead", el("tr", el("th", "Base HT"), el("th", "Taux"), el("th", "TVA"))),
        el(
          "tbody",
          calc.tva.map((t) =>
            el("tr", el("td", euros(t.base)), el("td", pourcent(t.taux)), el("td", euros(t.montant)))
          )
        )
      )
    : el("div", { style: { fontSize: "9.5px", color: "#6a7180" } }, assujetti ? "" : "TVA non applicable, art. 293 B du CGI");

  const lignes = [
    el("div.doc__total-ligne", el("span", "Total brut HT"), el("span", euros(calc.brutHt))),
    calc.remiseLignes
      ? el("div.doc__total-ligne", el("span", "Remises sur lignes"), el("span", `− ${euros(calc.remiseLignes)}`))
      : null,
    calc.remiseGlobale
      ? el("div.doc__total-ligne", el("span", "Remise commerciale"), el("span", `− ${euros(calc.remiseGlobale)}`))
      : null,
    el("div.doc__total-ligne", el("span", "Total HT"), el("span", euros(calc.ht))),
    assujetti
      ? el("div.doc__total-ligne", el("span", "TVA"), el("span", euros(calc.totalTva)))
      : null,
    el("div.doc__total-ligne.doc__total-ligne--ttc", el("span", "Total TTC"), el("span", euros(calc.ttc))),
    calc.acompte
      ? el("div.doc__total-ligne", el("span", "Acompte à la commande"), el("span", euros(calc.acompte)))
      : null,
    calc.acompte
      ? el("div.doc__total-ligne", el("span", "Solde à la fin des travaux"), el("span", euros(calc.soldeApresAcompte)))
      : null,
    doc.kind !== "devis" && calc.paye
      ? el("div.doc__total-ligne", el("span", "Déjà réglé"), el("span", `− ${euros(calc.paye)}`))
      : null,
    doc.kind !== "devis" && calc.paye
      ? el("div.doc__total-ligne", el("span", "Reste à payer"), el("span", euros(calc.reste)))
      : null,
  ].filter(Boolean);

  return el(
    "div",
    el("div.doc__bas", recapTva, el("div.doc__totaux", lignes)),
    // La somme en toutes lettres fait foi en cas de discordance avec les
    // chiffres. Elle n'a de sens que sur un document qui engage a payer.
    calc.ttc > 0
      ? el(
          "div",
          { style: { marginTop: "4mm", fontSize: "10px", fontStyle: "italic", color: "#4a5260" } },
          `Arrêté${doc.kind === "devis" ? " le présent devis" : " la présente facture"} à la somme de ${enLettres(calc.ttc)} TTC.`
        )
      : null
  );
}

/* ================================ Mentions ================================ */

function mentions(ref, e, doc, calc) {
  const blocs = mentionsDocument(ref.mentions, e, doc, calc);
  if (!blocs.length) return null;

  return el(
    "div.doc__mentions",
    blocs.map((b) => el("div", el("h4", b.titre), el("p", b.texte)))
  );
}

/**
 * Le cadre de signature d'un devis.
 *
 * La mention manuscrite « Bon pour accord » n'est pas une formule de politesse :
 * c'est ce qui transforme un document commercial en contrat, et c'est la
 * premiere chose que demande un assureur en cas de litige.
 */
function signature(ref, calc) {
  const att = ref.tva.attestation;
  return el(
    "div.doc__signature",
    el("strong", "Bon pour accord"),
    el(
      "div",
      { style: { marginTop: "2px" } },
      "Date, signature du client précédée de la mention manuscrite « Bon pour accord » :"
    ),
    calc.tauxReduit ? el("div", { style: { marginTop: "6px", fontSize: "9px" } }, att.mention) : null
  );
}

/**
 * Lance l'impression.
 *
 * Rien de plus que `window.print()` : la feuille de style d'impression a deja
 * masque tout ce qui n'est pas le document. Le message rappelle les deux
 * reglages a poser une fois dans la boite de dialogue — sans les graphiques
 * d'arriere-plan, les en-tetes de tableau sortent blancs sur blanc.
 */
export function imprimer(ctx) {
  ctx.toast(
    "Dans la fenêtre d'impression : marges « aucune » et graphiques d'arrière-plan activés. Choisissez « Enregistrer au format PDF » pour l'envoyer par mail.",
    { duree: 6000 }
  );
  setTimeout(() => window.print(), 350);
}

export { estChiffree, nomClient };
