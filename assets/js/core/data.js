/**
 * data.js — chargement des donnees de reference.
 *
 *   data/reference.json   listes fixes : types de rendez-vous, etats, unites
 *   data/tva.json         les taux, leurs conditions, l'attestation
 *   data/mentions.json    les mentions legales et les modeles de relance
 *   data/checklist.json   obligations reglementaires et check-lists terrain
 *   data/catalogue.json   le catalogue de depart, copie au premier lancement
 *
 * Ces fichiers ne changent jamais pendant une session : ils sont charges une
 * fois au demarrage et gardes en cache. Le catalogue, lui, n'est lu QU'UNE
 * SEULE FOIS dans la vie d'un dossier — apres quoi il vit dans le dossier de
 * l'artisan, avec ses prix a lui.
 */

const cache = new Map();

/**
 * La racine du site, deduite de l'emplacement de CE fichier.
 *
 * `fetch("data/…")` resout relativement a la PAGE, pas au module : la meme
 * ligne irait chercher /data/ depuis index.html et /tools/data/ depuis la page
 * de verification. Partir de `import.meta.url` rend les chemins independants
 * de la page qui charge le module — ce qui vaut aussi pour un deploiement dans
 * un sous-dossier, cas normal sur GitHub Pages.
 */
const RACINE = new URL("../../../", import.meta.url);

async function json(chemin) {
  if (cache.has(chemin)) return cache.get(chemin);
  const url = new URL(chemin, RACINE);
  const promesse = fetch(url, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
    return r.json();
  });
  cache.set(chemin, promesse);
  return promesse;
}

/** Les references communes, chargees au demarrage. */
export async function chargerReferences() {
  const [reference, tva, mentions, checklist] = await Promise.all([
    json("data/reference.json"),
    json("data/tva.json"),
    json("data/mentions.json"),
    json("data/checklist.json"),
  ]);
  return { reference, tva, mentions, checklist };
}

/**
 * Le catalogue de depart.
 *
 * Charge a la demande et non au demarrage : un dossier deja rempli n'en a plus
 * besoin, et c'est le plus gros des cinq fichiers.
 */
export async function chargerCatalogueInitial() {
  return json("data/catalogue.json");
}
