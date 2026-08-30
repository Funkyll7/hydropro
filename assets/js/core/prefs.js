/**
 * prefs.js — les reglages de ce navigateur, et eux seuls.
 *
 * Une seule cle de localStorage pour tout ce qui decrit l'APPAREIL : le theme,
 * la taille du texte, l'onglet ouvert, les filtres, la vue de l'agenda. Rien
 * de tout cela ne decrit l'entreprise — c'est la ligne de partage, et elle
 * tient en une phrase : ce qui se facture vit dans `dossier`, la facon de le
 * regarder vit ici.
 *
 * LE STOCKAGE PEUT ETRE REFUSE — navigation privee, reglage du navigateur, un
 * quota plein. Toutes les fonctions d'ici echouent alors en silence et rendent
 * la valeur par defaut. L'application marche sans memoire ; elle ne doit jamais
 * s'arreter parce qu'elle n'a pas pu en ecrire.
 */

import { CONFIG } from "../config.js";

const CLE = CONFIG.storage.prefs;

/** Tous les reglages, ou un objet vide si rien n'est lisible. */
export function lirePrefs() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) || reprendreAncienneCle() || "{}");
    // `typeof null === "object"` : sans ce test, un `null` stocke se propagerait
    // et le premier `prefs.theme` leverait.
    return brut && typeof brut === "object" ? brut : {};
  } catch {
    return {};
  }
}

/**
 * Recupere les reglages ranges sous l'ancien nom de l'application.
 * Meme logique que pour le dossier — voir CONFIG.storageAncien.
 */
function reprendreAncienneCle() {
  try {
    const ancien = localStorage.getItem(CONFIG.storageAncien.prefs);
    if (!ancien) return null;
    localStorage.setItem(CLE, ancien);
    localStorage.removeItem(CONFIG.storageAncien.prefs);
    return ancien;
  } catch {
    return null;
  }
}

/** Remplace tous les reglages. Les appelants passent par `poserReglage`. */
export function ecrirePrefs(prefs) {
  try {
    localStorage.setItem(CLE, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Un reglage booleen, avec sa valeur par defaut.
 *
 * `!== false` et non `=== true` : un reglage jamais touche est ABSENT, et
 * l'absence doit valoir le defaut.
 */
export function reglage(nom, defaut = false) {
  const v = lirePrefs()[nom];
  return v === undefined ? defaut : v === true;
}

/** Un reglage libre (chaine, nombre, objet), avec son defaut. */
export function valeur(nom, defaut = null) {
  const v = lirePrefs()[nom];
  return v === undefined ? defaut : v;
}

/** Pose un reglage sans toucher aux autres. Rend la valeur posee. */
export function poserReglage(nom, v) {
  ecrirePrefs({ ...lirePrefs(), [nom]: v });
  return v;
}
