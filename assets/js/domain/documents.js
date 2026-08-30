/**
 * documents.js — le calcul d'un devis, d'une facture ou d'un avoir.
 *
 * C'est le seul fichier de l'application ou l'on additionne de l'argent, et
 * c'est voulu : un total faux se corrige a un seul endroit.
 *
 * TROIS DECISIONS DE CALCUL, et leurs raisons.
 *
 * 1. TOUT EST ARRONDI AU CENTIME, ligne par ligne, puis taux par taux. Cumuler
 *    des flottants non arrondis donne un TTC qui differe d'un centime de la
 *    somme des lignes une fois sur trois, et c'est exactement l'ecart qu'un
 *    comptable releve.
 *
 * 2. LA REMISE GLOBALE SE REPARTIT AU PRORATA SUR CHAQUE TAUX DE TVA. Un devis
 *    qui melange 10 % (main d'oeuvre) et 20 % (chaudiere gaz) et sur lequel on
 *    accorde 5 % de geste commercial doit voir la remise reduire les deux
 *    bases dans la meme proportion. L'imputer entierement sur un seul taux
 *    change la TVA due — dans un sens ou dans l'autre.
 *
 * 3. L'ENTREPRISE EN FRANCHISE EN BASE NE VOIT JAMAIS DE TVA. Pas un champ,
 *    pas une colonne, pas une ligne de total. Une facture en franchise sur
 *    laquelle apparaitrait un montant de TVA rendrait cette TVA due.
 */

import { arrondi, aujourdhui, ajouteJours, joursEntre, nombre } from "../core/format.js";
import { documentVide, ligneVide, parId } from "./dossier.js";
import { attribuerNumero } from "./numerotation.js";
import { id } from "../core/store.js";

/** Les types de ligne qui portent un montant. Les autres ne sont que du texte. */
const LIGNES_CHIFFREES = new Set(["presta", "fourniture"]);

export const estChiffree = (ligne) => LIGNES_CHIFFREES.has(ligne.type);

/**
 * Le calcul complet d'un document.
 *
 * Rend un objet fige, sans effet de bord : le document n'est jamais modifie.
 * Toutes les vues, y compris l'impression, lisent le meme resultat.
 */
export function calculer(doc, entreprise = {}) {
  const assujetti = entreprise.assujettiTva !== false;
  const lignes = (doc.lignes || []).filter(estChiffree);

  const detail = lignes.map((l) => {
    const quantite = nombre(l.quantite, 0);
    const pu = nombre(l.pu, 0);
    const brut = arrondi(quantite * pu);
    const remise = arrondi((brut * nombre(l.remise, 0)) / 100);
    const ht = arrondi(brut - remise);
    return { ligne: l, quantite, pu, brut, remise, ht, taux: assujetti ? nombre(l.tva, 0) : 0 };
  });

  const brutHt = arrondi(detail.reduce((s, d) => s + d.brut, 0));
  const remiseLignes = arrondi(detail.reduce((s, d) => s + d.remise, 0));
  const htAvantGlobale = arrondi(brutHt - remiseLignes);

  const remiseGlobale = montantRemiseGlobale(doc, htAvantGlobale);
  const ht = arrondi(htAvantGlobale - remiseGlobale);

  // Le coefficient de la remise globale. Il vaut 1 s'il n'y a pas de remise, et
  // 0 si tout le document est offert — cas qui existe (geste commercial total
  // apres un SAV) et qui ne doit pas donner une division par zero.
  const coef = htAvantGlobale > 0 ? ht / htAvantGlobale : 0;

  const parTaux = new Map();
  for (const d of detail) {
    if (!parTaux.has(d.taux)) parTaux.set(d.taux, 0);
    parTaux.set(d.taux, parTaux.get(d.taux) + d.ht);
  }

  const tva = [...parTaux.entries()]
    .filter(([taux, base]) => base !== 0 || taux !== 0)
    .map(([taux, base]) => {
      const baseNette = arrondi(base * coef);
      return { taux, base: baseNette, montant: arrondi((baseNette * taux) / 100) };
    })
    .sort((a, b) => a.taux - b.taux);

  const totalTva = assujetti ? arrondi(tva.reduce((s, t) => s + t.montant, 0)) : 0;
  const ttc = arrondi(ht + totalTva);

  const acompte = montantAcompte(doc, ttc);
  const paye = arrondi((doc.paiements || []).reduce((s, p) => s + nombre(p.montant, 0), 0));
  const reste = arrondi(ttc - paye);

  return {
    assujetti,
    detail,
    brutHt,
    remiseLignes,
    remiseGlobale,
    ht,
    tva,
    totalTva,
    ttc,
    acompte,
    soldeApresAcompte: arrondi(ttc - acompte),
    paye,
    reste,
    /** Vrai des qu'un taux reduit est employe : declenche la mention d'attestation. */
    tauxReduit: assujetti && tva.some((t) => t.taux > 0 && t.taux < 20),
  };
}

function montantRemiseGlobale(doc, base) {
  const r = doc.remiseGlobale || {};
  const v = nombre(r.valeur, 0);
  if (v <= 0) return 0;
  const brut = r.type === "euro" ? v : (base * v) / 100;
  return arrondi(Math.min(brut, base));
}

function montantAcompte(doc, ttc) {
  const a = doc.acompte || {};
  const v = nombre(a.valeur, 0);
  if (v <= 0) return 0;
  const brut = a.type === "euro" ? v : (ttc * v) / 100;
  return arrondi(Math.min(brut, ttc));
}

/* ===========================================================================
   ETATS

   Le statut STOCKE dit ce que l'artisan a decide : brouillon, envoye, accepte.
   Le statut EFFECTIF ajoute ce que le calendrier impose : un devis envoye dont
   la validite est passee est expire, une facture envoyee dont l'echeance est
   passee est en retard. Ces deux-la ne sont jamais ecrits dans le dossier —
   ils se recalculent, sinon il faudrait balayer tous les documents chaque
   matin pour les mettre a jour.
   ======================================================================== */

export function statutEffectif(doc, calc = null, date = aujourdhui()) {
  if (doc.kind === "devis") {
    if (doc.statut !== "envoye") return doc.statut;
    if (doc.echeance && doc.echeance < date) return "expire";
    return "envoye";
  }

  if (doc.statut === "brouillon" || doc.statut === "annulee") return doc.statut;

  const c = calc || { ttc: 0, paye: 0, reste: 0 };
  if (c.reste <= 0.004 && c.ttc > 0) return "payee";
  if (c.paye > 0) return "partielle";
  if (doc.echeance && doc.echeance < date) return "retard";
  return doc.statut;
}

/** Les jours de retard d'une facture. 0 si elle n'est pas en retard. */
export function joursRetard(doc, date = aujourdhui()) {
  if (doc.kind !== "facture" || !doc.echeance) return 0;
  const n = joursEntre(doc.echeance, date);
  return n > 0 ? n : 0;
}

/** Les jours restants avant expiration d'un devis. Negatif s'il est expire. */
export function joursAvantExpiration(doc, date = aujourdhui()) {
  if (doc.kind !== "devis" || !doc.echeance) return null;
  return joursEntre(date, doc.echeance);
}

/**
 * Les penalites de retard dues sur une facture, au taux annuel de l'entreprise.
 *
 * Elles sont dues de plein droit, sans rappel, des le lendemain de l'echeance.
 * On ne les ajoute PAS automatiquement au total : les reclamer est une
 * decision commerciale, pas un calcul. L'application se contente de dire
 * combien elles font, ce qui est deja plus que ce que sait la plupart des
 * artisans le jour ou ils en ont besoin.
 */
export function penalites(doc, calc, entreprise, date = aujourdhui()) {
  const jours = joursRetard(doc, date);
  if (!jours || calc.reste <= 0) return { jours, montant: 0, indemnite: 0 };
  const taux = nombre(entreprise.penalites, 0) / 100;
  return {
    jours,
    montant: arrondi((calc.reste * taux * jours) / 365),
    /** L'indemnite forfaitaire de recouvrement, due uniquement entre professionnels. */
    indemnite: 40,
  };
}

/* ===========================================================================
   TRANSFORMATIONS
   ======================================================================== */

/**
 * Fabrique la facture d'un devis accepte.
 *
 * Les lignes sont COPIEES, pas partagees : modifier la facture ensuite ne doit
 * pas reecrire le devis signe par le client. C'est le devis qui fait foi sur ce
 * qui a ete accepte, et il doit rester tel qu'il etait ce jour-la.
 */
export function factureDepuisDevis(dossier, devis) {
  const entreprise = dossier.entreprise;
  const date = aujourdhui();
  return documentVide("facture", {
    numero: "",
    clientId: devis.clientId,
    date,
    echeance: ajouteJours(date, nombre(entreprise.delaiPaiement, 30)),
    objet: devis.objet,
    chantier: devis.chantier,
    lignes: devis.lignes.map((l) => ({ ...l, id: id("lg") })),
    remiseGlobale: { ...devis.remiseGlobale },
    acompte: { type: "pourcent", valeur: 0 },
    devisSource: devis.id,
    conditions: devis.conditions,
    statut: "brouillon",
  });
}

/**
 * La facture d'acompte d'un devis accepte.
 *
 * Une seule ligne, sans TVA propre : elle reprend le taux dominant du devis.
 * L'acompte n'est pas une prestation, c'est une avance ; la reprendre en une
 * ligne unique evite de facturer deux fois les memes lignes au moment du solde.
 */
export function factureAcompte(dossier, devis) {
  const calc = calculer(devis, dossier.entreprise);
  const montant = calc.acompte || arrondi(calc.ttc * 0.3);
  const taux = calc.tva.length ? calc.tva[calc.tva.length - 1].taux : 0;
  // On facture un TTC connu : la ligne est saisie en HT pour que le TTC tombe
  // juste, sinon l'acompte annonce au client ne correspond pas a la facture.
  const ht = arrondi(montant / (1 + taux / 100));
  const date = aujourdhui();

  return documentVide("facture", {
    clientId: devis.clientId,
    date,
    echeance: ajouteJours(date, nombre(dossier.entreprise.delaiPaiement, 30)),
    objet: `Acompte sur devis ${devis.numero}${devis.objet ? ` — ${devis.objet}` : ""}`,
    chantier: devis.chantier,
    lignes: [
      ligneVide({
        type: "presta",
        designation: `Acompte à la commande sur le devis ${devis.numero}`,
        detail: devis.objet,
        quantite: 1,
        unite: "forfait",
        pu: ht,
        tva: taux,
      }),
    ],
    devisSource: devis.id,
    statut: "brouillon",
  });
}

/**
 * La facture de solde : le devis complet, moins l'acompte deja facture.
 *
 * La ligne de deduction est NEGATIVE et porte le meme taux que l'acompte, sans
 * quoi la TVA serait comptee deux fois sur la meme somme.
 */
export function factureSolde(dossier, devis, acomptes = []) {
  const facture = factureDepuisDevis(dossier, devis);
  const deja = arrondi(
    acomptes.reduce((s, f) => s + calculer(f, dossier.entreprise).ttc, 0)
  );
  if (deja > 0) {
    const calc = calculer(devis, dossier.entreprise);
    const taux = calc.tva.length ? calc.tva[calc.tva.length - 1].taux : 0;
    facture.lignes.push(
      ligneVide({
        type: "presta",
        designation: `Déduction des acomptes déjà facturés (${acomptes
          .map((f) => f.numero)
          .filter(Boolean)
          .join(", ")})`,
        quantite: 1,
        unite: "forfait",
        pu: -arrondi(deja / (1 + taux / 100)),
        tva: taux,
      })
    );
  }
  facture.objet = `Solde — ${devis.objet || devis.numero}`;
  return facture;
}

/**
 * L'avoir qui annule une facture.
 *
 * C'est la SEULE facon correcte d'annuler une facture deja emise : on ne la
 * supprime pas, on ne la modifie pas, on emet un document de sens contraire
 * qui la neutralise. La piste reste verifiable dans les deux sens.
 */
export function avoirDepuisFacture(dossier, facture) {
  const date = aujourdhui();
  return documentVide("facture", {
    kind: "avoir",
    clientId: facture.clientId,
    date,
    echeance: date,
    objet: `Avoir sur facture ${facture.numero}`,
    chantier: facture.chantier,
    lignes: facture.lignes.map((l) => ({
      ...l,
      id: id("lg"),
      pu: estChiffree(l) ? -nombre(l.pu, 0) : l.pu,
    })),
    remiseGlobale: { ...facture.remiseGlobale },
    factureSource: facture.id,
    statut: "brouillon",
  });
}

/** Le devis d'une intervention : reprend ses lignes telles quelles. */
export function documentDepuisIntervention(dossier, intervention, kind = "facture") {
  const date = aujourdhui();
  return documentVide(kind, {
    clientId: intervention.clientId,
    date,
    echeance:
      kind === "facture"
        ? ajouteJours(date, nombre(dossier.entreprise.delaiPaiement, 30))
        : ajouteJours(date, nombre(dossier.entreprise.validiteDevis, 30)),
    objet: intervention.motif || "Intervention",
    lignes: intervention.lignes.map((l) => ({ ...l, id: id("lg") })),
    interventionId: intervention.id,
    notes: [intervention.diagnostic, intervention.travaux].filter(Boolean).join("\n\n"),
    statut: "brouillon",
  });
}

/**
 * Valide un document : lui donne son numero et le fait passer a « envoye ».
 *
 * Le passage par cette fonction est ce qui garantit qu'aucune facture validee
 * ne circule sans numero, et qu'aucun numero n'est attribue deux fois.
 * Modifie le dossier (compteurs) : l'appelant enregistre derriere.
 */
export function valider(dossier, doc) {
  if (!doc.numero) {
    doc.numero = attribuerNumero(dossier, doc.kind, doc.date);
  }
  doc.statut = doc.kind === "devis" ? "envoye" : "envoyee";
  doc.envoyeLe = aujourdhui();
  return doc;
}

/* ===========================================================================
   PAIEMENTS
   ======================================================================== */

export function ajouterPaiement(doc, { montant, date, moyen, note }) {
  doc.paiements = doc.paiements || [];
  doc.paiements.push({
    id: id("pay"),
    date: date || aujourdhui(),
    montant: arrondi(nombre(montant, 0)),
    moyen: moyen || "virement",
    note: note || "",
  });
  doc.paiements.sort((a, b) => a.date.localeCompare(b.date));
  return doc;
}

export function supprimerPaiement(doc, paiementId) {
  doc.paiements = (doc.paiements || []).filter((p) => p.id !== paiementId);
  return doc;
}

/* ===========================================================================
   VERIFICATIONS AVANT ENVOI

   Ce que la loi exige et que l'artisan oublie. La liste est rendue a la vue,
   qui l'affiche en clair : mieux vaut un rappel avant l'envoi qu'une amende
   apres un controle.
   ======================================================================== */

export function manques(dossier, doc, calc) {
  const e = dossier.entreprise;
  const m = [];

  if (!doc.clientId) m.push("Aucun client n'est rattaché au document.");
  if (!calc.detail.length) m.push("Le document ne contient aucune ligne chiffrée.");
  if (!e.nom) m.push("Le nom de l'entreprise manque dans les réglages.");
  if (!e.adresse || !e.ville) m.push("L'adresse de l'entreprise manque dans les réglages.");
  if (!e.siret) m.push("Le numéro SIRET manque : il est obligatoire sur tout devis et toute facture.");
  if (e.assujettiTva && !e.tvaIntra) m.push("Le numéro de TVA intracommunautaire manque.");
  if (!e.assureur || !e.contratAssurance) {
    m.push("L'assurance décennale manque : elle est obligatoire sur les documents de travaux du bâtiment.");
  }
  if (!doc.echeance) {
    m.push(doc.kind === "devis" ? "La durée de validité du devis manque." : "La date d'échéance manque.");
  }
  if (doc.kind === "facture" && !e.penalites) {
    m.push("Le taux des pénalités de retard manque dans les réglages.");
  }
  if (!e.mediateur) {
    m.push("Le médiateur de la consommation manque : obligatoire dès qu'on travaille pour des particuliers.");
  }
  return m;
}

/* ===========================================================================
   RECHERCHE ET TRI
   ======================================================================== */

/** Les documents d'un client, du plus recent au plus ancien. */
export function documentsDuClient(dossier, clientId, kind = null) {
  return dossier.documents
    .filter((d) => d.clientId === clientId && (!kind || d.kind === kind))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Les factures d'acompte deja emises sur un devis. */
export function acomptesDuDevis(dossier, devisId) {
  return dossier.documents.filter(
    (d) => d.kind === "facture" && d.devisSource === devisId && d.statut !== "annulee"
  );
}

/** Le libelle court d'un document, pour une liste ou un lien. */
export function libelle(dossier, doc) {
  const client = parId(dossier.clients, doc.clientId);
  const nom = client ? nomClient(client) : "Sans client";
  return `${doc.numero || "Brouillon"} — ${nom}`;
}

/** « Dupont Jean » ou « SARL Martin » selon le type de client. */
export function nomClient(client) {
  if (!client) return "";
  if (client.societe) return client.societe;
  return [client.nom, client.prenom].filter(Boolean).join(" ") || "Client sans nom";
}
