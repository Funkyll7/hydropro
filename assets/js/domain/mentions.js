/**
 * mentions.js — les mentions legales imprimees, et les modeles de relance.
 *
 * Le principe est simple et il tient a une regle : UN PARAGRAPHE DONT UNE
 * DONNEE MANQUE NE S'IMPRIME PAS. Une facture qui affiche « SIRET :
 * {{siret}} », ou pire « Assurance décennale souscrite auprès de undefined »,
 * est plus dommageable qu'une facture a laquelle il manque une ligne :
 * la premiere prouve que personne n'a relu, la seconde se corrige.
 *
 * L'ecran de verification, lui, liste separement ce qui manque — c'est la
 * qu'on le dit, pas sur le document du client.
 */

import { euros, dateCourte, pourcent } from "../core/format.js";
import { nomClient } from "./documents.js";

/** Les valeurs que les {{jetons}} peuvent prendre, tirees de la fiche entreprise. */
function jetons(entreprise, doc, calc) {
  return {
    nomEntreprise: entreprise.nom,
    siret: entreprise.siret,
    assureur: entreprise.assureur,
    contratAssurance: entreprise.contratAssurance,
    couvertureAssurance: entreprise.couvertureAssurance,
    penalites: entreprise.penalites ? String(entreprise.penalites).replace(".", ",") : "",
    mediateur: entreprise.mediateur,
    mediateurUrl: entreprise.mediateurUrl,
    iban: entreprise.iban,
    bic: entreprise.bic,
    acompte: calc && calc.acompte > 0 ? euros(calc.acompte) : "",
  };
}

/** Remplace les jetons. Rend `null` des qu'un jeton requis est vide. */
function resoudre(bloc, valeurs) {
  for (const requis of bloc.requis || []) {
    if (!valeurs[requis]) return null;
  }
  const texte = bloc.texte.replace(/{{(\w+)}}/g, (_, cle) => valeurs[cle] ?? "");
  return { titre: bloc.titre, texte };
}

/**
 * Les mentions a imprimer au bas d'un document.
 *
 * L'ordre est celui dans lequel on les lit sur un devis d'artisan : ce qui
 * engage l'entreprise d'abord (assurances), ce qui engage le client ensuite
 * (paiement, penalites), ce qui protege le client en dernier (retractation,
 * mediation).
 */
export function mentionsDocument(mentions, entreprise, doc, calc) {
  const b = mentions.blocs;
  const v = jetons(entreprise, doc, calc);
  const sortie = [];

  const pousser = (bloc) => {
    const r = bloc && resoudre(bloc, v);
    if (r) sortie.push(r);
  };

  pousser(b.assurance);

  if (entreprise.assujettiTva === false) pousser(b.tvaFranchise);
  else if (calc.tauxReduit) pousser(b.tvaReduite);

  if (doc.kind === "devis") {
    if (calc.acompte > 0) pousser(b.acompte);
    pousser(b.dechets);
    pousser(b.retractation);
  } else {
    pousser(b.paiement);
    pousser(b.penalites);
    pousser(b.escompte);
    pousser(b.propriete);
  }

  pousser(b.mediateur);

  if (entreprise.conditions) {
    sortie.push({ titre: "Conditions particulières", texte: entreprise.conditions });
  }
  return sortie;
}

/**
 * La ligne de pied de page : l'identite legale, sur une seule ligne.
 *
 * C'est la ligne qu'on retrouve en bas de toutes les factures d'entreprise, et
 * elle porte a elle seule la moitie des mentions obligatoires.
 */
export function piedDePage(entreprise) {
  const bouts = [
    entreprise.nom,
    entreprise.forme,
    entreprise.capital ? `capital ${entreprise.capital}` : null,
    [entreprise.adresse, entreprise.cp, entreprise.ville].filter(Boolean).join(" "),
    entreprise.siret ? `SIRET ${entreprise.siret}` : null,
    entreprise.ape ? `APE ${entreprise.ape}` : null,
    entreprise.rcs ? `RCS ${entreprise.rcs}` : null,
    entreprise.assujettiTva && entreprise.tvaIntra ? `TVA ${entreprise.tvaIntra}` : null,
    entreprise.tel,
    entreprise.email,
  ].filter(Boolean);

  const ligne = bouts.join(" · ");
  return entreprise.piedDePage ? `${ligne}\n${entreprise.piedDePage}` : ligne;
}

/* ===========================================================================
   RELANCES

   Des modeles, pas des envois. L'application ne sait pas envoyer de courriel —
   elle prepare le texte, l'ouvre dans le logiciel de messagerie ou le met dans
   le presse-papier, et l'artisan relit avant d'envoyer. Un message de relance
   envoye automatiquement au mauvais client coute un client.
   ======================================================================== */

/** Remplit un modele de relance avec les donnees du document. */
export function remplirModele(modele, { dossier, doc, calc, client, rdv }) {
  const e = dossier.entreprise;
  const valeurs = {
    numero: doc?.numero || "",
    objet: doc?.objet || rdv?.titre || "",
    date: dateCourte(doc?.date),
    validite: dateCourte(doc?.echeance),
    echeance: dateCourte(doc?.echeance),
    ttc: calc ? euros(calc.ttc) : "",
    reste: calc ? euros(calc.reste) : "",
    client: client ? prenomOuNom(client) : "",
    penalites: e.penalites ? String(e.penalites).replace(".", ",") : "",
    signature: [e.responsable || e.nom, e.tel].filter(Boolean).join("\n"),
    heure: rdv ? String(rdv.debut).slice(11, 16) : "",
    adresse: rdv?.adresse || "",
    equipement: "",
    dernier: "",
  };

  return {
    objet: modele.objet.replace(/{{(\w+)}}/g, (_, c) => valeurs[c] ?? ""),
    corps: modele.corps.replace(/{{(\w+)}}/g, (_, c) => valeurs[c] ?? ""),
  };
}

/** « Monsieur Dupont » plutot que « Dupont Jean » : c'est une lettre. */
function prenomOuNom(client) {
  if (client.societe) return client.societe;
  if (client.civilite && client.nom) return `${client.civilite} ${client.nom}`;
  return nomClient(client);
}

/** Le lien `mailto:` d'une relance, prêt a ouvrir le logiciel de messagerie. */
export function lienMail(destinataire, { objet, corps }) {
  const params = new URLSearchParams({ subject: objet, body: corps });
  // `URLSearchParams` encode l'espace en « + », que les clients de messagerie
  // affichent litteralement dans le corps du message.
  return `mailto:${destinataire || ""}?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * Le texte de l'attestation de TVA a taux reduit, a faire signer.
 *
 * Elle n'a plus besoin d'un formulaire separe depuis 2023 : la mention portee
 * sur le devis ou la facture, signee par le client, suffit. Encore faut-il
 * qu'elle y figure et que le document signe soit conserve.
 */
export function attestationTva(tva) {
  return tva.attestation;
}

/** Le recapitulatif des taux, pour l'aide en ligne de l'editeur. */
export function aideTaux(tva, taux) {
  return tva.taux.find((t) => t.valeur === taux) || null;
}

/** « 10 % — travaux d'entretien et d'amélioration » */
export function libelleTaux(tva, taux) {
  const t = aideTaux(tva, taux);
  return t ? `${pourcent(t.valeur)} — ${t.nom}` : pourcent(taux);
}
