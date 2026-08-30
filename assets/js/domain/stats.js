/**
 * stats.js — les chiffres de l'entreprise.
 *
 * UNE DISTINCTION COMMANDE TOUT CE FICHIER, et c'est celle qui coule les
 * artisans : le chiffre d'affaires FACTURE n'est pas l'argent ENCAISSE. On
 * peut avoir fait une bonne annee et ne pas pouvoir payer ses fournisseurs
 * parce que 18 000 € dorment chez des clients. Les deux chiffres sont donc
 * toujours donnes ensemble, jamais l'un sans l'autre.
 *
 * Deuxieme regle : les BROUILLONS NE COMPTENT PAS. Un devis non envoye et une
 * facture non validee ne sont pas du chiffre d'affaires, ce sont des
 * intentions. Les compter donne des tableaux de bord flatteurs et faux.
 */

import { arrondi, aujourdhui, nombre } from "../core/format.js";
import { calculer, statutEffectif } from "./documents.js";
import { parId } from "./dossier.js";
import { nomClient } from "./clients.js";

const moisDe = (iso) => String(iso || "").slice(0, 7);
const anneeDe = (iso) => String(iso || "").slice(0, 4);

/** Les factures et avoirs qui comptent : valides, non annules. */
function facturesReelles(dossier) {
  return dossier.documents.filter(
    (d) => d.kind !== "devis" && d.statut !== "brouillon" && d.statut !== "annulee"
  );
}

/**
 * Le chiffre d'affaires d'une periode.
 *
 * `facture` : ce qui est parti chez le client, avoirs deduits.
 * `encaisse` : ce qui est arrive sur le compte, date de paiement faisant foi.
 * `attente` : la difference, c'est-a-dire ce qu'on a travaille sans etre paye.
 */
export function chiffreAffaires(dossier, debut, fin) {
  let facture = 0;
  let encaisse = 0;
  let tvaCollectee = 0;

  for (const doc of facturesReelles(dossier)) {
    const calc = calculer(doc, dossier.entreprise);
    const signe = doc.kind === "avoir" ? -1 : 1;

    if (doc.date >= debut && doc.date <= fin) {
      facture += signe * calc.ht;
      tvaCollectee += signe * calc.totalTva;
    }
    // Les encaissements se comptent a leur propre date : une facture de
    // decembre payee en fevrier est du chiffre d'affaires de decembre et de la
    // tresorerie de fevrier.
    for (const p of doc.paiements || []) {
      if (p.date >= debut && p.date <= fin) encaisse += signe * nombre(p.montant, 0);
    }
  }

  return {
    facture: arrondi(facture),
    encaisse: arrondi(encaisse),
    tvaCollectee: arrondi(tvaCollectee),
  };
}

/** Les douze derniers mois, du plus ancien au plus recent. Pour l'histogramme. */
export function parMois(dossier, nbMois = 12, finIso = aujourdhui()) {
  const [a, m] = finIso.split("-").map(Number);
  const mois = [];

  for (let i = nbMois - 1; i >= 0; i -= 1) {
    const d = new Date(a, m - 1 - i, 1);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mois.push({ cle, libelle: d.toLocaleDateString("fr-FR", { month: "short" }), facture: 0, encaisse: 0 });
  }

  const index = new Map(mois.map((x) => [x.cle, x]));

  for (const doc of facturesReelles(dossier)) {
    const calc = calculer(doc, dossier.entreprise);
    const signe = doc.kind === "avoir" ? -1 : 1;
    const cible = index.get(moisDe(doc.date));
    if (cible) cible.facture = arrondi(cible.facture + signe * calc.ht);

    for (const p of doc.paiements || []) {
      const c = index.get(moisDe(p.date));
      if (c) c.encaisse = arrondi(c.encaisse + signe * nombre(p.montant, 0));
    }
  }

  return mois;
}

/**
 * L'encours : tout ce qui est du, reparti par anciennete.
 *
 * Le decoupage en tranches n'est pas decoratif. Une creance de moins de 30
 * jours est normale ; a plus de 90 jours, la probabilite de recouvrement
 * s'effondre, et c'est le moment de passer de la relance a la mise en demeure.
 */
export function encours(dossier, date = aujourdhui()) {
  const tranches = {
    aEchoir: { nom: "Pas encore échu", montant: 0, docs: [] },
    j30: { nom: "En retard de moins de 30 jours", montant: 0, docs: [] },
    j60: { nom: "De 30 à 60 jours", montant: 0, docs: [] },
    j90: { nom: "De 60 à 90 jours", montant: 0, docs: [] },
    plus: { nom: "Plus de 90 jours", montant: 0, docs: [] },
  };

  let total = 0;

  for (const doc of dossier.documents) {
    if (doc.kind !== "facture" || doc.statut === "brouillon" || doc.statut === "annulee") continue;
    const calc = calculer(doc, dossier.entreprise);
    if (calc.reste <= 0.004) continue;

    total += calc.reste;
    const retard = doc.echeance ? joursDepuis(doc.echeance, date) : 0;
    const cle =
      retard <= 0 ? "aEchoir" : retard <= 30 ? "j30" : retard <= 60 ? "j60" : retard <= 90 ? "j90" : "plus";
    tranches[cle].montant = arrondi(tranches[cle].montant + calc.reste);
    tranches[cle].docs.push({ doc, reste: calc.reste, retard });
  }

  return { total: arrondi(total), tranches };
}

function joursDepuis(iso, date) {
  const a = new Date(`${iso}T12:00:00`).getTime();
  const b = new Date(`${date}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Le taux de transformation des devis.
 *
 * Le chiffre le plus utile de tout le tableau de bord, et le plus ignore. En
 * dessous de 30 %, on chiffre trop haut ou on repond trop tard ; au-dessus de
 * 80 %, on chiffre probablement trop bas.
 */
export function transformation(dossier, debut, fin) {
  const devis = dossier.documents.filter(
    (d) => d.kind === "devis" && d.statut !== "brouillon" && d.date >= debut && d.date <= fin
  );

  const acceptes = devis.filter((d) => d.statut === "accepte");
  const refuses = devis.filter((d) => d.statut === "refuse");
  const attente = devis.filter((d) => statutEffectif(d) === "envoye");
  const expires = devis.filter((d) => statutEffectif(d) === "expire");

  const montant = (liste) =>
    arrondi(liste.reduce((s, d) => s + calculer(d, dossier.entreprise).ht, 0));

  const decides = acceptes.length + refuses.length;

  return {
    emis: devis.length,
    acceptes: acceptes.length,
    refuses: refuses.length,
    enAttente: attente.length,
    expires: expires.length,
    taux: decides ? Math.round((acceptes.length / decides) * 100) : null,
    montantEmis: montant(devis),
    montantAccepte: montant(acceptes),
    montantEnAttente: montant(attente),
    /** Le panier moyen : ce qu'on facture par affaire gagnee. */
    panierMoyen: acceptes.length ? arrondi(montant(acceptes) / acceptes.length) : 0,
  };
}

/** Les meilleurs clients de la periode, par chiffre d'affaires facture. */
export function topClients(dossier, debut, fin, limite = 8) {
  const parClient = new Map();

  for (const doc of facturesReelles(dossier)) {
    if (doc.date < debut || doc.date > fin) continue;
    const calc = calculer(doc, dossier.entreprise);
    const signe = doc.kind === "avoir" ? -1 : 1;
    const actuel = parClient.get(doc.clientId) || { ht: 0, nb: 0 };
    actuel.ht = arrondi(actuel.ht + signe * calc.ht);
    actuel.nb += 1;
    parClient.set(doc.clientId, actuel);
  }

  return [...parClient.entries()]
    .map(([clientId, v]) => ({
      client: parId(dossier.clients, clientId),
      nom: nomClient(parId(dossier.clients, clientId)) || "Client supprimé",
      ...v,
    }))
    .sort((a, b) => b.ht - a.ht)
    .slice(0, limite);
}

/**
 * La repartition du chiffre d'affaires par nature de ligne.
 *
 * Separer la main d'oeuvre des fournitures dit ou se fait vraiment la marge :
 * une entreprise qui fait 70 % de son chiffre en fournitures revend du
 * materiel, avec le risque de tresorerie que cela suppose.
 */
export function repartition(dossier, debut, fin) {
  let mo = 0;
  let fournitures = 0;
  let achat = 0;

  const prixAchat = new Map(dossier.catalogue.map((a) => [a.ref, nombre(a.achat, 0)]));

  for (const doc of facturesReelles(dossier)) {
    if (doc.date < debut || doc.date > fin) continue;
    const signe = doc.kind === "avoir" ? -1 : 1;
    const calc = calculer(doc, dossier.entreprise);

    for (const d of calc.detail) {
      if (d.ligne.type === "fourniture") {
        fournitures += signe * d.ht;
        const pa = prixAchat.get(d.ligne.ref);
        if (pa) achat += signe * pa * d.quantite;
      } else {
        mo += signe * d.ht;
      }
    }
  }

  const total = mo + fournitures;
  return {
    mainOeuvre: arrondi(mo),
    fournitures: arrondi(fournitures),
    achats: arrondi(achat),
    /** La marge brute sur fournitures, quand les prix d'achat sont renseignes. */
    margeFournitures: achat ? arrondi(fournitures - achat) : null,
    tauxMarge: achat && fournitures ? Math.round(((fournitures - achat) / fournitures) * 100) : null,
    partMainOeuvre: total ? Math.round((mo / total) * 100) : null,
  };
}

/**
 * La TVA collectee et deductible d'une periode.
 *
 * ATTENTION, et c'est ecrit en toutes lettres dans l'ecran : ce n'est PAS une
 * declaration de TVA. Il manque la TVA deductible sur les achats, que cette
 * application ne connait pas — elle ne gere pas les factures fournisseur. Le
 * chiffre sert a provisionner, pas a declarer.
 */
export function tvaCollectee(dossier, debut, fin) {
  const parTaux = new Map();
  let total = 0;

  for (const doc of facturesReelles(dossier)) {
    if (doc.date < debut || doc.date > fin) continue;
    const signe = doc.kind === "avoir" ? -1 : 1;
    const calc = calculer(doc, dossier.entreprise);
    for (const t of calc.tva) {
      const actuel = parTaux.get(t.taux) || { base: 0, montant: 0 };
      actuel.base = arrondi(actuel.base + signe * t.base);
      actuel.montant = arrondi(actuel.montant + signe * t.montant);
      parTaux.set(t.taux, actuel);
    }
    total += signe * calc.totalTva;
  }

  return {
    total: arrondi(total),
    parTaux: [...parTaux.entries()]
      .map(([taux, v]) => ({ taux, ...v }))
      .sort((a, b) => a.taux - b.taux),
  };
}

/** Le premier jour de l'annee en cours, et le dernier. Bornes par defaut. */
export function anneeCourante(date = aujourdhui()) {
  const a = anneeDe(date);
  return { debut: `${a}-01-01`, fin: `${a}-12-31`, annee: a };
}

/** Les bornes du mois en cours. */
export function moisCourant(date = aujourdhui()) {
  const m = moisDe(date);
  const [a, mm] = m.split("-").map(Number);
  const dernier = new Date(a, mm, 0).getDate();
  return { debut: `${m}-01`, fin: `${m}-${String(dernier).padStart(2, "0")}`, mois: m };
}
