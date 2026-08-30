/**
 * catalogue.js — les prestations, les fournitures, et ce qu'elles rapportent.
 *
 * DEUX COLONNES QUI NE SORTENT JAMAIS D'ICI : le prix d'achat et la marge.
 * Elles n'apparaissent sur aucun devis, sur aucune facture, dans aucun export
 * destine au client. Elles ne servent qu'a une chose, et c'est la plus utile
 * de l'application : savoir sur quoi on gagne sa vie.
 */

import { el } from "../core/dom.js";
import {
  aide,
  bouton,
  carte,
  carteListe,
  champ,
  champMontant,
  champNombre,
  champSelect,
  champZone,
  coche,
  filtres,
  kpi,
  recherche,
  segment,
  vide,
} from "./champs.js";
import { icone } from "./icones.js";
import { decimal, euros, pluriel, pourcent } from "../core/format.js";
import { articleVide } from "../domain/dossier.js";
import {
  appliquerHausse,
  categories,
  chercher,
  marge,
  margesSuspectes,
  plusUtilises,
  tauxHoraireMinimum,
} from "../domain/catalogue.js";

export const titre = () => "Catalogue";

export function actions(ctx) {
  return [
    bouton("Hausse de prix", { ico: "chiffres", petit: true, onclick: () => ouvrirHausse(ctx) }),
    bouton("Nouvel article", { ico: "plus", variante: "plein", petit: true, onclick: () => ouvrirArticle(ctx, null) }),
  ];
}

export const nouveau = (ctx) => ouvrirArticle(ctx, null);

export function rendre(ctx) {
  const q = ctx.vue.q || "";
  const kind = ctx.vue.kind || "tous";
  const categorie = ctx.vue.categorie || "";

  const catalogue = ctx.dossier.catalogue;
  const filtreKind = kind === "tous" ? null : kind;

  const visibles = chercher(catalogue, q, filtreKind).filter(
    (a) => !categorie || a.categorie === categorie
  );

  const suspects = margesSuspectes(catalogue);
  const utilises = plusUtilises(ctx.dossier, 6);

  return el(
    "div.onglet",

    el(
      "div.grille.grille--3",
      kpi({
        valeur: String(catalogue.filter((a) => a.kind === "presta").length),
        label: "Prestations",
        detail: "main d'œuvre, forfaits, déplacements",
      }),
      kpi({
        valeur: String(catalogue.filter((a) => a.kind === "fourniture").length),
        label: "Fournitures",
        detail: "matériel revendu",
      }),
      kpi({
        valeur: euros(ctx.dossier.entreprise.tauxHoraire),
        label: "Taux horaire de référence",
        detail: "réglé dans la fiche entreprise",
        onclick: () => ctx.aller("reglages"),
      })
    ),

    el(
      "div.barre-outils",
      segment(
        [
          { valeur: "tous", nom: "Tout" },
          { valeur: "presta", nom: "Prestations" },
          { valeur: "fourniture", nom: "Fournitures" },
        ],
        kind,
        (v) => ctx.poserVue({ kind: v, categorie: "" })
      ),
      recherche({
        valeur: q,
        placeholder: "Référence, désignation…",
        oninput: (v) => ctx.poserVue({ q: v }),
      })
    ),

    filtres([
      { nom: "Toutes catégories", actif: !categorie, onclick: () => ctx.poserVue({ categorie: "" }) },
      ...categories(catalogue, filtreKind).map((c) => ({
        nom: c.nom,
        n: c.n,
        actif: categorie === c.nom,
        onclick: () => ctx.poserVue({ categorie: c.nom }),
      })),
    ]),

    visibles.length
      ? carteListe({
          titre: pluriel(visibles.length, "article"),
          sousTitre: "Le prix d'achat et la marge ne sortent jamais du catalogue",
          contenu: el("div", visibles.map((a) => ligneArticle(ctx, a))),
        })
      : vide({
          ico: "catalogue",
          titre: "Aucun article",
          texte:
            "Le catalogue est ce qui fait la différence entre un devis fait en dix minutes et un devis fait en une heure.",
          action: bouton("Nouvel article", { variante: "plein", ico: "plus", onclick: () => ouvrirArticle(ctx, null) }),
        }),

    suspects.length ? blocMarges(ctx, suspects) : null,
    utilises.length ? blocUtilises(ctx, utilises) : null,
    blocTauxHoraire(ctx)
  );
}

function ligneArticle(ctx, article) {
  const m = marge(article);

  return el(
    "button.ligne.ligne--cliquable",
    { type: "button", onclick: () => ouvrirArticle(ctx, article) },
    el(
      `div.ligne__icone${article.kind === "fourniture" ? "" : ".ligne__icone--accent"}`,
      icone(article.kind === "fourniture" ? "catalogue" : "interventions", 18)
    ),
    el(
      "div.ligne__corps",
      el(
        "div.ligne__titre",
        article.favori ? "★ " : "",
        article.designation || "Sans désignation"
      ),
      el(
        "div.ligne__meta",
        article.ref ? el("span", article.ref) : null,
        el("span", article.categorie),
        el("span", `TVA ${pourcent(article.tva)}`),
        m ? el("span", `marge ${m.taux} % · ×${decimal(m.coef)}`) : null
      )
    ),
    el(
      "div.ligne__droite",
      el("div.ligne__montant", `${euros(article.pu)} / ${article.unite}`),
      m && m.taux < 15 ? el("span.etat.etat--alerte", "marge faible") : null
    )
  );
}

/* ============================== L'article ================================= */

function ouvrirArticle(ctx, existant) {
  const nouveauArt = !existant;
  const a = existant ? { ...existant } : articleVide({ tva: ctx.dossier.entreprise.tvaDefaut });

  const boiteMarge = el("div.champ__aide");
  const majMarge = () => {
    const m = marge(a);
    boiteMarge.textContent = m
      ? `Marge : ${euros(m.brut)} par unité, soit ${m.taux} % du prix de vente (coefficient ×${decimal(m.coef)}).`
      : "Renseignez le prix d'achat pour voir la marge.";
  };
  majMarge();

  ctx.modale({
    titre: nouveauArt ? "Nouvel article" : "Article",
    corps: el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "16px" } },
      segment(
        [
          { valeur: "presta", nom: "Prestation" },
          { valeur: "fourniture", nom: "Fourniture" },
        ],
        a.kind,
        (v) => {
          a.kind = v;
        }
      ),
      el(
        "div.grille.grille--2",
        champ("Référence", {
          valeur: a.ref,
          placeholder: "MO-01, F-CH01…",
          aide: "Facultative, mais c'est elle qui relie une ligne de devis au catalogue.",
          oninput: (v) => (a.ref = v),
        }),
        champ("Catégorie", {
          valeur: a.categorie,
          placeholder: "Chauffage, Sanitaire, Main d'œuvre…",
          oninput: (v) => (a.categorie = v),
        })
      ),
      champ("Désignation", {
        valeur: a.designation,
        placeholder: "Ce qui s'imprimera sur le devis",
        oninput: (v) => (a.designation = v),
      }),
      champZone("Détail", {
        valeur: a.detail,
        lignes: 2,
        placeholder: "Ce qui est compris, la marque, la référence fournisseur…",
        aide: "S'imprime en petit sous la désignation. C'est là qu'on désamorce les malentendus.",
        oninput: (v) => (a.detail = v),
      }),
      el(
        "div.grille.grille--4",
        champSelect("Unité", {
          valeur: a.unite,
          options: ctx.ref.reference.unites.map((u) => ({ valeur: u, nom: u })),
          onchange: (v) => (a.unite = v),
        }),
        champMontant("Prix de vente HT", {
          valeur: a.pu,
          onchange: (v) => {
            a.pu = v;
            majMarge();
          },
        }),
        champMontant("Prix d'achat HT", {
          valeur: a.achat,
          onchange: (v) => {
            a.achat = v;
            majMarge();
          },
        }),
        champSelect("TVA", {
          valeur: a.tva,
          options: ctx.ref.tva.taux
            .filter((t) => t.valeur > 0)
            .map((t) => ({ valeur: t.valeur, nom: `${t.valeur} %` })),
          onchange: (v) => (a.tva = Number(v)),
        })
      ),
      boiteMarge,
      coche("Favori", {
        valeur: a.favori === true,
        note: "Remonte en tête de la recherche du catalogue",
        onchange: (v) => (a.favori = v),
      }),
      aide(ctx.ref.tva.taux.find((t) => t.valeur === a.tva)?.resume || "")
    ),
    actions: (close) => [
      !nouveauArt
        ? bouton("Supprimer", {
            variante: "danger",
            onclick: async () => {
              const ok = await ctx.confirmer({
                titre: "Supprimer cet article ?",
                texte: "Les devis et factures qui l'emploient gardent leur ligne : elle en est une copie.",
              });
              if (!ok) return;
              close();
              ctx.maj((d) => {
                d.catalogue = d.catalogue.filter((x) => x.id !== a.id);
              });
            },
          })
        : null,
      bouton("Annuler", { onclick: close }),
      bouton("Enregistrer", {
        variante: "plein",
        onclick: () => {
          close();
          ctx.maj((d) => {
            const i = d.catalogue.findIndex((x) => x.id === a.id);
            if (i >= 0) d.catalogue[i] = a;
            else d.catalogue.push(a);
          });
        },
      }),
    ].filter(Boolean),
  });
}

/* =============================== La hausse ===============================
   Les prix fournisseur bougent une a deux fois par an. Reprendre soixante
   articles a la main est le genre de corvee qu'on repousse jusqu'a vendre a
   perte — d'ou ce bouton.
   ======================================================================== */

function ouvrirHausse(ctx) {
  const reglage = { pourcent: 3, kind: "", categorie: "", cible: "les deux" };

  ctx.modale({
    titre: "Appliquer une hausse",
    corps: el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "16px" } },
      aide(
        "La hausse s'applique immédiatement et ne se défait pas d'un clic — exportez votre dossier avant si vous voulez pouvoir revenir en arrière. Les devis et factures déjà établis ne sont pas touchés."
      ),
      champNombre("Pourcentage", {
        valeur: reglage.pourcent,
        unite: "%",
        aide: "Une valeur négative applique une baisse.",
        onchange: (v) => (reglage.pourcent = v),
      }),
      champSelect("Sur quoi", {
        valeur: reglage.kind,
        options: [
          { valeur: "", nom: "Tout le catalogue" },
          { valeur: "presta", nom: "Les prestations seulement" },
          { valeur: "fourniture", nom: "Les fournitures seulement" },
        ],
        onchange: (v) => (reglage.kind = v),
      }),
      champSelect("Catégorie", {
        valeur: reglage.categorie,
        options: [
          { valeur: "", nom: "Toutes" },
          ...categories(ctx.dossier.catalogue).map((c) => ({ valeur: c.nom, nom: c.nom })),
        ],
        onchange: (v) => (reglage.categorie = v),
      }),
      champSelect("Quels prix", {
        valeur: reglage.cible,
        options: [
          { valeur: "les deux", nom: "Vente et achat" },
          { valeur: "vente", nom: "Prix de vente seulement" },
          { valeur: "achat", nom: "Prix d'achat seulement" },
        ],
        aide: "Ne monter que le prix d'achat écrase la marge : c'est ce qui se passe quand on oublie de répercuter.",
        onchange: (v) => (reglage.cible = v),
      })
    ),
    actions: (close) => [
      bouton("Annuler", { onclick: close }),
      bouton("Appliquer", {
        variante: "plein",
        onclick: () => {
          close();
          let touches = 0;
          ctx.maj((d) => {
            touches = appliquerHausse(d.catalogue, {
              pourcent: reglage.pourcent,
              kind: reglage.kind || null,
              categorie: reglage.categorie || null,
              cible: reglage.cible,
            });
          });
          ctx.toast(`${pluriel(touches, "article")} mis à jour.`);
        },
      }),
    ],
  });
}

/* ============================== Les analyses ============================== */

function blocMarges(ctx, suspects) {
  return carteListe({
    variante: "avert",
    titre: "Marges à regarder",
    sousTitre: "Sous 15 %, on travaille pour le fournisseur ; au-dessus de 70 % sur une fourniture, il y a souvent une erreur de saisie",
    contenu: el(
      "div",
      suspects.slice(0, 10).map(({ article, marge: m }) =>
        el(
          "button.ligne.ligne--cliquable",
          { type: "button", onclick: () => ouvrirArticle(ctx, article) },
          el(
            `div.ligne__icone${m.taux < 15 ? ".ligne__icone--alerte" : ""}`,
            icone("chiffres", 18)
          ),
          el(
            "div.ligne__corps",
            el("div.ligne__titre", article.designation),
            el(
              "div.ligne__meta",
              el("span", `achat ${euros(article.achat)}`),
              el("span", `vente ${euros(article.pu)}`)
            )
          ),
          el("div.ligne__droite", el("div.ligne__montant", `${m.taux} %`))
        )
      )
    ),
  });
}

function blocUtilises(ctx, utilises) {
  return carteListe({
    titre: "Les plus posés",
    sousTitre: "Sur l'ensemble des documents envoyés — de bons candidats aux favoris",
    contenu: el(
      "div",
      utilises.map((u) => {
        const article = ctx.dossier.catalogue.find((a) => a.ref === u.ref);
        return el(
          "button.ligne.ligne--cliquable",
          { type: "button", onclick: () => (article ? ouvrirArticle(ctx, article) : null) },
          el("div.ligne__icone", icone("etoile", 18)),
          el(
            "div.ligne__corps",
            el("div.ligne__titre", u.designation),
            el("div.ligne__meta", el("span", u.ref), el("span", `${pluriel(u.n, "fois", "fois")}`))
          ),
          el("div.ligne__droite", el("div.ligne__montant", euros(u.ht)))
        );
      })
    ),
  });
}

/**
 * Le taux horaire minimum.
 *
 * Le calcul est grossier et ne remplace pas un comptable. Il repond quand meme
 * a la question qu'on se pose dix ans trop tard : est-ce que mon taux horaire
 * couvre mes charges ? La variable que tout le monde oublie est la part
 * d'heures NON facturables — devis, trajets, administratif — qui atteint
 * couramment 30 % du temps de travail.
 */
function blocTauxHoraire(ctx) {
  const etat = ctx.vue.taux || {
    chargesAnnuelles: 22000,
    revenuSouhaite: 30000,
    semainesTravaillees: 45,
    heuresParSemaine: 39,
    partNonFacturable: 30,
  };

  const r = tauxHoraireMinimum(etat);
  const actuel = ctx.dossier.entreprise.tauxHoraire;

  const poser = (cle) => (v) => ctx.poserVue({ taux: { ...etat, [cle]: v } });

  return carte({
    titre: "Mon taux horaire couvre-t-il mes charges ?",
    sousTitre: "Un ordre de grandeur, pas un avis comptable",
    corps: [
      el(
        "div.grille.grille--3",
        champMontant("Charges annuelles", {
          valeur: etat.chargesAnnuelles,
          aide: "Véhicule, assurances, outillage, local, comptable, cotisations, téléphone…",
          onchange: poser("chargesAnnuelles"),
        }),
        champMontant("Revenu net souhaité", {
          valeur: etat.revenuSouhaite,
          aide: "Ce que vous voulez vous verser sur l'année.",
          onchange: poser("revenuSouhaite"),
        }),
        champNombre("Semaines travaillées", {
          valeur: etat.semainesTravaillees,
          unite: "sem.",
          onchange: poser("semainesTravaillees"),
        })
      ),
      el(
        "div.grille.grille--2",
        champNombre("Heures par semaine", {
          valeur: etat.heuresParSemaine,
          unite: "h",
          onchange: poser("heuresParSemaine"),
        }),
        champNombre("Part d'heures non facturables", {
          valeur: etat.partNonFacturable,
          unite: "%",
          aide: "Devis, trajets, fournisseur, paperasse. 30 % est un ordre de grandeur courant.",
          onchange: poser("partNonFacturable"),
        })
      ),
      r
        ? el(
            "div.grille.grille--3",
            kpi({ valeur: `${r.heuresFacturables} h`, label: "Heures facturables par an", detail: `sur ${r.heuresTotales} h travaillées` }),
            kpi({ valeur: euros(r.taux), label: "Taux horaire minimum", detail: "pour couvrir charges et revenu" }),
            kpi({
              valeur: euros(actuel),
              label: "Votre taux actuel",
              ton: actuel >= r.taux ? "ok" : "alerte",
              detail: actuel >= r.taux ? "au-dessus du minimum" : `${euros(r.taux - actuel)} manquants par heure`,
            })
          )
        : null,
    ],
  });
}

