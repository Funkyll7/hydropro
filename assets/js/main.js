/**
 * main.js — l'assemblage.
 *
 * Il charge les references, ouvre le dossier, tient l'etat, rend la page et
 * enregistre. Toute la logique metier est ailleurs ; ce fichier ne fait que
 * cabler des morceaux entre eux.
 *
 * TROIS CHOSES QU'IL EST SEUL A SAVOIR FAIRE, et qu'aucune vue ne refait :
 *   - enregistrer (et le signaler par le temoin de la barre laterale) ;
 *   - naviguer (l'adresse porte l'onglet, donc le bouton « precedent » marche) ;
 *   - poser une modale ou un bandeau.
 */

import { CONFIG } from "./config.js";
import { $, el, fill } from "./core/dom.js";
import { debounce } from "./core/store.js";
import { chargerCatalogueInitial, chargerReferences } from "./core/data.js";
import { poserReglage, valeur } from "./core/prefs.js";
import { isoInstant } from "./core/format.js";
import * as Dossier from "./domain/dossier.js";
import * as Photos from "./core/photos.js";
import { installerCatalogue } from "./domain/catalogue.js";
import {
  appliquerTaille,
  appliquerTheme,
  basculerClairSombre,
  estSombre,
  suivreSysteme,
} from "./ui/theme.js";
import { ONGLETS, rendreBarreBasse, rendreSidebar } from "./ui/sidebar.js";
import { icone } from "./ui/icones.js";
import { bouton, boutonIcone } from "./ui/champs.js";

import * as VueAccueil from "./ui/accueil.js";
import * as VueAgenda from "./ui/agenda.js";
import * as VueClients from "./ui/clients.js";
import * as VueChantiers from "./ui/chantiers.js";
import * as VueDocuments from "./ui/documents.js";
import * as VueInterventions from "./ui/interventions.js";
import * as VueContrats from "./ui/contrats.js";
import * as VueCatalogue from "./ui/catalogue.js";
import * as VueChiffres from "./ui/chiffres.js";
import * as VueReglages from "./ui/reglages.js";

const VUES = {
  accueil: VueAccueil,
  agenda: VueAgenda,
  clients: VueClients,
  chantiers: VueChantiers,
  devis: VueDocuments,
  factures: VueDocuments,
  interventions: VueInterventions,
  contrats: VueContrats,
  catalogue: VueCatalogue,
  chiffres: VueChiffres,
  reglages: VueReglages,
};

/* =============================== L'etat ================================== */

const etat = {
  dossier: null,
  ref: null,
  onglet: "accueil",
  params: null,
  /** L'etat local d'une vue : filtres, recherche, mois affiche. Pas persistant. */
  vue: {},
};

/* ============================== Le contexte ==============================
   L'objet unique passe a toutes les vues. Elles n'accedent jamais au DOM
   global, ni au localStorage, ni a l'historique : tout passe par la.
   ======================================================================== */

const ctx = {
  get dossier() {
    return etat.dossier;
  },
  get ref() {
    return etat.ref;
  },
  get onglet() {
    return etat.onglet;
  },
  get params() {
    return etat.params;
  },
  get vue() {
    return etat.vue;
  },

  aller,
  rendre,
  rendrePage,
  maj,
  majSilencieux,
  toast,
  modale,
  confirmer,
  exporter,
  importer: importerFichier,
  /** Un etat local a la vue courante, remis a zero en changeant d'onglet. */
  poserVue(patch) {
    etat.vue = { ...etat.vue, ...patch };
    rendrePage();
  },
};

/* ============================ Enregistrement ============================= */

/**
 * Enregistre le dossier et allume le temoin.
 *
 * Le temoin est la SEULE reponse a « est-ce que ca a pris ? » dans une
 * application sans bouton « Enregistrer ». Un echec d'ecriture — quota plein,
 * mode prive — est signale par un bandeau rouge : perdre une facture en
 * silence serait le pire comportement possible.
 */
function enregistrer() {
  const ok = Dossier.enregistrer(etat.dossier);
  const temoin = $("#temoin");
  if (!ok) {
    toast(
      "Enregistrement impossible : la mémoire du navigateur est pleine ou refusée. Exportez votre dossier tout de suite.",
      { erreur: true, duree: 12000 }
    );
    return false;
  }
  if (temoin) {
    temoin.classList.add("temoin--actif");
    setTimeout(() => temoin.classList.remove("temoin--actif"), 900);
  }
  return true;
}

const enregistrerPlusTard = debounce(enregistrer, 400);

/** Modifie le dossier, enregistre, et re-rend tout. */
function maj(fn) {
  fn(etat.dossier);
  enregistrer();
  rendre();
}

/**
 * Modifie le dossier et enregistre, SANS re-rendre.
 *
 * C'est ce qu'emploie toute saisie au clavier : re-rendre a chaque frappe
 * detruirait le champ en cours d'edition et ferait sauter le curseur.
 */
function majSilencieux(fn) {
  fn(etat.dossier);
  enregistrerPlusTard();
}

/* ============================== Navigation =============================== */

/**
 * L'adresse porte l'etat de navigation : « #devis/dev-a1b2c3 ».
 *
 * Ce n'est pas de la coquetterie : sans cela, le bouton « precedent » du
 * telephone ferme l'application au lieu de revenir a la liste, ce qui est le
 * premier reflexe de tout le monde.
 */
function aller(onglet, params = null) {
  const cible = params ? `#${onglet}/${params}` : `#${onglet}`;
  if (window.location.hash === cible) {
    lireAdresse();
    rendre();
    return;
  }
  window.location.hash = cible;
}

function lireAdresse() {
  const brut = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  const [onglet, ...reste] = brut.split("/");
  const cle = VUES[onglet] ? onglet : "accueil";
  if (cle !== etat.onglet) etat.vue = {};
  etat.onglet = cle;
  etat.params = reste.length ? reste.join("/") : null;
  poserReglage("onglet", cle);
}

/* ================================ Rendu ================================== */

function rendre() {
  fill($("#sidebar-contenu"), rendreSidebar(ctx));
  fill($("#barre-basse"), rendreBarreBasse(ctx));
  rendrePage();
  fermerTiroir();
}

let derniereRoute = null;

function rendrePage() {
  const vue = VUES[etat.onglet] || VueAccueil;
  const titre = vue.titre ? vue.titre(ctx) : ONGLETS.find((o) => o.cle === etat.onglet)?.nom || "";
  const actions = vue.actions ? vue.actions(ctx) : null;

  let contenu;
  try {
    contenu = vue.rendre(ctx);
  } catch (e) {
    console.error(e);
    contenu = el(
      "div.onglet",
      el(
        "div.carte.carte--alerte",
        el(
          "div.carte__corps",
          el("h2", "Cet écran n'a pas pu s'afficher."),
          el("p", String(e && e.message ? e.message : e)),
          el("p.champ__aide", "Le dossier est intact. Exportez-le, puis signalez le message ci-dessus."),
          bouton("Revenir à l'accueil", { variante: "plein", onclick: () => aller("accueil") })
        )
      )
    );
  }

  fill(
    $("#principal"),
    el(
      "header.page__tete",
      el(
        "div.page__tete-corps",
        el(
          "button.page__tete-bouton",
          { type: "button", "aria-label": "Ouvrir la navigation", onclick: basculerTiroir },
          icone("menu", 20)
        ),
        el("h1.page__titre", titre),
        el(
          "div.page__actions.no-print",
          actions || null,
          // Le bouton clair/sombre est dans l'en-tete de TOUTES les pages, et
          // pas seulement dans le tiroir des reglages : on en a besoin au
          // moment ou l'ecran devient illisible — en plein soleil sur un toit,
          // ou dans une cave — c'est-a-dire au pire moment pour aller le
          // chercher dans un menu.
          boutonIcone(estSombre() ? "soleil" : "lune", estSombre() ? "Passer en clair" : "Passer en sombre", {
            variante: "contour",
            onclick: () => {
              basculerClairSombre();
              rendre();
            },
          })
        )
      )
    ),
    // Pas d'enveloppe ici : chaque vue rend deja son propre `.onglet`. En
    // ajouter une deuxieme empilait deux colonnes centrees l'une dans l'autre,
    // et doublait l'espacement vertical de toutes les pages.
    contenu
  );

  document.title = `${titre} — ${CONFIG.nom}`;

  // On remonte en haut SEULEMENT quand on change d'ecran. L'application se
  // re-rend a chaque case cochee ; remonter a chaque fois ferait sauter la
  // page sous les doigts de celui qui pointe une liste de rendez-vous.
  const route = `${etat.onglet}/${etat.params || ""}`;
  if (route !== derniereRoute) {
    derniereRoute = route;
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

/* =============================== Le tiroir =============================== */

function basculerTiroir() {
  document.body.classList.toggle("nav-ouverte");
}

function fermerTiroir() {
  document.body.classList.remove("nav-ouverte");
}

/* =============================== Bandeau ================================= */

let timerToast = 0;

/**
 * Un message court, en bas de l'ecran.
 *
 * Il peut porter une action — « Annuler » apres une suppression. C'est la
 * seule facon d'offrir un filet de securite sans demander une confirmation a
 * chaque geste, et une confirmation qu'on voit dix fois par jour ne se lit
 * plus.
 */
function toast(message, options = {}) {
  const bandeau = $("#bandeau");
  clearTimeout(timerToast);

  fill(
    bandeau,
    el(
      `div.bandeau__contenu${options.erreur ? ".bandeau__contenu--erreur" : ""}`,
      el("span", message),
      options.action
        ? el(
            "button.bandeau__action",
            {
              type: "button",
              onclick: () => {
                bandeau.hidden = true;
                options.action.faire();
              },
            },
            options.action.nom
          )
        : null
    )
  );

  bandeau.hidden = false;
  timerToast = setTimeout(() => {
    bandeau.hidden = true;
  }, options.duree || (options.action ? 7000 : 3200));
}

/* =============================== Modale ==================================
   Un <dialog> natif : le navigateur gere le piege au clavier, la touche Echap
   et l'inertie du fond. Trois problemes regles sans une ligne de code, et
   mieux regles que ce qu'on aurait ecrit.
   ======================================================================== */

function modale({ titre, corps, actions, large }) {
  const dlg = el("dialog.modale", { style: large ? { width: "min(940px, 96vw)" } : null });

  const fermer = () => {
    dlg.close();
    dlg.remove();
  };

  dlg.append(
    el(
      "div.modale__tete",
      el("h2.modale__titre", titre),
      el(
        "button.btn.btn--fantome.btn--icone",
        { type: "button", "aria-label": "Fermer", onclick: fermer },
        icone("croix", 18)
      )
    ),
    el("div.modale__corps", corps),
    actions ? el("div.modale__pied", actions(fermer)) : null
  );

  document.body.append(dlg);
  dlg.showModal();
  // Le premier champ recoit le focus : sur une fiche de rendez-vous, cela evite
  // une tabulation avant de pouvoir taper.
  const premier = dlg.querySelector("input, select, textarea");
  if (premier) setTimeout(() => premier.focus(), 30);
  return { fermer, dialog: dlg };
}

/**
 * Une confirmation, pour ce qui ne se defait pas.
 *
 * Elle nomme ce qui va disparaitre : « Supprimer ce devis ? » et non « Êtes-vous
 * sûr ? ». On ne peut pas confirmer ce qu'on ne comprend pas.
 */
function confirmer({ titre, texte, valider = "Supprimer", danger = true }) {
  return new Promise((resoudre) => {
    let reponse = false;

    const { dialog } = modale({
      titre,
      corps: el("p", texte),
      actions: (close) => [
        bouton("Annuler", { onclick: close }),
        bouton(valider, {
          variante: danger ? "danger" : "plein",
          onclick: () => {
            reponse = true;
            close();
          },
        }),
      ],
    });

    // Un seul point de sortie : quelle que soit la facon dont la modale se
    // ferme — bouton, croix, touche Echap — la promesse est resolue une fois,
    // et « fermer sans repondre » vaut « non ».
    dialog.addEventListener("close", () => resoudre(reponse), { once: true });
  });
}

/* =========================== Export et import ============================ */

/**
 * Exporte le dossier.
 *
 * Deux formats, et le choix n'est propose que s'il y a des photos : sans
 * photos, il n'y a rien a choisir, et une question posee pour rien est une
 * question a laquelle on repond au hasard.
 */
async function exporter() {
  const photos = Dossier.toutesLesPhotos(etat.dossier);
  if (!photos.length) return telecharger(Dossier.exporter(etat.dossier));

  const { fermer } = modale({
    titre: "Exporter le dossier",
    corps: el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      el(
        "p",
        `Ce dossier contient ${photos.length} photo${photos.length > 1 ? "s" : ""} de chantier. Les images ne sont pas dans le fichier de sauvegarde habituel : elles sont rangées à part, dans la mémoire du navigateur.`
      ),
      el(
        "p.champ__aide",
        "La sauvegarde légère suffit pour tout ce qui se facture — clients, devis, factures, contrats. La sauvegarde complète est la seule qui protège aussi les photos, mais elle pèse plusieurs mégaoctets."
      )
    ),
    actions: (close) => [
      bouton("Annuler", { onclick: close }),
      bouton("Sans les photos", {
        onclick: () => {
          close();
          telecharger(Dossier.exporter(etat.dossier));
        },
      }),
      bouton("Avec les photos", {
        variante: "plein",
        onclick: async () => {
          close();
          toast("Préparation des photos…", { duree: 4000 });
          telecharger(await Dossier.exporterComplet(etat.dossier), "-complet");
        },
      }),
    ],
  });
  void fermer;
}

function telecharger(contenu, suffixe = "") {
  const blob = new Blob([contenu], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const nom = Dossier.nomExport(etat.dossier).replace(/\.json$/, `${suffixe}.json`);
  const a = el("a", { href: url, download: nom });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  etat.dossier.meta.dernierExport = isoInstant();
  enregistrer();
  rendre();
  toast("Dossier exporté. Rangez le fichier ailleurs que sur cet appareil.");
}

function importerFichier() {
  const input = el("input", { type: "file", accept: "application/json,.json", hidden: true });
  document.body.append(input);

  input.addEventListener("change", async () => {
    const fichier = input.files?.[0];
    input.remove();
    if (!fichier) return;

    let importe;
    let photos;
    try {
      ({ dossier: importe, photos } = Dossier.importer(await fichier.text()));
    } catch (e) {
      toast(e.message, { erreur: true, duree: 8000 });
      return;
    }

    const nbPhotos = photos ? Object.keys(photos).length : 0;
    const ok = await confirmer({
      titre: "Remplacer le dossier actuel ?",
      texte: `Le fichier contient ${importe.clients.length} client(s), ${importe.documents.length} document(s), ${importe.rdv.length} rendez-vous${
        nbPhotos ? ` et ${nbPhotos} photo(s)` : ""
      }. Le dossier actuellement ouvert sera remplacé — exportez-le d'abord si vous n'êtes pas sûr.`,
      valider: "Remplacer",
    });
    if (!ok) return;

    etat.dossier = importe;
    enregistrer();

    // Les photos repartent dans IndexedDB, pas dans le dossier. On le fait
    // APRES avoir enregistre le dossier : si la remise des images echoue faute
    // de place, on aura au moins recupere tout ce qui se facture.
    if (nbPhotos) {
      toast(`Restauration de ${nbPhotos} photo(s)…`, { duree: 6000 });
      const remises = await Photos.depuisExport(photos);
      if (remises < nbPhotos) {
        toast(`${nbPhotos - remises} photo(s) n'ont pas pu être restaurées, faute de place.`, {
          erreur: true,
          duree: 9000,
        });
      }
    }

    aller("accueil");
    rendre();
    toast(nbPhotos ? "Dossier et photos importés." : "Dossier importé.");
  });

  input.click();
}

/* ============================== Raccourcis =============================== */

function raccourcis(e) {
  const dansUnChamp = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === "Escape") {
    fermerTiroir();
    return;
  }
  if (dansUnChamp) return;

  if (e.key >= "1" && e.key <= "9") {
    const cible = ONGLETS[Number(e.key) - 1];
    if (cible) {
      e.preventDefault();
      aller(cible.cle);
    }
    return;
  }

  if (e.key === "/") {
    const champ = document.querySelector('.recherche input, input[type="search"]');
    if (champ) {
      e.preventDefault();
      champ.focus();
      champ.select();
    }
    return;
  }

  if (e.key.toLowerCase() === "n") {
    const vue = VUES[etat.onglet];
    if (vue && vue.nouveau) {
      e.preventDefault();
      vue.nouveau(ctx);
    }
  }
}

/* ============================== Demarrage ================================ */

async function demarrer() {
  appliquerTheme();
  appliquerTaille();
  suivreSysteme();

  try {
    etat.ref = await chargerReferences();
  } catch (e) {
    const erreur = $("#boot-erreur");
    erreur.hidden = false;
    erreur.textContent =
      "Les données de référence n'ont pas pu être chargées. Si vous avez ouvert index.html directement depuis le disque, passez par un petit serveur local — le navigateur refuse de lire les fichiers voisins autrement. Voir le README.";
    console.error(e);
    return;
  }

  etat.dossier = Dossier.charger();

  // Le catalogue de depart n'est copie qu'une fois : ensuite, les prix
  // appartiennent a l'artisan et ne doivent plus jamais etre ecrases.
  if (!etat.dossier.meta.catalogueCharge && etat.dossier.catalogue.length === 0) {
    try {
      installerCatalogue(etat.dossier, await chargerCatalogueInitial());
      Dossier.enregistrer(etat.dossier);
    } catch (e) {
      console.warn("Catalogue de départ non chargé", e);
    }
  }

  const dernier = valeur("onglet", "accueil");
  if (!window.location.hash && dernier) window.location.hash = `#${dernier}`;
  lireAdresse();

  $("#boot").hidden = true;
  $("#app").hidden = false;

  window.addEventListener("hashchange", () => {
    lireAdresse();
    rendre();
  });
  window.addEventListener("keydown", raccourcis);
  $("#voile").addEventListener("click", fermerTiroir);

  // Ctrl+P depuis l'editeur d'un document bascule d'abord sur l'apercu : sans
  // cela, l'imprimante sortirait le FORMULAIRE de saisie — champs, boutons et
  // notes internes — au lieu du devis. Le navigateur laisse modifier le DOM
  // pendant `beforeprint`, et repeint avant d'ouvrir la boite d'impression.
  window.addEventListener("beforeprint", () => {
    const surUnDocument = (etat.onglet === "devis" || etat.onglet === "factures") && etat.params;
    if (surUnDocument && etat.vue.mode !== "apercu") {
      etat.vue = { ...etat.vue, mode: "apercu" };
      rendrePage();
    }
  });

  // L'ombre de la barre de titre n'apparait qu'une fois le contenu passe
  // dessous : sinon elle flotte sur une page qui n'a pas defile.
  window.addEventListener(
    "scroll",
    () => {
      const tete = document.querySelector(".page__tete");
      if (tete) tete.classList.toggle("page__tete--detache", window.scrollY > 4);
    },
    { passive: true }
  );

  rendre();
  brancherHorsLigne();
}

/**
 * Le cache hors ligne.
 *
 * `CONFIG.offline = false` ne se contente pas de ne plus enregistrer le
 * service worker : il DESINSCRIT celui qui serait deja en place et vide ses
 * caches. Sans cela, un utilisateur qui a ouvert l'application une fois
 * garderait la version en cache pour toujours.
 */
function brancherHorsLigne() {
  if (!("serviceWorker" in navigator)) return;

  if (!CONFIG.offline) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    if (window.caches) caches.keys().then((cles) => cles.forEach((c) => caches.delete(c)));
    return;
  }

  const inscrire = () => {
    navigator.serviceWorker.register(new URL("../../sw.js", import.meta.url)).catch((e) => {
      console.warn("Mode hors ligne indisponible", e);
    });
  };

  // `demarrer()` est asynchrone : il attend les donnees de reference avant
  // d'arriver ici. Sur un vrai reseau, l'evenement `load` est donc DEJA PASSE,
  // et un ecouteur pose maintenant ne se declencherait jamais — le service
  // worker ne s'enregistrait pas, sans le moindre message, et l'application
  // n'etait ni hors ligne ni installable. En local, ou les fichiers arrivent
  // en une milliseconde, le bug ne se voyait pas : il n'est apparu qu'une fois
  // le site publie. D'ou le test explicite sur `readyState`.
  if (document.readyState === "complete") inscrire();
  else window.addEventListener("load", inscrire, { once: true });
}

demarrer();
