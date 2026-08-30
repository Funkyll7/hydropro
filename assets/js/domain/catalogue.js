/**
 * catalogue.js — les prestations et les fournitures, et leur marge.
 *
 * Le catalogue est ce qui fait la difference entre un devis fait en dix
 * minutes et un devis fait en une heure. Il porte trois choses : le libelle
 * exact (celui qu'on ne veut pas retaper), le prix de vente, et le prix
 * d'achat — ce dernier n'apparait JAMAIS sur un document client, il ne sert
 * qu'a savoir ou l'on gagne sa vie.
 */

import { normalise, arrondi, nombre } from "../core/format.js";
import { articleVide, ligneVide } from "./dossier.js";
import { id } from "../core/store.js";

/** Copie le catalogue de depart dans le dossier, au premier lancement. */
export function installerCatalogue(dossier, brut) {
  dossier.catalogue = (brut.articles || []).map((a) => articleVide(a));
  dossier.meta.catalogueCharge = true;
  return dossier;
}

/** Recherche libre : reference, designation, detail, categorie. */
export function chercher(catalogue, requete, kind = null) {
  const q = normalise(requete);
  return catalogue
    .filter((a) => !kind || a.kind === kind)
    .filter((a) => {
      if (!q) return true;
      return [a.ref, a.designation, a.detail, a.categorie].some((c) => normalise(c).includes(q));
    })
    .sort((a, b) => {
      // Les favoris d'abord : ce sont les lignes qu'on pose sur trois devis
      // sur quatre, et les chercher a chaque fois use.
      if (a.favori !== b.favori) return a.favori ? -1 : 1;
      return normalise(a.designation).localeCompare(normalise(b.designation));
    });
}

/** Les categories presentes, avec leur effectif. */
export function categories(catalogue, kind = null) {
  const compte = new Map();
  for (const a of catalogue) {
    if (kind && a.kind !== kind) continue;
    compte.set(a.categorie || "Divers", (compte.get(a.categorie || "Divers") || 0) + 1);
  }
  return [...compte.entries()]
    .map(([nom, n]) => ({ nom, n }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

/**
 * Transforme un article du catalogue en ligne de document.
 *
 * La ligne est une COPIE : changer le prix du catalogue demain ne doit pas
 * modifier un devis deja envoye. C'est la meme regle que pour les clients dans
 * les documents, et elle a la meme raison — un document parti est fige.
 */
export function ligneDepuisArticle(article, quantite = 1) {
  return ligneVide({
    id: id("lg"),
    type: article.kind === "fourniture" ? "fourniture" : "presta",
    ref: article.ref,
    designation: article.designation,
    detail: article.detail || "",
    quantite,
    unite: article.unite || "u",
    pu: nombre(article.pu, 0),
    tva: nombre(article.tva, 10),
    remise: 0,
  });
}

/** La marge d'un article, en euros et en pourcentage du prix de vente. */
export function marge(article) {
  const pv = nombre(article.pu, 0);
  const pa = nombre(article.achat, 0);
  if (!pa || !pv) return null;
  const brut = arrondi(pv - pa);
  return {
    brut,
    taux: Math.round((brut / pv) * 100),
    /** Le coefficient multiplicateur, la facon dont les fournisseurs en parlent. */
    coef: arrondi(pv / pa, 2),
  };
}

/**
 * Les articles dont la marge est anormale.
 *
 * Sous 15 %, on travaille pour le fournisseur ; au-dessus de 70 % sur une
 * fourniture, il y a probablement une erreur de saisie du prix d'achat. Dans
 * les deux cas, il vaut mieux le savoir avant de l'avoir pose sur trente devis.
 */
export function margesSuspectes(catalogue) {
  return catalogue
    .map((a) => ({ article: a, marge: marge(a) }))
    .filter((x) => x.marge && (x.marge.taux < 15 || x.marge.taux > 70))
    .sort((a, b) => a.marge.taux - b.marge.taux);
}

/**
 * Applique une hausse a tout ou partie du catalogue.
 *
 * Les prix fournisseur bougent une a deux fois par an, et reprendre soixante
 * articles a la main est le genre de corvee qu'on repousse jusqu'a vendre a
 * perte. La hausse s'applique au prix de vente, au prix d'achat, ou aux deux.
 */
export function appliquerHausse(catalogue, { pourcent, kind = null, categorie = null, cible = "vente" }) {
  const facteur = 1 + nombre(pourcent, 0) / 100;
  let touches = 0;

  for (const a of catalogue) {
    if (kind && a.kind !== kind) continue;
    if (categorie && a.categorie !== categorie) continue;
    if (cible === "vente" || cible === "les deux") a.pu = arrondi(nombre(a.pu, 0) * facteur);
    if (cible === "achat" || cible === "les deux") a.achat = arrondi(nombre(a.achat, 0) * facteur);
    touches += 1;
  }
  return touches;
}

/**
 * Le taux horaire minimum a facturer pour couvrir ses charges.
 *
 * Le calcul est volontairement grossier — il ne remplace pas un comptable —
 * mais il repond a la question qu'aucun artisan ne se pose assez tot : « est-ce
 * que mon taux horaire couvre mes charges ? ». Les heures NON facturables
 * (devis, deplacements, administratif) sont la variable que tout le monde
 * oublie : elles representent couramment 30 % du temps.
 */
export function tauxHoraireMinimum({ chargesAnnuelles, revenuSouhaite, semainesTravaillees = 45, heuresParSemaine = 39, partNonFacturable = 30 }) {
  const heuresTotales = semainesTravaillees * heuresParSemaine;
  const heuresFacturables = heuresTotales * (1 - nombre(partNonFacturable, 0) / 100);
  if (heuresFacturables <= 0) return null;
  const besoin = nombre(chargesAnnuelles, 0) + nombre(revenuSouhaite, 0);
  return {
    heuresTotales: Math.round(heuresTotales),
    heuresFacturables: Math.round(heuresFacturables),
    taux: arrondi(besoin / heuresFacturables),
  };
}

/**
 * Les articles les plus poses, sur l'ensemble des documents.
 *
 * Ce classement sert a decider quoi mettre en favori, et a reperer les
 * prestations qu'on facture souvent au forfait alors qu'elles debordent.
 */
export function plusUtilises(dossier, limite = 10) {
  const compte = new Map();

  for (const doc of dossier.documents) {
    if (doc.statut === "brouillon") continue;
    for (const l of doc.lignes || []) {
      if (!l.ref) continue;
      const actuel = compte.get(l.ref) || { ref: l.ref, designation: l.designation, n: 0, ht: 0 };
      actuel.n += 1;
      actuel.ht = arrondi(actuel.ht + nombre(l.quantite, 0) * nombre(l.pu, 0));
      compte.set(l.ref, actuel);
    }
  }

  return [...compte.values()].sort((a, b) => b.n - a.n).slice(0, limite);
}
