/**
 * dom.js — le strict minimum pour fabriquer du DOM sans framework.
 *
 *   el("div.carte", { onclick: f }, "texte", el("span", "!"))
 *
 * Le selecteur accepte "tag.classe1.classe2". Les proprietes commencant par
 * "on" deviennent des ecouteurs, celles commencant par "--" des variables CSS,
 * le reste est pose en attribut (ou en propriete pour value / checked).
 */

const PROPS = new Set([
  "value",
  "checked",
  "selected",
  "disabled",
  "hidden",
  "textContent",
  "indeterminate",
  "open",
]);

export function el(selector, ...rest) {
  const [tag, ...classes] = String(selector).split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");

  let children = rest;
  const first = rest[0];
  if (first && typeof first === "object" && !Array.isArray(first) && !(first instanceof Node)) {
    applyProps(node, first);
    children = rest.slice(1);
  }
  append(node, children);
  return node;
}

function applyProps(node, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key.startsWith("--")) {
      node.style.setProperty(key, value);
    } else if (key === "style" && typeof value === "object") {
      Object.assign(node.style, value);
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (PROPS.has(key)) {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === "") continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Vide un noeud et y place le contenu donne. */
export function fill(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/** Remplit un <select> et restaure la valeur courante si elle existe encore. */
export function setOptions(select, options, current) {
  select.replaceChildren(
    ...options.map((o) =>
      o.groupe
        ? el(
            "optgroup",
            { label: o.groupe },
            o.options.map((x) => el("option", { value: x.value }, x.label))
          )
        : el("option", { value: o.value }, o.label)
    )
  );
  if (current !== undefined && current !== null) select.value = current;
}

/**
 * Un repli <details> qui se souvient de son etat.
 *
 * Sans memoire, chaque re-rendu refermerait les sections qu'on venait
 * d'ouvrir — et l'application se re-rend a chaque frappe, puisque tout montant
 * saisi change un total affiche ailleurs. La cle est portee par l'appelant, et
 * l'etat vit hors du DOM.
 */
const REPLIS = new Map();

export function repli(cle, resume, contenu, options = {}) {
  const ouvert = REPLIS.has(cle) ? REPLIS.get(cle) : options.ouvert === true;
  return el(
    "details.repli",
    {
      open: ouvert || undefined,
      ontoggle: (e) => REPLIS.set(cle, e.currentTarget.open),
    },
    el("summary.repli__tete", resume),
    el("div.repli__corps", contenu)
  );
}

/**
 * Garde la position de defilement d'une liste au travers d'un re-rendu.
 *
 * Cocher « fait » sur un rendez-vous re-rend la journee entiere ; sans cela,
 * la page remonte en haut et on perd la ligne qu'on regardait.
 */
export function gardeDefilement(fn) {
  const y = window.scrollY;
  fn();
  window.scrollTo({ top: y, behavior: "instant" in window ? "instant" : "auto" });
}
