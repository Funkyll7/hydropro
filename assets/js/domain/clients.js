/**
 * clients.js — le fichier clients : recherche, adresses, historique, valeur.
 *
 * Un client n'est jamais supprime tant qu'un document le cite : une facture
 * sans client est une facture invalide, et la loi impose de la conserver dix
 * ans. On ARCHIVE, ce qui le sort des listes sans toucher a son passe.
 */

import { normalise, arrondi, aujourdhui, joursEntre } from "../core/format.js";
import { calculer, nomClient, statutEffectif } from "./documents.js";

export { nomClient };

/** « 12 rue des Lilas, 69100 Villeurbanne » — sur une ligne. */
export function adresseCourte(client) {
  if (!client) return "";
  return [client.adresse, [client.cp, client.ville].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

/** L'adresse sur plusieurs lignes, telle qu'elle s'imprime sur un document. */
export function adresseLignes(client) {
  if (!client) return [];
  return [
    client.societe || null,
    client.societe ? [client.civilite, client.prenom, client.nom].filter(Boolean).join(" ") : null,
    !client.societe ? [client.civilite, client.prenom, client.nom].filter(Boolean).join(" ") : null,
    client.adresse,
    client.complement,
    [client.cp, client.ville].filter(Boolean).join(" "),
  ].filter((l) => l && l.trim());
}

/**
 * Cherche dans tout ce qui identifie un client.
 *
 * Le telephone est compare SANS ses espaces : on le tape « 0612345678 » alors
 * qu'il est enregistre « 06 12 34 56 78 », et la recherche ne trouvait rien.
 */
export function correspond(client, requete) {
  const q = normalise(requete);
  if (!q) return true;
  const telNu = String(client.tel || "").replace(/\D/g, "");
  const tel2Nu = String(client.tel2 || "").replace(/\D/g, "");
  const qNu = q.replace(/\D/g, "");

  const champs = [
    client.nom,
    client.prenom,
    client.societe,
    client.ville,
    client.cp,
    client.email,
    client.adresse,
    client.notes,
    (client.tags || []).join(" "),
    ...(client.equipements || []).map((e) => `${e.marque} ${e.modele} ${e.numeroSerie}`),
  ];

  if (champs.some((c) => normalise(c).includes(q))) return true;
  return qNu.length >= 3 && (telNu.includes(qNu) || tel2Nu.includes(qNu));
}

/**
 * Ce que le client a rapporte, et ce qu'il doit.
 *
 * `facture` compte tout ce qui est parti, avoirs deduits ; `encaisse` ce qui
 * est rentre ; `du` ce qui manque. Les brouillons sont exclus : ils ne sont
 * rien tant qu'ils ne sont pas envoyes.
 */
export function bilan(dossier, clientId) {
  const docs = dossier.documents.filter((d) => d.clientId === clientId);
  let facture = 0;
  let encaisse = 0;
  let du = 0;
  let enRetard = 0;
  let devisEnAttente = 0;

  for (const doc of docs) {
    const calc = calculer(doc, dossier.entreprise);
    if (doc.kind === "devis") {
      if (statutEffectif(doc, calc) === "envoye") devisEnAttente += 1;
      continue;
    }
    if (doc.statut === "brouillon" || doc.statut === "annulee") continue;

    const signe = doc.kind === "avoir" ? -1 : 1;
    facture += signe * calc.ttc;
    encaisse += signe * calc.paye;
    if (doc.kind === "facture") {
      du += calc.reste;
      if (statutEffectif(doc, calc) === "retard") enRetard += calc.reste;
    }
  }

  return {
    facture: arrondi(facture),
    encaisse: arrondi(encaisse),
    du: arrondi(du),
    enRetard: arrondi(enRetard),
    devisEnAttente,
    nbDocuments: docs.length,
  };
}

/**
 * Les mauvais payeurs : le retard moyen constate sur les factures soldees.
 *
 * Ce chiffre-la change la facon dont on redige une relance, et dont on decide
 * si l'on demande un acompte au prochain chantier.
 */
export function retardMoyen(dossier, clientId) {
  const payees = dossier.documents.filter(
    (d) => d.clientId === clientId && d.kind === "facture" && d.echeance && (d.paiements || []).length
  );
  if (!payees.length) return null;
  const retards = payees.map((d) => {
    const dernier = d.paiements[d.paiements.length - 1].date;
    return joursEntre(d.echeance, dernier);
  });
  return Math.round(retards.reduce((s, r) => s + r, 0) / retards.length);
}

/** Le dernier passage chez ce client, tous rendez-vous confondus. */
export function dernierPassage(dossier, clientId) {
  const faits = dossier.rdv
    .filter((r) => r.clientId === clientId && r.statut === "fait")
    .map((r) => r.debut)
    .sort();
  return faits.length ? faits[faits.length - 1].slice(0, 10) : null;
}

/** Le prochain rendez-vous prevu chez ce client. */
export function prochainPassage(dossier, clientId, date = aujourdhui()) {
  const aVenir = dossier.rdv
    .filter((r) => r.clientId === clientId && r.statut !== "annule" && r.debut.slice(0, 10) >= date)
    .map((r) => r.debut)
    .sort();
  return aVenir.length ? aVenir[0] : null;
}

/**
 * Peut-on supprimer ce client ?
 *
 * Non des qu'un document, un rendez-vous, une intervention ou un contrat le
 * cite. La fonction rend la liste des raisons, que la vue affiche telle
 * quelle : « impossible » sans motif est la pire des reponses.
 */
export function raisonsDeGarder(dossier, clientId) {
  const raisons = [];
  const docs = dossier.documents.filter((d) => d.clientId === clientId);
  const devis = docs.filter((d) => d.kind === "devis").length;
  const factures = docs.filter((d) => d.kind !== "devis").length;
  const rdv = dossier.rdv.filter((r) => r.clientId === clientId).length;
  const contrats = dossier.contrats.filter((c) => c.clientId === clientId).length;
  const inters = dossier.interventions.filter((i) => i.clientId === clientId).length;

  if (factures) raisons.push(`${factures} facture${factures > 1 ? "s" : ""} — à conserver 10 ans`);
  if (devis) raisons.push(`${devis} devis`);
  if (rdv) raisons.push(`${rdv} rendez-vous`);
  if (inters) raisons.push(`${inters} intervention${inters > 1 ? "s" : ""}`);
  if (contrats) raisons.push(`${contrats} contrat${contrats > 1 ? "s" : ""} d'entretien`);
  return raisons;
}

/** Trie une liste de clients selon le critere demande. */
export function trier(clients, dossier, critere = "nom") {
  const copie = [...clients];
  if (critere === "recent") {
    return copie.sort((a, b) => (dernierPassage(dossier, b.id) || "").localeCompare(dernierPassage(dossier, a.id) || ""));
  }
  if (critere === "ca") {
    return copie.sort((a, b) => bilan(dossier, b.id).facture - bilan(dossier, a.id).facture);
  }
  if (critere === "ville") {
    return copie.sort((a, b) => normalise(a.ville).localeCompare(normalise(b.ville)) || normalise(nomClient(a)).localeCompare(normalise(nomClient(b))));
  }
  return copie.sort((a, b) => normalise(nomClient(a)).localeCompare(normalise(nomClient(b))));
}

/**
 * Les doublons probables du fichier.
 *
 * Meme telephone, ou meme nom a la meme adresse. Un fichier client qui grossit
 * au fil des depannages en accumule vite, et on ne s'en apercoit qu'en
 * cherchant un historique qui se trouve sous l'autre fiche.
 */
export function doublonsProbables(dossier) {
  const parTel = new Map();
  const paires = [];

  for (const c of dossier.clients) {
    const tel = String(c.tel || "").replace(/\D/g, "");
    if (tel.length >= 9) {
      if (parTel.has(tel)) paires.push([parTel.get(tel), c, "même téléphone"]);
      else parTel.set(tel, c);
    }
  }

  const parNomAdresse = new Map();
  for (const c of dossier.clients) {
    const cle = `${normalise(nomClient(c))}|${normalise(c.adresse)}`;
    if (!normalise(c.adresse)) continue;
    if (parNomAdresse.has(cle)) paires.push([parNomAdresse.get(cle), c, "même nom et adresse"]);
    else parNomAdresse.set(cle, c);
  }

  return paires;
}
