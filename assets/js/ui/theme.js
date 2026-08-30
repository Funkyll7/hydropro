/**
 * theme.js — la palette et la taille du texte.
 *
 * Le theme est pose sur <html> par un attribut `data-theme`, lu par theme.css.
 * En mode « auto », l'attribut suit le reglage du systeme et change tout seul
 * au coucher du soleil si le telephone est regle ainsi.
 *
 * `color-scheme` est pose EN PLUS de l'attribut. Sans lui, les menus deroulants
 * natifs, les selecteurs de date et les barres de defilement restent clairs
 * dans une application sombre — trois details qui suffisent a faire paraitre
 * l'ensemble mal fini.
 */

import { el } from "../core/dom.js";
import { poserReglage, valeur } from "../core/prefs.js";

export const PALETTES = [
  {
    groupe: "Clair",
    items: [
      { cle: "clair", nom: "Clair", detail: "Bleu de plan sur fond froid", fond: "#f3f6fa", sombre: false },
      { cle: "papier", nom: "Papier", detail: "Blanc chaud, encre brune", fond: "#f3efe5", sombre: false },
      { cle: "contraste-clair", nom: "Contraste clair", detail: "Noir sur blanc, traits doublés", fond: "#ffffff", sombre: false },
    ],
  },
  {
    groupe: "Sombre",
    items: [
      { cle: "sombre", nom: "Sombre", detail: "Bleu nuit, surfaces éclaircies", fond: "#0e1219", sombre: true },
      { cle: "nuit", nom: "Nuit", detail: "Presque noir, pour les écrans OLED", fond: "#08080e", sombre: true },
      { cle: "ardoise", nom: "Ardoise", detail: "Gris neutre et cyan froid", fond: "#171a1f", sombre: true },
      { cle: "contraste-sombre", nom: "Contraste sombre", detail: "Blanc sur noir, traits doublés", fond: "#000000", sombre: true },
    ],
  },
];

const TOUTES = PALETTES.flatMap((g) => g.items);

export const TAILLES = [
  { cle: "normal", nom: "A", px: 15, aide: "Taille normale" },
  { cle: "grand", nom: "A", px: 18, aide: "Grand" },
  { cle: "tresgrand", nom: "A", px: 21, aide: "Très grand" },
  { cle: "enorme", nom: "A", px: 25, aide: "Énorme" },
];

const media = window.matchMedia("(prefers-color-scheme: dark)");

/** Le theme choisi, « auto » compris. */
export const themeChoisi = () => valeur("theme", "auto");

/** Le theme reellement applique : « auto » est resolu. */
export function themeEffectif() {
  const choisi = themeChoisi();
  if (choisi !== "auto") return choisi;
  return media.matches ? "sombre" : "clair";
}

/** Applique le theme au document, et la couleur de la barre du navigateur. */
export function appliquerTheme() {
  const theme = themeEffectif();
  const palette = TOUTES.find((p) => p.cle === theme) || TOUTES[0];
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = palette.sombre ? "dark" : "light";

  // La barre d'adresse du telephone reprend la couleur du fond : sans cela,
  // une application sombre s'ouvre avec un bandeau blanc en haut de l'ecran.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", palette.fond);
}

export function poserTheme(cle) {
  poserReglage("theme", cle);
  appliquerTheme();
}

/** Vrai si l'ecran est actuellement sombre, « auto » resolu. */
export function estSombre() {
  return TOUTES.find((p) => p.cle === themeEffectif())?.sombre === true;
}

/**
 * Bascule clair / sombre en un geste.
 *
 * Elle pose un theme EXPLICITE, et sort donc du mode automatique : c'est ce
 * qu'on veut quand on appuie sur le bouton a midi parce que le soleil tape sur
 * l'ecran. Le mode automatique reste disponible dans le tiroir, avec les sept
 * palettes ; ce bouton-ci ne fait que le raccourci des deux plus courantes.
 *
 * Il se souvient de la derniere palette sombre choisie : quelqu'un qui prefere
 * « Nuit » retombe sur « Nuit », pas sur « Sombre ».
 */
export function basculerClairSombre() {
  const choisi = themeChoisi();
  if (estSombre()) {
    poserReglage("dernierSombre", choisi === "auto" ? "sombre" : choisi);
    poserTheme(valeur("dernierClair", "clair"));
  } else {
    poserReglage("dernierClair", choisi === "auto" ? "clair" : choisi);
    poserTheme(valeur("dernierSombre", "sombre"));
  }
}

export function appliquerTaille() {
  const t = valeur("taille", "normal");
  if (t === "normal") delete document.documentElement.dataset.taille;
  else document.documentElement.dataset.taille = t;
}

export function poserTaille(cle) {
  poserReglage("taille", cle);
  appliquerTaille();
}

/** Suit le reglage du systeme tant que l'utilisateur est en « auto ». */
export function suivreSysteme() {
  media.addEventListener("change", () => {
    if (themeChoisi() === "auto") appliquerTheme();
  });
}

/* ============================ Les commandes =============================== */

/** La liste des palettes, telle qu'elle s'affiche dans la barre laterale. */
export function listeThemes(onchoix) {
  const courant = themeChoisi();

  const ligne = (cle, nom, detail, style) =>
    el(
      `button.theme${courant === cle ? ".theme--actif" : ""}`,
      { type: "button", onclick: () => onchoix(cle) },
      el(`span.theme__pastille${cle === "auto" ? ".theme__pastille--auto" : ""}`, { style }),
      el("span.theme__texte", el("span.theme__nom", nom), el("span.theme__detail", detail)),
      courant === cle ? el("span.theme__coche", "✓") : null
    );

  return el(
    "div.themes",
    el(
      "div.themes__groupe",
      el("div.themes__titre", "Automatique"),
      ligne("auto", "Suivre le système", "Clair le jour, sombre le soir")
    ),
    PALETTES.map((g) =>
      el(
        "div.themes__groupe",
        el("div.themes__titre", g.groupe),
        g.items.map((p) => ligne(p.cle, p.nom, p.detail, { background: p.fond }))
      )
    )
  );
}

/** Les quatre boutons de taille : ils MONTRENT le resultat au lieu de le nommer. */
export function listeTailles(onchoix) {
  const courant = valeur("taille", "normal");
  return el(
    "div.tailles",
    { role: "group", "aria-label": "Taille du texte" },
    TAILLES.map((t) =>
      el(
        `button.taille${courant === t.cle ? ".taille--actif" : ""}`,
        {
          type: "button",
          title: t.aide,
          "aria-label": t.aide,
          "aria-pressed": courant === t.cle,
          style: { fontSize: `${t.px}px` },
          onclick: () => onchoix(t.cle),
        },
        t.nom
      )
    )
  );
}
