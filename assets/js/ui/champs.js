/**
 * champs.js — tous les controles de l'application, et eux seuls.
 *
 * Aucune vue ne fabrique un <input> elle-meme. C'est ce qui garantit qu'un
 * champ montant se comporte partout pareil : chasse fixe, aligne a droite,
 * clavier numerique sur telephone, virgule acceptee.
 *
 * LE PIEGE DU RE-RENDU. Cette application se re-rend a chaque changement de
 * structure. Si un champ texte declenchait un re-rendu a chaque frappe, le
 * curseur sauterait et la saisie serait impossible. La regle est donc :
 *   - `oninput`  : la vue met a jour le dossier SANS re-rendre (saisie libre) ;
 *   - `onchange` : au moment ou le champ perd le focus, la vue peut re-rendre.
 * Les controles qui n'ont pas de curseur — cases, segments, selecteurs — n'ont
 * pas ce probleme et re-rendent immediatement.
 */

import { el } from "../core/dom.js";
import { icone } from "./icones.js";
import { nombre, decimal } from "../core/format.js";

/* ================================ Boutons ================================= */

/**
 * Un bouton.
 *
 * Le libelle est enveloppe dans un <span> plutot que pose en texte nu, et le
 * bouton porte son libelle en `aria-label` des qu'il a un pictogramme. Les deux
 * servent la meme chose : sur telephone, l'en-tete de page masque ces libelles
 * pour ne garder que les icones — sans le span il n'y aurait rien a masquer,
 * et sans l'`aria-label` le bouton deviendrait muet pour un lecteur d'ecran.
 */
export function bouton(texte, options = {}) {
  const { variante = "contour", ico = null, onclick, titre, disabled, type = "button", petit } = options;
  return el(
    `button.btn.btn--${variante}${petit ? ".btn--petit" : ""}${options.optionnel ? ".btn--optionnel" : ""}`,
    {
      type,
      onclick,
      title: titre || (ico ? texte : null),
      disabled,
      "aria-label": options.label || (ico ? texte : null),
    },
    ico ? icone(ico, petit ? 15 : 17) : null,
    texte ? el("span.btn__texte", texte) : null
  );
}

/** Un bouton qui ne porte qu'un pictogramme. `label` est OBLIGATOIRE. */
export function boutonIcone(ico, label, options = {}) {
  return el(
    `button.btn.btn--${options.variante || "fantome"}.btn--icone`,
    { type: "button", onclick: options.onclick, "aria-label": label, title: label, disabled: options.disabled },
    icone(ico, options.taille || 18)
  );
}

/* ================================= Champs ================================= */

function enveloppe(label, contenu, aide, options = {}) {
  return el(
    `div.champ${options.classe ? `.${options.classe}` : ""}`,
    label ? el("label.champ__label", { for: options.pour }, label) : null,
    contenu,
    aide ? el("div.champ__aide", aide) : null,
    options.erreur ? el("div.champ__aide.champ__aide--alerte", options.erreur) : null
  );
}

let compteurId = 0;
const nouvelId = () => `c${(compteurId += 1)}`;

export function champ(label, options = {}) {
  const pour = nouvelId();
  const input = el("input.saisie", {
    id: pour,
    type: options.type || "text",
    value: options.valeur ?? "",
    placeholder: options.placeholder || "",
    autocomplete: options.autocomplete || "off",
    inputmode: options.inputmode,
    maxlength: options.max,
    disabled: options.disabled,
    oninput: options.oninput ? (e) => options.oninput(e.target.value, e) : null,
    onchange: options.onchange ? (e) => options.onchange(e.target.value, e) : null,
    onkeydown: options.onkeydown,
  });
  return enveloppe(label, input, options.aide, { pour, ...options });
}

/**
 * Un champ montant.
 *
 * `type="text"` et non `type="number"` : le champ numerique du navigateur
 * refuse la virgule sur un clavier francais AZERTY sous Chrome, efface la
 * saisie quand elle est invalide, et affiche des fleches qui n'ont aucun sens
 * pour un prix. `inputmode="decimal"` suffit a ouvrir le bon clavier sur
 * telephone, et `nombre()` se charge de lire ce qui a ete tape.
 */
export function champMontant(label, options = {}) {
  const pour = nouvelId();
  // `?? "€"` et non `|| "€"` : une unite explicitement vide — une quantite, un
  // nombre de jours — doit rester vide, pas retomber sur l'euro.
  const unite = options.unite ?? "€";
  const boite = el(
    "div.champ__boite",
    el("input.saisie.saisie--nombre", {
      id: pour,
      type: "text",
      inputmode: "decimal",
      value: options.valeur === "" || options.valeur === null ? "" : formaterSaisie(options.valeur),
      placeholder: options.placeholder || "0",
      disabled: options.disabled,
      oninput: options.oninput ? (e) => options.oninput(nombre(e.target.value), e) : null,
      onchange: (e) => {
        const v = nombre(e.target.value);
        e.target.value = formaterSaisie(v);
        if (options.onchange) options.onchange(v, e);
      },
    }),
    unite ? el("span.champ__unite", unite) : null
  );
  return enveloppe(label, boite, options.aide, { pour, ...options });
}

/** Un nombre simple : quantite, duree, delai. Meme logique que le montant. */
export function champNombre(label, options = {}) {
  return champMontant(label, { ...options, unite: options.unite ?? "" });
}

function formaterSaisie(v) {
  const n = nombre(v, 0);
  return Number.isInteger(n) ? String(n) : decimal(n);
}

export function champSelect(label, options = {}) {
  const pour = nouvelId();
  const select = el(
    "select.saisie.saisie--select",
    {
      id: pour,
      disabled: options.disabled,
      onchange: options.onchange ? (e) => options.onchange(e.target.value, e) : null,
    },
    (options.options || []).map((o) =>
      el("option", { value: o.valeur, selected: String(o.valeur) === String(options.valeur) }, o.nom)
    )
  );
  select.value = options.valeur ?? "";
  return enveloppe(label, select, options.aide, { pour, ...options });
}

export function champDate(label, options = {}) {
  return champ(label, { ...options, type: "date" });
}

export function champHeure(label, options = {}) {
  return champ(label, { ...options, type: "time" });
}

export function champZone(label, options = {}) {
  const pour = nouvelId();
  const zone = el("textarea.saisie.saisie--zone", {
    id: pour,
    rows: options.lignes || 4,
    placeholder: options.placeholder || "",
    disabled: options.disabled,
    oninput: options.oninput ? (e) => options.oninput(e.target.value, e) : null,
    onchange: options.onchange ? (e) => options.onchange(e.target.value, e) : null,
  });
  zone.value = options.valeur ?? "";
  return enveloppe(label, zone, options.aide, { pour, ...options });
}

/** Une case a cocher dont toute la ligne est cliquable. */
export function coche(nom, options = {}) {
  const input = el("input", {
    type: "checkbox",
    checked: options.valeur === true,
    disabled: options.disabled,
    onchange: (e) => options.onchange && options.onchange(e.target.checked, e),
  });
  return el(
    `label.coche${options.valeur ? ".coche--actif" : ""}`,
    input,
    el(
      "span.coche__texte",
      el("span.coche__nom", nom),
      options.note ? el("span.coche__note", options.note) : null
    )
  );
}

/** Deux a quatre choix exclusifs. Au-dela, employer `champSelect`. */
export function segment(options, valeur, onchange, label = null) {
  const barre = el(
    "div.segment",
    { role: "tablist", "aria-label": label || undefined },
    options.map((o) =>
      el(
        `button.segment__item${String(o.valeur) === String(valeur) ? ".segment__item--actif" : ""}`,
        {
          type: "button",
          role: "tab",
          "aria-selected": String(o.valeur) === String(valeur),
          onclick: () => onchange(o.valeur),
          title: o.aide,
        },
        o.nom
      )
    )
  );
  return barre;
}

/* ================================ Affichage =============================== */

/** Une pastille d'etat : toujours un mot, jamais une couleur seule. */
export function etat(nom, couleur = "neutre") {
  return el(`span.etat.etat--${couleur}`, nom);
}

export function tag(texte, variante = "") {
  return el(`span.tag${variante ? `.tag--${variante}` : ""}`, texte);
}

export function kpi({ valeur, label, detail, ton = "", onclick }) {
  const contenu = [
    el(`div.kpi__valeur${ton ? `.kpi__valeur--${ton}` : ""}`, valeur),
    el("div.kpi__label", label),
    detail ? el("div.kpi__detail", detail) : null,
  ];
  return onclick
    ? el("button.kpi.kpi--cliquable", { type: "button", onclick }, contenu)
    : el("div.kpi", contenu);
}

export function carte({ titre, sousTitre, actions, corps, pied, variante }) {
  return el(
    `div.carte${variante ? `.carte--${variante}` : ""}`,
    titre
      ? el(
          "div.carte__tete",
          el(
            "div.carte__titre",
            titre,
            sousTitre ? el("div.carte__sous-titre", sousTitre) : null
          ),
          actions ? el("div.rang", actions) : null
        )
      : null,
    el(`div.carte__corps${Array.isArray(corps) && corps.length === 0 ? "" : ""}`, corps),
    pied ? el("div.carte__pied", pied) : null
  );
}

/** Une carte dont le corps est une liste : pas de rembourrage interieur. */
export function carteListe({ titre, sousTitre, actions, contenu, pied, variante }) {
  return el(
    `div.carte${variante ? `.carte--${variante}` : ""}`,
    titre
      ? el(
          "div.carte__tete",
          el("div.carte__titre", titre, sousTitre ? el("div.carte__sous-titre", sousTitre) : null),
          actions ? el("div.rang", actions) : null
        )
      : null,
    contenu,
    pied ? el("div.carte__pied", pied) : null
  );
}

/**
 * Un ecran vide qui dit quoi faire.
 *
 * Le bouton n'est pas decoratif : c'est la seule chose qui distingue un ecran
 * vide utile d'une impasse.
 */
export function vide({ ico = "catalogue", titre, texte, action }) {
  return el(
    "div.vide",
    el("div.vide__icone", icone(ico, 42)),
    titre ? el("div.vide__titre", titre) : null,
    texte ? el("p.vide__texte", texte) : null,
    action || null
  );
}

export function sectionTitre(texte) {
  return el("div.section__titre", texte);
}

export function defs(paires) {
  return el(
    "div.defs",
    paires
      .filter((p) => p)
      .map((p) =>
        el(
          "div.def",
          el("div.def__label", p.label),
          el(`div.def__valeur${p.valeur ? "" : ".def__valeur--vide"}`, p.valeur || "non renseigné")
        )
      )
  );
}

export function aide(texte, variante = "") {
  return el(`div.aide${variante ? `.aide--${variante}` : ""}`, texte);
}

/* ============================== Barre d'outils ============================ */

export function recherche({ valeur, oninput, placeholder = "Rechercher…", onvider }) {
  const input = el("input.saisie", {
    type: "search",
    value: valeur || "",
    placeholder,
    "aria-label": placeholder,
    oninput: (e) => oninput(e.target.value),
  });
  return el(
    "div.recherche",
    el("span.recherche__icone", icone("recherche", 17)),
    input,
    valeur
      ? el(
          "button.recherche__vider",
          { type: "button", "aria-label": "Effacer la recherche", onclick: () => (onvider ? onvider() : oninput("")) },
          icone("croix", 15)
        )
      : null
  );
}

/** Les filtres en pastilles. `n` affiche l'effectif, ce qui evite un clic pour rien. */
export function filtres(liste) {
  return el(
    "div.filtres",
    liste.map((f) =>
      el(
        `button.filtre${f.actif ? ".filtre--actif" : ""}`,
        { type: "button", onclick: f.onclick, title: f.aide },
        f.nom,
        f.n !== undefined ? el("span.filtre__compte", f.n) : null
      )
    )
  );
}

/* ================================= Listes ================================= */

export function ligne({ ico, marque, titre, meta, montant, tonMontant, droite, actions, onclick, etats }) {
  const corps = el(
    "div.ligne__corps",
    el("div.ligne__titre", titre),
    meta ? el("div.ligne__meta", meta) : null
  );

  const contenu = [
    ico || null,
    corps,
    droite || (montant !== undefined && montant !== null)
      ? el(
          "div.ligne__droite",
          montant !== undefined && montant !== null
            ? el(`div.ligne__montant${tonMontant ? `.ligne__montant--${tonMontant}` : ""}`, montant)
            : null,
          etats || null,
          droite || null
        )
      : null,
    actions ? el("div.ligne__actions", actions) : null,
  ];

  const classes = [
    "ligne",
    onclick ? "ligne--cliquable" : "",
    marque ? "ligne--marque" : "",
    marque ? `ligne--marque-${marque}` : "",
  ]
    .filter(Boolean)
    .join(".");

  return onclick
    ? el(`button.${classes}`, { type: "button", onclick }, contenu)
    : el(`div.${classes}`, contenu);
}

/* =========================== Saisie assistee ==============================
   Un champ de recherche qui propose des elements existants. Il sert au choix
   du client et a l'ajout d'une ligne depuis le catalogue — deux gestes qu'on
   fait vingt fois par jour, et qui ne doivent jamais demander de quitter
   l'ecran en cours.
   ======================================================================== */

export function autoComplete({ label, placeholder, valeur, chercher, rendreItem, onchoisir, aide }) {
  let visee = -1;
  let items = [];

  const liste = el("div.auto__liste", { hidden: true });
  const input = el("input.saisie", {
    type: "text",
    value: valeur || "",
    placeholder: placeholder || "Rechercher…",
    autocomplete: "off",
    oninput: (e) => proposer(e.target.value),
    onfocus: (e) => proposer(e.target.value),
    onblur: () => setTimeout(() => (liste.hidden = true), 160),
    onkeydown: (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        visee = Math.max(0, Math.min(items.length - 1, visee + (e.key === "ArrowDown" ? 1 : -1)));
        peindre();
      } else if (e.key === "Enter" && visee >= 0 && !liste.hidden) {
        e.preventDefault();
        choisir(items[visee]);
      } else if (e.key === "Escape") {
        liste.hidden = true;
      }
    },
  });

  function proposer(q) {
    items = chercher(q).slice(0, 20);
    visee = -1;
    peindre();
    liste.hidden = items.length === 0;
  }

  function peindre() {
    liste.replaceChildren(
      ...items.map((item, i) => {
        const { nom, note } = rendreItem(item);
        return el(
          `button.auto__item${i === visee ? ".auto__item--vise" : ""}`,
          { type: "button", onmousedown: (e) => e.preventDefault(), onclick: () => choisir(item) },
          el("span.auto__nom", nom),
          note ? el("span.auto__note", note) : null
        );
      })
    );
  }

  function choisir(item) {
    liste.hidden = true;
    input.value = "";
    onchoisir(item);
  }

  return enveloppe(label, el("div.auto", input, liste), aide, {});
}

/* ================================ Jauge =================================== */

export function jauge(part, ton = "") {
  const p = Math.max(0, Math.min(100, part));
  return el(
    "div.jauge",
    { role: "img", "aria-label": `${Math.round(p)} %` },
    el(`div.jauge__part${ton ? `.jauge__part--${ton}` : ""}`, { style: { width: `${p}%` } })
  );
}
