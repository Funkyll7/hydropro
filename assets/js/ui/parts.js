/**
 * parts.js — les fragments partages par plusieurs ecrans.
 *
 * Une ligne de rendez-vous s'affiche a l'identique dans le tableau de bord,
 * dans l'agenda et dans la fiche client. Une ligne de document, dans la liste
 * des devis, celle des factures et la fiche client. Les ecrire une fois evite
 * qu'elles divergent — et elles divergent toujours.
 */

import { el } from "../core/dom.js";
import { etat, ligne, tag } from "./champs.js";
import { icone, iconeType, pastilleIcone } from "./icones.js";
import { creneauTexte, titreRdv } from "../domain/agenda.js";
import { calculer, statutEffectif, nomClient } from "../domain/documents.js";
import { adresseCourte } from "../domain/clients.js";
import { parId } from "../domain/dossier.js";
import { euros, dateCourte, relatif } from "../core/format.js";

/** La couleur d'un type de rendez-vous, telle que la definit data/reference.json. */
export const couleurType = (ref, type) =>
  ref.reference.typesRdv.find((t) => t.cle === type)?.couleur || "neutre";

export const nomType = (ref, type) =>
  ref.reference.typesRdv.find((t) => t.cle === type)?.nom || type;

/** L'etat d'un document, sous forme de pastille. */
export function etatDocument(ref, doc, calc) {
  const cle = statutEffectif(doc, calc);
  const table = doc.kind === "devis" ? ref.reference.statutsDevis : ref.reference.statutsFacture;
  const s = table.find((x) => x.cle === cle) || { nom: cle, couleur: "neutre" };
  return etat(s.nom, s.couleur);
}

/**
 * Une ligne de rendez-vous.
 *
 * Elle montre l'heure, le client et le lieu — les trois choses qu'on regarde
 * avant de partir. Le type est porte par la couleur de la barre ET par une
 * etiquette : la couleur seule ne se lit pas en plein soleil.
 */
export function ligneRdv(ctx, rdv, { onclick, montrerDate = false } = {}) {
  const client = parId(ctx.dossier.clients, rdv.clientId);
  const types = ctx.ref.reference.typesRdv;
  const couleur = couleurType(ctx.ref, rdv.type);

  const meta = [
    el("span", creneauTexte(rdv, types)),
    montrerDate ? el("span", relatif(rdv.debut)) : null,
    rdv.adresse || client ? el("span", rdv.adresse || adresseCourte(client)) : null,
  ].filter(Boolean);

  return ligne({
    ico: el(`div.ligne__icone${rdv.statut === "fait" ? ".ligne__icone--ok" : ""}`, iconeType(rdv.type)),
    marque: rdv.statut === "annule" ? "" : couleur,
    titre: titreRdv(rdv, client, types),
    meta,
    droite: el(
      "div.rang",
      rdv.urgent ? tag("Urgent", "cuivre") : null,
      rdv.statut === "fait" ? etat("Fait", "ok") : null,
      rdv.statut === "annule" ? etat("Annulé", "neutre") : null,
      rdv.statut === "confirme" ? etat("Confirmé", "info") : null
    ),
    onclick,
  });
}

/**
 * Une ligne de document : devis, facture ou avoir.
 *
 * Le montant affiche est le TTC pour un devis, et le RESTE DU pour une
 * facture. Ce n'est pas une incoherence : sur un devis on regarde ce qu'il
 * rapporte, sur une facture on regarde ce qui manque.
 */
export function ligneDocument(ctx, doc, { onclick } = {}) {
  const calc = calculer(doc, ctx.dossier.entreprise);
  const client = parId(ctx.dossier.clients, doc.clientId);
  const cle = statutEffectif(doc, calc);

  const marques = {
    accepte: "ok",
    payee: "ok",
    refuse: "alerte",
    retard: "alerte",
    expire: "avert",
    partielle: "avert",
    envoye: "info",
    envoyee: "info",
  };

  const montant = doc.kind === "devis" ? calc.ttc : calc.reste > 0 ? calc.reste : calc.ttc;

  return ligne({
    ico: pastilleIcone(doc.kind === "devis" ? "devis" : "factures", marques[cle] === "alerte" ? "alerte" : ""),
    marque: marques[cle] || "",
    titre: `${doc.numero || "Brouillon"}${doc.objet ? ` — ${doc.objet}` : ""}`,
    meta: [
      el("span", client ? nomClient(client) : "Sans client"),
      el("span", dateCourte(doc.date)),
      doc.kind === "avoir" ? tag("Avoir") : null,
    ].filter(Boolean),
    montant: euros(montant),
    tonMontant: cle === "retard" ? "alerte" : cle === "payee" ? "ok" : "",
    etats: etatDocument(ctx.ref, doc, calc),
    onclick,
  });
}

/**
 * Les liens d'action d'un client : appeler, ecrire, y aller.
 *
 * `tel:` et `mailto:` sont pris en charge partout ; l'itineraire passe par une
 * URL de recherche cartographique generique, que le telephone ouvre dans son
 * application de cartes par defaut. Aucun de ces liens n'envoie quoi que ce
 * soit : ils passent la main a une autre application, et c'est tout.
 */
export function actionsClient(client, adresseChantier = "") {
  const adresse = adresseChantier || adresseCourte(client);
  const liens = [];

  if (client?.tel) {
    liens.push(
      el(
        "a.btn.btn--contour.btn--petit",
        { href: `tel:${String(client.tel).replace(/\s/g, "")}` },
        icone("tel", 15),
        "Appeler"
      )
    );
  }
  if (client?.email) {
    liens.push(
      el("a.btn.btn--contour.btn--petit", { href: `mailto:${client.email}` }, icone("mail", 15), "Écrire")
    );
  }
  if (adresse) {
    liens.push(
      el(
        "a.btn.btn--contour.btn--petit",
        {
          href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(adresse)}`,
          target: "_blank",
          rel: "noopener noreferrer",
        },
        icone("lieu", 15),
        "Itinéraire"
      )
    );
  }
  return liens;
}

/** Le titre d'un document dans un fil d'Ariane : « Devis DEV-2026-0007 ». */
export function titreDocument(doc) {
  const nom = doc.kind === "devis" ? "Devis" : doc.kind === "avoir" ? "Avoir" : "Facture";
  return `${nom} ${doc.numero || "(brouillon)"}`;
}

/** Un fil d'Ariane simple : un bouton retour et un titre. */
export function retour(ctx, vers, texte) {
  return el(
    "button.btn.btn--fantome.btn--petit",
    { type: "button", onclick: () => ctx.aller(vers) },
    icone("gauche", 15),
    texte
  );
}
