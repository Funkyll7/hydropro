/**
 * icones.js — les pictogrammes, dessines a la main.
 *
 * Pas de police d'icones, pas de bibliotheque : une police d'icones ajoute une
 * requete, s'affiche en carre vide tant qu'elle n'est pas chargee, et devient
 * illisible quand le navigateur la remplace par une police de secours. Ces
 * chemins-la sont dans le fichier, donc dans le cache, donc hors ligne.
 *
 * Tous sont dessines dans une boite de 24, au trait, en `currentColor` : ils
 * prennent la couleur de leur contexte, ce qui evite d'avoir une variante par
 * palette.
 */

import { el } from "../core/dom.js";

const D = {
  accueil: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10",
  agenda: "M3.5 6.5h17v14h-17zM3.5 10.5h17M8 3.5v4M16 3.5v4",
  clients:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16.5 11.5a3 3 0 1 0 0-6M18 15.3c2 .6 3.5 2.2 3.5 4.4",
  devis: "M6 2.5h8l4.5 4.5v14H6zM14 2.5V7h4.5M9 12h7M9 16h7M9 8h3",
  factures:
    "M5 2.5h14v19l-2.3-1.6-2.3 1.6-2.4-1.6-2.3 1.6L7.3 20 5 21.5zM9 8h6M9 12h6M9 16h3",
  interventions:
    "M14.7 6.3a4 4 0 0 1 5.3 5.1l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a1.9 1.9 0 0 0-2.5-2.4M14.7 6.3 11 2.6 8 5.6l3.7 3.7",
  catalogue: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12m0 0 8.5-4.5M12 12v9",
  contrats:
    "M12 2.5 4.5 5.5v6c0 4.6 3.1 8.4 7.5 10 4.4-1.6 7.5-5.4 7.5-10v-6zM8.8 11.8l2.3 2.3 4.2-4.4",
  chiffres: "M4 20.5V4M4 20.5h16M8 17V11M12.5 17V7M17 17v-4",
  reglages:
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.5 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z",

  plus: "M12 5v14M5 12h14",
  recherche: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20.5 20.5 16 16",
  croix: "M6 6l12 12M18 6 6 18",
  crayon: "M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 6.5l3 3",
  poubelle: "M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5 7.5 21h9l1-14.5M10.5 10.5v6M13.5 10.5v6",
  copie: "M9 9h11v11.5H9zM15 9V4H4v11.5h5",
  imprimer:
    "M7 8.5V3.5h10v5M7 18.5H4.5v-7h15v7H17M7 14.5h10V21H7z",
  mail: "M3 6.5h18v11H3zM3 6.5l9 6.5 9-6.5",
  tel: "M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3c0 .8-.7 1.5-1.5 1.5A16.5 16.5 0 0 1 3 5c0-.8.7-1.5 1.5-1.5Z",
  gauche: "M14.5 5 8 12l6.5 7",
  droite: "M9.5 5 16 12l-6.5 7",
  bas: "M5.5 9.5 12 16l6.5-6.5",
  coche: "M5 12.5 10 17.5 19.5 7",
  alerte: "M12 3.5 1.8 20.5h20.4zM12 9.5V15M12 17.5v.5",
  horloge: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.4 2",
  lieu: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  flamme:
    "M12 2.5c1 5 5.5 6 5.5 11a5.5 5.5 0 1 1-11 0c0-2.4 1.5-3.7 2.5-5.5.6 1 1.3 1.5 2 1.7-.4-2.4.3-5.2 1-7.2Z",
  goutte: "M12 3.5c0 0-6 7-6 11.5a6 6 0 0 0 12 0C18 10.5 12 3.5 12 3.5Z",
  export: "M12 16V4M8 7.5 12 3.5l4 4M4.5 15v5.5h15V15",
  import: "M12 3.5v12M8 11.5l4 4 4-4M4.5 15v5.5h15V15",
  euro: "M17 6.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 17.5M4.5 10.5h8M4.5 13.5h8",
  archive: "M3.5 4.5h17v4h-17zM5 8.5v12h14v-12M9.5 12.5h5",
  etoile: "M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.9l6-.9z",
  lien: "M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  photo:
    "M3 7.5h3.8L8.2 5h7.6l1.4 2.5H21v12H3zM12 17.4a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8Z",
  chantiers: "M3.5 20.5V9.2L12 3.5l8.5 5.7v11.3M9.5 20.5v-6.2h5v6.2M3.5 20.5h17",
  lune: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  soleil:
    "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8",
  filtre: "M3.5 5.5h17l-6.5 7.5v6l-4 2v-8z",
  signature: "M3.5 17c3-6 5-1 7-4s3.5-6 6-3 3 6 4 4M3.5 20.5h17",
};

/**
 * Un pictogramme.
 *
 * `aria-hidden` par defaut : une icone qui double un texte deja lisible ne doit
 * pas etre annoncee deux fois. Un bouton qui ne porte QUE l'icone recoit un
 * `aria-label` — c'est la regle, et `champs.js` s'en charge.
 */
export function icone(nom, taille = 20) {
  const d = D[nom] || D.alerte;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", taille);
  svg.setAttribute("height", taille);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

/** Le logo de l'application, en SVG plein — la goutte et sa flamme. */
export function logo(taille = 34) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", taille);
  svg.setAttribute("height", taille);
  svg.setAttribute("aria-hidden", "true");

  const fond = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  fond.setAttribute("width", "64");
  fond.setAttribute("height", "64");
  fond.setAttribute("rx", "14");
  fond.setAttribute("fill", "var(--accent)");

  const goutte = document.createElementNS("http://www.w3.org/2000/svg", "path");
  goutte.setAttribute("d", "M32 11c0 0-13 15-13 25a13 13 0 0 0 26 0c0-10-13-25-13-25z");
  goutte.setAttribute("fill", "var(--accent-encre)");

  const flamme = document.createElementNS("http://www.w3.org/2000/svg", "path");
  flamme.setAttribute("d", "M32 25c0 5-5 6-5 11a5 5 0 0 0 10 0c0-4-3-5-5-11z");
  flamme.setAttribute("fill", "var(--cuivre)");

  svg.append(fond, goutte, flamme);
  return svg;
}

/** Le pictogramme d'un type de rendez-vous. */
export function iconeType(type) {
  const table = {
    depannage: "alerte",
    entretien: "flamme",
    installation: "interventions",
    visite: "devis",
    sav: "horloge",
    perso: "agenda",
  };
  return icone(table[type] || "agenda", 18);
}

/** Le pictogramme d'une famille d'equipement. */
export function iconeEquipement(categorie) {
  const table = {
    chaudiere: "flamme",
    pac: "flamme",
    "chauffe-eau": "goutte",
    cet: "goutte",
    adoucisseur: "goutte",
    clim: "flamme",
    poele: "flamme",
    vmc: "reglages",
    reseau: "goutte",
  };
  return icone(table[categorie] || "catalogue", 18);
}

/** Une pastille d'icone dans une ligne de liste. */
export function pastilleIcone(nom, variante = "") {
  return el(`div.ligne__icone${variante ? `.ligne__icone--${variante}` : ""}`, icone(nom, 18));
}
