/**
 * documents.js — les devis, les factures et les avoirs : la liste et l'editeur.
 *
 * Un seul module pour les trois, parce qu'ils partagent 90 % de leur ecran.
 * Ce qui les distingue tient en trois lignes de conditions, et les separer
 * aurait surtout garanti que l'un des deux prenne du retard sur l'autre.
 *
 * LE PIEGE DU RE-RENDU, ET SA SOLUTION. Modifier une quantite change le total
 * de la ligne, le sous-total, la TVA et le TTC — quatre endroits de l'ecran.
 * Re-rendre la page a chaque frappe detruirait le champ en cours d'edition.
 * L'editeur garde donc la liste de ses cases de total et les met a jour une
 * par une : le DOM n'est pas reconstruit, le curseur ne bouge pas.
 */

import { el, fill } from "../core/dom.js";
import {
  aide,
  autoComplete,
  bouton,
  boutonIcone,
  carte,
  carteListe,
  champ,
  champDate,
  champMontant,
  champNombre,
  champSelect,
  champZone,
  filtres,
  kpi,
  recherche,
  segment,
  vide,
} from "./champs.js";
import { icone } from "./icones.js";
import { etatDocument, ligneDocument, retour } from "./parts.js";
import { feuille, imprimer } from "./impression.js";
import {
  ajouteJours,
  aujourdhui,
  dateCourte,
  euros,
  eurosRonds,
  normalise,
  nombre,
  pluriel,
  pourcent,
} from "../core/format.js";
import {
  acomptesDuDevis,
  ajouterPaiement,
  avoirDepuisFacture,
  calculer,
  factureAcompte,
  factureDepuisDevis,
  factureSolde,
  joursRetard,
  manques,
  nomClient,
  penalites,
  statutEffectif,
  supprimerPaiement,
  valider,
} from "../domain/documents.js";
import { documentVide, ligneVide, parId } from "../domain/dossier.js";
import { adresseCourte, correspond } from "../domain/clients.js";
import { chercher as chercherCatalogue, ligneDepuisArticle } from "../domain/catalogue.js";
import { lienMail, remplirModele } from "../domain/mentions.js";
import { id } from "../core/store.js";

/* ============================== Le contexte ============================== */

const estOngletDevis = (ctx) => ctx.onglet === "devis";
const kindsDe = (ctx) => (estOngletDevis(ctx) ? ["devis"] : ["facture", "avoir"]);

export function titre(ctx) {
  const doc = ctx.params ? parId(ctx.dossier.documents, ctx.params) : null;
  if (doc) {
    const nom = doc.kind === "devis" ? "Devis" : doc.kind === "avoir" ? "Avoir" : "Facture";
    return `${nom} ${doc.numero || "(brouillon)"}`;
  }
  return estOngletDevis(ctx) ? "Devis" : "Factures";
}

export function actions(ctx) {
  const doc = ctx.params ? parId(ctx.dossier.documents, ctx.params) : null;
  if (doc) return actionsDocument(ctx, doc);
  return [
    bouton(estOngletDevis(ctx) ? "Nouveau devis" : "Nouvelle facture", {
      ico: "plus",
      variante: "plein",
      petit: true,
      onclick: () => creerDocument(ctx, estOngletDevis(ctx) ? "devis" : "facture"),
    }),
  ];
}

export const nouveau = (ctx) => creerDocument(ctx, estOngletDevis(ctx) ? "devis" : "facture");

export function rendre(ctx) {
  const doc = ctx.params ? parId(ctx.dossier.documents, ctx.params) : null;
  if (ctx.params && !doc) {
    return vide({
      ico: "devis",
      titre: "Document introuvable",
      texte: "Il a peut-être été supprimé.",
      action: bouton("Revenir à la liste", { variante: "plein", onclick: () => ctx.aller(ctx.onglet) }),
    });
  }
  return doc ? editeur(ctx, doc) : liste(ctx);
}

/* ================================= Création =============================== */

/**
 * Cree un document et ouvre son editeur.
 *
 * Le document nait SANS NUMERO : il ne l'obtiendra qu'a la validation, pour
 * que la sequence des factures reste continue meme si l'on abandonne dix
 * brouillons. Voir domain/numerotation.js.
 */
export function creerDocument(ctx, kind, patch = {}) {
  const e = ctx.dossier.entreprise;
  const date = aujourdhui();
  const doc = documentVide(kind, {
    date,
    echeance: ajouteJours(
      date,
      nombre(kind === "devis" ? e.validiteDevis : e.delaiPaiement, 30)
    ),
    ...patch,
  });

  ctx.maj((d) => d.documents.push(doc));
  ctx.aller(kind === "devis" ? "devis" : "factures", doc.id);
}

/* ================================= La liste =============================== */

function liste(ctx) {
  const kinds = kindsDe(ctx);
  const q = ctx.vue.q || "";
  const filtre = ctx.vue.filtre || "tous";

  const tous = ctx.dossier.documents
    .filter((d) => kinds.includes(d.kind))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.numero || "").localeCompare(a.numero || ""));

  const avecCalc = tous.map((doc) => {
    const calc = calculer(doc, ctx.dossier.entreprise);
    return { doc, calc, cle: statutEffectif(doc, calc) };
  });

  const compteur = (cle) => avecCalc.filter((x) => x.cle === cle).length;

  const listeFiltres = estOngletDevis(ctx)
    ? [
        { cle: "tous", nom: "Tous" },
        { cle: "brouillon", nom: "Brouillons" },
        { cle: "envoye", nom: "En attente" },
        { cle: "expire", nom: "Expirés" },
        { cle: "accepte", nom: "Acceptés" },
        { cle: "refuse", nom: "Refusés" },
      ]
    : [
        { cle: "tous", nom: "Toutes" },
        { cle: "brouillon", nom: "Brouillons" },
        { cle: "envoyee", nom: "Envoyées" },
        { cle: "retard", nom: "En retard" },
        { cle: "partielle", nom: "Partielles" },
        { cle: "payee", nom: "Payées" },
      ];

  const visibles = avecCalc
    .filter((x) => filtre === "tous" || x.cle === filtre)
    .filter((x) => {
      if (!q) return true;
      const client = parId(ctx.dossier.clients, x.doc.clientId);
      const champs = [x.doc.numero, x.doc.objet, x.doc.chantier, client ? nomClient(client) : ""];
      return champs.some((c) => normalise(c).includes(normalise(q)));
    });

  const totalVisible = visibles.reduce((s, x) => s + (x.doc.kind === "avoir" ? -x.calc.ttc : x.calc.ttc), 0);
  const resteVisible = visibles.reduce((s, x) => s + (x.doc.kind === "devis" ? 0 : x.calc.reste), 0);

  return el(
    "div.onglet",
    resume(ctx, avecCalc),
    el(
      "div.barre-outils",
      recherche({
        valeur: q,
        placeholder: "Numéro, client, objet…",
        oninput: (v) => ctx.poserVue({ q: v }),
      })
    ),
    filtres(
      listeFiltres.map((f) => ({
        nom: f.nom,
        n: f.cle === "tous" ? avecCalc.length : compteur(f.cle),
        actif: filtre === f.cle,
        onclick: () => ctx.poserVue({ filtre: f.cle }),
      }))
    ),
    visibles.length
      ? carteListe({
          titre: `${pluriel(visibles.length, "document")}`,
          sousTitre: estOngletDevis(ctx)
            ? `${eurosRonds(totalVisible)} TTC au total`
            : `${eurosRonds(totalVisible)} TTC · ${eurosRonds(resteVisible)} restant dû`,
          contenu: el(
            "div",
            visibles.map((x) => ligneDocument(ctx, x.doc, { onclick: () => ctx.aller(ctx.onglet, x.doc.id) }))
          ),
        })
      : vide({
          ico: estOngletDevis(ctx) ? "devis" : "factures",
          titre: q || filtre !== "tous" ? "Rien ne correspond" : "Aucun document",
          texte:
            q || filtre !== "tous"
              ? "Essayez un autre filtre ou une autre recherche."
              : "Un devis chiffré et envoyé le jour de la visite se signe deux fois plus souvent qu'un devis envoyé la semaine suivante.",
          action: bouton(estOngletDevis(ctx) ? "Nouveau devis" : "Nouvelle facture", {
            variante: "plein",
            ico: "plus",
            onclick: () => creerDocument(ctx, estOngletDevis(ctx) ? "devis" : "facture"),
          }),
        })
  );
}

function resume(ctx, avecCalc) {
  if (estOngletDevis(ctx)) {
    const attente = avecCalc.filter((x) => x.cle === "envoye");
    const acceptes = avecCalc.filter((x) => x.cle === "accepte");
    const decides = acceptes.length + avecCalc.filter((x) => x.cle === "refuse").length;

    return el(
      "div.grille.grille--3",
      kpi({
        valeur: String(attente.length),
        label: "En attente",
        detail: `${eurosRonds(attente.reduce((s, x) => s + x.calc.ttc, 0))} en jeu`,
        ton: attente.length ? "avert" : "",
      }),
      kpi({
        valeur: String(acceptes.length),
        label: "Acceptés",
        detail: `${eurosRonds(acceptes.reduce((s, x) => s + x.calc.ttc, 0))} signés`,
        ton: "ok",
      }),
      kpi({
        valeur: decides ? `${Math.round((acceptes.length / decides) * 100)} %` : "—",
        label: "Taux de signature",
        detail: decides ? `sur ${pluriel(decides, "devis")} décidé(s)` : "pas encore de devis décidé",
      })
    );
  }

  const impayees = avecCalc.filter((x) => x.doc.kind === "facture" && x.calc.reste > 0 && x.doc.statut !== "brouillon");
  const retard = impayees.filter((x) => x.cle === "retard");

  return el(
    "div.grille.grille--3",
    kpi({
      valeur: eurosRonds(impayees.reduce((s, x) => s + x.calc.reste, 0)),
      label: "Reste à encaisser",
      detail: pluriel(impayees.length, "facture"),
    }),
    kpi({
      valeur: eurosRonds(retard.reduce((s, x) => s + x.calc.reste, 0)),
      label: "Dont en retard",
      detail: retard.length ? `${pluriel(retard.length, "facture")} à relancer` : "aucun retard",
      ton: retard.length ? "alerte" : "ok",
    }),
    kpi({
      valeur: String(avecCalc.filter((x) => x.doc.statut === "brouillon").length),
      label: "Brouillons",
      detail: "sans numéro tant qu'ils ne sont pas validés",
    })
  );
}

/* ================================ L'editeur =============================== */

function editeur(ctx, doc) {
  const mode = ctx.vue.mode || "edition";

  const barre = el(
    "div.barre-outils.no-print",
    retour(ctx, ctx.onglet, estOngletDevis(ctx) ? "Tous les devis" : "Toutes les factures"),
    el(
      "div.pousse",
      segment(
        [
          { valeur: "edition", nom: "Édition" },
          { valeur: "apercu", nom: "Aperçu" },
        ],
        mode,
        (v) => ctx.poserVue({ mode: v })
      )
    )
  );

  if (mode === "apercu") {
    return el("div.onglet", barre, apercu(ctx, doc));
  }

  /* --- Les rappels de recalcul -------------------------------------------
     Chaque ligne enregistre ici la fonction qui met a jour SA case de total.
     `recalculer()` les appelle toutes, puis repeint le bloc des totaux. Rien
     n'est reconstruit : le champ en cours d'edition garde son curseur. */
  const majTotaux = [];
  const boiteTotaux = el("div");
  const boiteVerif = el("div");

  const recalculer = () => {
    const calc = calculer(doc, ctx.dossier.entreprise);
    for (const f of majTotaux) f(calc);
    fill(boiteTotaux, blocTotaux(ctx, doc, calc, recalculer));
    // La liste des mentions manquantes se repeint elle aussi : sans cela, elle
    // continuerait a reclamer « aucune ligne chiffrée » sur un document qu'on
    // vient de remplir sous ses yeux.
    fill(boiteVerif, verifications(ctx, doc, calc));
  };

  const boiteLignes = el("div.lignes");
  const redessinerLignes = () => {
    majTotaux.length = 0;
    fill(boiteLignes, ...lignesEditables(ctx, doc, { majTotaux, recalculer, redessinerLignes }));
    recalculer();
  };
  redessinerLignes();

  const calcInitial = calculer(doc, ctx.dossier.entreprise);

  return el(
    "div.onglet",
    barre,
    enTeteDocument(ctx, doc),
    carteListe({
      titre: "Détail",
      sousTitre: "Chaque ligne porte sa quantité, son prix unitaire et son taux de TVA",
      actions: [
        boutonIcone("plus", "Ajouter une ligne libre", {
          variante: "contour",
          onclick: () => {
            ctx.majSilencieux(() => doc.lignes.push(ligneVide({ tva: ctx.dossier.entreprise.tvaDefaut })));
            redessinerLignes();
          },
        }),
      ],
      contenu: el(
        "div",
        el(
          "div.lignes__tete",
          el("div", "Désignation"),
          el("div", "Qté"),
          el("div", "Unité"),
          el("div", "P.U. HT"),
          el("div", "Remise"),
          el("div", "TVA"),
          el("div", "Total HT"),
          el("div", "")
        ),
        boiteLignes
      ),
      pied: [ajoutLigne(ctx, doc, redessinerLignes)],
    }),
    boiteTotaux,
    suivi(ctx, doc, calcInitial),
    boiteVerif
  );
}

/* ------------------------------- En-tete -------------------------------- */

function enTeteDocument(ctx, doc) {
  const client = parId(ctx.dossier.clients, doc.clientId);

  const choixClient = client
    ? el(
        "div.champ",
        el("div.champ__label", "Client"),
        el(
          "div.liste",
          el(
            "div.ligne",
            el("div.ligne__icone.ligne__icone--accent", icone("clients", 18)),
            el(
              "div.ligne__corps",
              el("div.ligne__titre", nomClient(client)),
              el("div.ligne__meta", el("span", adresseCourte(client) || "adresse non renseignée"))
            ),
            el(
              "div.ligne__actions",
              boutonIcone("clients", "Ouvrir la fiche client", {
                onclick: () => ctx.aller("clients", client.id),
              }),
              boutonIcone("croix", "Changer de client", {
                onclick: () => ctx.maj(() => {
                  doc.clientId = "";
                }),
              })
            )
          )
        )
      )
    : autoComplete({
        label: "Client",
        placeholder: "Nom, téléphone, ville…",
        aide: "Obligatoire : un document sans client ne peut pas être envoyé.",
        chercher: (q) => ctx.dossier.clients.filter((c) => !c.archive && correspond(c, q)),
        rendreItem: (c) => ({ nom: nomClient(c), note: adresseCourte(c) || c.tel }),
        onchoisir: (c) =>
          ctx.maj(() => {
            doc.clientId = c.id;
            if (!doc.chantier) doc.chantier = adresseCourte(c);
          }),
      });

  return carte({
    titre: doc.numero || "Brouillon — numéro attribué à la validation",
    sousTitre: doc.kind === "devis" ? "Devis" : doc.kind === "avoir" ? "Avoir" : "Facture",
    actions: [etatDocument(ctx.ref, doc, calculer(doc, ctx.dossier.entreprise))],
    corps: [
      choixClient,
      el(
        "div.grille.grille--2",
        champ("Objet", {
          valeur: doc.objet,
          placeholder: "Remplacement chaudière gaz, salle de bain, dépannage…",
          aide: "S'imprime en haut du document. C'est ce que le client lira en premier.",
          oninput: (v) => ctx.majSilencieux(() => {
            doc.objet = v;
          }),
        }),
        champ("Adresse du chantier", {
          valeur: doc.chantier,
          placeholder: "Si différente de l'adresse du client",
          oninput: (v) => ctx.majSilencieux(() => {
            doc.chantier = v;
          }),
        })
      ),
      el(
        "div.grille.grille--2",
        champDate("Date", {
          valeur: doc.date,
          onchange: (v) => ctx.maj(() => {
            doc.date = v;
          }),
        }),
        champDate(doc.kind === "devis" ? "Valable jusqu'au" : "Échéance de paiement", {
          valeur: doc.echeance,
          aide:
            doc.kind === "devis"
              ? "Au-delà, les prix ne vous engagent plus — les fournitures bougent."
              : "Par défaut, le délai réglé dans les réglages de l'entreprise.",
          onchange: (v) => ctx.maj(() => {
            doc.echeance = v;
          }),
        })
      ),
    ],
  });
}

/* ------------------------------- Les lignes ------------------------------ */

function lignesEditables(ctx, doc, { majTotaux, recalculer, redessinerLignes }) {
  return (doc.lignes || []).map((ligne, index) => {
    const supprimer = boutonIcone("poubelle", "Supprimer la ligne", {
      variante: "danger",
      onclick: () => {
        ctx.majSilencieux(() => {
          doc.lignes = doc.lignes.filter((l) => l.id !== ligne.id);
        });
        redessinerLignes();
      },
    });

    if (ligne.type === "section" || ligne.type === "texte") {
      return el(
        `div.lgn.lgn--${ligne.type}`,
        champ(null, {
          valeur: ligne.designation,
          placeholder: ligne.type === "section" ? "Titre de section — ex. Salle de bain" : "Ligne de commentaire",
          oninput: (v) => ctx.majSilencieux(() => {
            ligne.designation = v;
          }),
        }),
        el("div.lgn__sup", supprimer)
      );
    }

    const caseTotal = el("div.lgn__total", euros(nombre(ligne.quantite, 0) * nombre(ligne.pu, 0)));
    majTotaux.push((calc) => {
      const d = calc.detail.find((x) => x.ligne.id === ligne.id);
      caseTotal.textContent = euros(d ? d.ht : 0);
    });

    const majSilence = (fn) => {
      ctx.majSilencieux(fn);
      recalculer();
    };

    return el(
      "div.lgn",
      el(
        "div.champ.champ--designation",
        el("label.lgn__label", `Ligne ${index + 1}`),
        champ(null, {
          valeur: ligne.designation,
          placeholder: "Désignation de la prestation ou de la fourniture",
          oninput: (v) => ctx.majSilencieux(() => {
            ligne.designation = v;
          }),
        }),
        champ(null, {
          valeur: ligne.detail,
          placeholder: "Précision (marque, référence, ce qui est compris)",
          classe: "champ--detail",
          oninput: (v) => ctx.majSilencieux(() => {
            ligne.detail = v;
          }),
        })
      ),
      el(
        "div.champ",
        el("label.lgn__label", "Qté"),
        champNombre(null, {
          valeur: ligne.quantite,
          oninput: (v) => majSilence(() => {
            ligne.quantite = v;
          }),
        })
      ),
      el(
        "div.champ",
        el("label.lgn__label", "Unité"),
        champSelect(null, {
          valeur: ligne.unite,
          options: ctx.ref.reference.unites.map((u) => ({ valeur: u, nom: u })),
          onchange: (v) => ctx.majSilencieux(() => {
            ligne.unite = v;
          }),
        })
      ),
      el(
        "div.champ",
        el("label.lgn__label", "P.U. HT"),
        champMontant(null, {
          valeur: ligne.pu,
          oninput: (v) => majSilence(() => {
            ligne.pu = v;
          }),
        })
      ),
      el(
        "div.champ",
        el("label.lgn__label", "Remise"),
        champMontant(null, {
          valeur: ligne.remise,
          unite: "%",
          oninput: (v) => majSilence(() => {
            ligne.remise = v;
          }),
        })
      ),
      el(
        "div.champ",
        el("label.lgn__label", "TVA"),
        ctx.dossier.entreprise.assujettiTva === false
          ? el("div.champ__aide", "franchise")
          : champSelect(null, {
              valeur: ligne.tva,
              options: ctx.ref.tva.taux
                .filter((t) => t.valeur > 0)
                .map((t) => ({ valeur: t.valeur, nom: pourcent(t.valeur) })),
              onchange: (v) => majSilence(() => {
                ligne.tva = nombre(v);
              }),
            })
      ),
      caseTotal,
      el("div.lgn__sup", supprimer)
    );
  });
}

/**
 * Le pied de la carte des lignes : le catalogue et les lignes speciales.
 *
 * Le catalogue est un champ de recherche, pas un menu deroulant : avec
 * soixante articles, un menu deroulant demande de faire defiler, alors qu'on
 * sait toujours les trois premieres lettres de ce qu'on cherche.
 */
function ajoutLigne(ctx, doc, redessinerLignes) {
  const ajouter = (l) => {
    ctx.majSilencieux(() => doc.lignes.push(l));
    redessinerLignes();
  };

  return el(
    "div",
    { style: { width: "100%", display: "flex", flexDirection: "column", gap: "12px" } },
    autoComplete({
      label: "Ajouter depuis le catalogue",
      placeholder: "Chaudière, main d'œuvre, groupe de sécurité…",
      chercher: (q) => chercherCatalogue(ctx.dossier.catalogue, q).slice(0, 30),
      rendreItem: (a) => ({
        nom: `${a.designation}${a.ref ? ` · ${a.ref}` : ""}`,
        note: `${euros(a.pu)} / ${a.unite} · TVA ${pourcent(a.tva)} · ${a.categorie}`,
      }),
      onchoisir: (a) => ajouter(ligneDepuisArticle(a)),
    }),
    el(
      "div.rang",
      bouton("Ligne libre", {
        ico: "plus",
        petit: true,
        onclick: () => ajouter(ligneVide({ tva: ctx.dossier.entreprise.tvaDefaut })),
      }),
      bouton("Fourniture", {
        ico: "plus",
        petit: true,
        onclick: () => ajouter(ligneVide({ type: "fourniture", tva: ctx.dossier.entreprise.tvaDefaut })),
      }),
      bouton("Titre de section", {
        ico: "plus",
        petit: true,
        onclick: () => ajouter(ligneVide({ type: "section", designation: "" })),
      }),
      bouton("Commentaire", {
        ico: "plus",
        petit: true,
        onclick: () => ajouter(ligneVide({ type: "texte", designation: "" })),
      })
    )
  );
}

/* -------------------------------- Totaux -------------------------------- */

function blocTotaux(ctx, doc, calc, recalculer) {
  const e = ctx.dossier.entreprise;
  const majSilence = (fn) => {
    ctx.majSilencieux(fn);
    recalculer();
  };

  const ligneTotal = (label, valeur, variante = "") =>
    el(
      `div.totaux__ligne${variante ? `.totaux__ligne--${variante}` : ""}`,
      el("span.totaux__label", label),
      el("span.totaux__valeur", valeur)
    );

  return carte({
    titre: "Remise, acompte et totaux",
    corps: [
      el(
        "div.grille.grille--large",
        el(
          "div.grille.grille--2",
          el(
            "div.champ",
            el("div.champ__label", "Remise commerciale"),
            el(
              "div.rang",
              segment(
                [
                  { valeur: "pourcent", nom: "%" },
                  { valeur: "euro", nom: "€" },
                ],
                doc.remiseGlobale.type,
                (v) => majSilence(() => {
                  doc.remiseGlobale.type = v;
                })
              ),
              el(
                "div",
                { style: { flex: "1" } },
                champMontant(null, {
                  valeur: doc.remiseGlobale.valeur,
                  unite: doc.remiseGlobale.type === "euro" ? "€" : "%",
                  oninput: (v) => majSilence(() => {
                    doc.remiseGlobale.valeur = v;
                  }),
                })
              )
            ),
            el("div.champ__aide", "Répartie au prorata sur chaque taux de TVA.")
          ),
          doc.kind === "devis"
            ? el(
                "div.champ",
                el("div.champ__label", "Acompte à la commande"),
                el(
                  "div.rang",
                  segment(
                    [
                      { valeur: "pourcent", nom: "%" },
                      { valeur: "euro", nom: "€" },
                    ],
                    doc.acompte.type,
                    (v) => majSilence(() => {
                      doc.acompte.type = v;
                    })
                  ),
                  el(
                    "div",
                    { style: { flex: "1" } },
                    champMontant(null, {
                      valeur: doc.acompte.valeur,
                      unite: doc.acompte.type === "euro" ? "€" : "%",
                      oninput: (v) => majSilence(() => {
                        doc.acompte.valeur = v;
                      }),
                    })
                  )
                ),
                el("div.champ__aide", `Usage courant : ${pourcent(e.acompteDefaut)} à la signature.`)
              )
            : null
        ),
        el(
          "div.totaux",
          ligneTotal("Total brut HT", euros(calc.brutHt)),
          calc.remiseLignes ? ligneTotal("Remises sur lignes", `− ${euros(calc.remiseLignes)}`) : null,
          calc.remiseGlobale ? ligneTotal("Remise commerciale", `− ${euros(calc.remiseGlobale)}`) : null,
          ligneTotal("Total HT", euros(calc.ht)),
          ...(calc.assujetti
            ? calc.tva.map((t) => ligneTotal(`TVA ${pourcent(t.taux)} sur ${euros(t.base)}`, euros(t.montant), "note"))
            : [ligneTotal("TVA non applicable, art. 293 B du CGI", "", "note")]),
          ligneTotal("Total TTC", euros(calc.ttc), "fort"),
          calc.acompte ? ligneTotal("Acompte demandé", euros(calc.acompte), "acompte") : null,
          calc.acompte ? ligneTotal("Solde", euros(calc.soldeApresAcompte), "note") : null,
          doc.kind !== "devis" && calc.paye ? ligneTotal("Déjà réglé", `− ${euros(calc.paye)}`) : null,
          doc.kind !== "devis" && calc.paye ? ligneTotal("Reste dû", euros(calc.reste), "fort") : null
        )
      ),
      calc.tauxReduit
        ? aide(
            `Ce document applique un taux réduit. ${ctx.ref.tva.attestation.texte} L'attestation s'imprime automatiquement au bas du document.`
          )
        : null,
    ],
  });
}

/* -------------------------------- Suivi --------------------------------- */

function suivi(ctx, doc, calc) {
  const blocs = [];

  blocs.push(
    carte({
      titre: "Suivi",
      corps: [
        el(
          "div.grille.grille--2",
          champSelect("État", {
            valeur: doc.statut,
            options: (doc.kind === "devis" ? ctx.ref.reference.statutsDevis : ctx.ref.reference.statutsFacture).map(
              (s) => ({ valeur: s.cle, nom: s.nom })
            ),
            aide: (doc.kind === "devis" ? ctx.ref.reference.statutsDevis : ctx.ref.reference.statutsFacture).find(
              (s) => s.cle === doc.statut
            )?.aide,
            onchange: (v) => ctx.maj(() => {
              doc.statut = v;
            }),
          }),
          doc.statut === "refuse"
            ? champSelect("Motif du refus", {
                valeur: doc.motifRefus,
                options: [
                  { valeur: "", nom: "— non précisé —" },
                  ...ctx.ref.reference.motifsRefus.map((m) => ({ valeur: m, nom: m })),
                ],
                aide: "Au bout de dix devis, le motif dominant dit ce qu'il faut changer.",
                onchange: (v) => ctx.maj(() => {
                  doc.motifRefus = v;
                }),
              })
            : null
        ),
        champZone("Notes internes", {
          valeur: doc.notes,
          lignes: 3,
          aide: "Ne s'imprime pas. Pour ce qu'il faut se rappeler, pas pour ce que le client doit lire.",
          oninput: (v) => ctx.majSilencieux(() => {
            doc.notes = v;
          }),
        }),
      ],
    })
  );

  if (doc.kind !== "devis") blocs.push(paiements(ctx, doc, calc));

  if (doc.kind === "facture" && calc.reste > 0 && joursRetard(doc) > 0) {
    const p = penalites(doc, calc, ctx.dossier.entreprise);
    blocs.push(
      carte({
        variante: "alerte",
        titre: "Facture en retard",
        corps: [
          el(
            "p",
            `${pluriel(p.jours, "jour")} de retard. Les pénalités courent de plein droit depuis le lendemain de l'échéance, sans rappel : `,
            el("strong", euros(p.montant)),
            ` à ce jour, plus l'indemnité forfaitaire de ${euros(p.indemnite)} si le client est un professionnel.`
          ),
          el(
            "div.rang",
            ...ctx.ref.mentions.relances.facture.map((m) =>
              bouton(m.nom, { petit: true, ico: "mail", onclick: () => ouvrirRelance(ctx, doc, calc, m) })
            )
          ),
        ],
      })
    );
  }

  if (doc.kind === "devis" && doc.statut === "envoye") {
    blocs.push(
      carte({
        titre: "Relancer",
        corps: [
          el("p.champ__aide", "Le texte s'ouvre dans votre logiciel de messagerie. Rien n'est envoyé sans vous."),
          el(
            "div.rang",
            ...ctx.ref.mentions.relances.devis.map((m) =>
              bouton(m.nom, { petit: true, ico: "mail", onclick: () => ouvrirRelance(ctx, doc, calc, m) })
            )
          ),
        ],
      })
    );
  }

  return el("div.grille.grille--large", blocs);
}

function paiements(ctx, doc, calc) {
  const liste = doc.paiements || [];

  return carteListe({
    titre: "Règlements",
    sousTitre:
      calc.reste > 0.004
        ? `${euros(calc.paye)} reçus sur ${euros(calc.ttc)} — reste ${euros(calc.reste)}`
        : "soldée",
    actions: [
      bouton("Encaisser", {
        ico: "euro",
        petit: true,
        variante: "plein",
        onclick: () => ouvrirPaiement(ctx, doc, calc),
      }),
    ],
    contenu: liste.length
      ? el(
          "div",
          liste.map((p) =>
            el(
              "div.ligne",
              el("div.ligne__icone.ligne__icone--ok", icone("euro", 18)),
              el(
                "div.ligne__corps",
                el("div.ligne__titre", euros(p.montant)),
                el(
                  "div.ligne__meta",
                  el("span", dateCourte(p.date)),
                  el("span", ctx.ref.reference.moyensPaiement.find((m) => m.cle === p.moyen)?.nom || p.moyen),
                  p.note ? el("span", p.note) : null
                )
              ),
              el(
                "div.ligne__actions",
                boutonIcone("poubelle", "Supprimer ce règlement", {
                  variante: "danger",
                  onclick: () => ctx.maj(() => supprimerPaiement(doc, p.id)),
                })
              )
            )
          )
        )
      : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Aucun règlement enregistré."),
  });
}

function ouvrirPaiement(ctx, doc, calc) {
  const brouillon = {
    montant: calc.reste > 0 ? calc.reste : calc.ttc,
    date: aujourdhui(),
    moyen: "virement",
    note: "",
  };

  ctx.modale({
    titre: "Enregistrer un règlement",
    corps: el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "16px" } },
      champMontant("Montant reçu", {
        valeur: brouillon.montant,
        aide: `Reste dû : ${euros(calc.reste)}. Un montant inférieur enregistre un règlement partiel.`,
        onchange: (v) => {
          brouillon.montant = v;
        },
      }),
      champDate("Date d'encaissement", {
        valeur: brouillon.date,
        aide: "La date où l'argent arrive, pas celle de la facture : c'est elle qui compte pour la trésorerie.",
        onchange: (v) => {
          brouillon.date = v;
        },
      }),
      champSelect("Moyen de paiement", {
        valeur: brouillon.moyen,
        options: ctx.ref.reference.moyensPaiement.map((m) => ({ valeur: m.cle, nom: m.nom })),
        onchange: (v) => {
          brouillon.moyen = v;
        },
      }),
      champ("Note", {
        valeur: "",
        placeholder: "N° de chèque, référence du virement…",
        oninput: (v) => {
          brouillon.note = v;
        },
      })
    ),
    actions: (close) => [
      bouton("Annuler", { onclick: close }),
      bouton("Enregistrer", {
        variante: "plein",
        onclick: () => {
          close();
          ctx.maj(() => {
            ajouterPaiement(doc, brouillon);
            const apres = calculer(doc, ctx.dossier.entreprise);
            if (apres.reste <= 0.004) doc.statut = "payee";
            else if (doc.statut === "brouillon") doc.statut = "partielle";
          });
          ctx.toast("Règlement enregistré.");
        },
      }),
    ],
  });
}

function ouvrirRelance(ctx, doc, calc, modele) {
  const client = parId(ctx.dossier.clients, doc.clientId);
  const texte = remplirModele(modele, { dossier: ctx.dossier, doc, calc, client });

  const zone = el("textarea.saisie.saisie--zone", { rows: 14 });
  zone.value = `${texte.corps}`;

  ctx.modale({
    titre: modele.nom,
    corps: el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "16px" } },
      champ("Objet", { valeur: texte.objet, oninput: (v) => (texte.objet = v) }),
      el("div.champ", el("div.champ__label", "Message"), zone),
      aide(
        client?.email
          ? `Le message s'ouvrira dans votre messagerie, adressé à ${client.email}. Relisez-le avant d'envoyer.`
          : "Ce client n'a pas d'adresse e-mail : copiez le texte, ou complétez sa fiche."
      )
    ),
    actions: (close) => [
      bouton("Copier le texte", {
        ico: "copie",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(zone.value);
            ctx.toast("Texte copié.");
          } catch {
            ctx.toast("Copie impossible : sélectionnez le texte à la main.", { erreur: true });
          }
        },
      }),
      bouton("Fermer", { onclick: close }),
      client?.email
        ? el(
            "a.btn.btn--plein",
            {
              href: lienMail(client.email, { objet: texte.objet, corps: zone.value }),
              onclick: () => {
                ctx.maj(() => {
                  doc.relanceLe = aujourdhui();
                });
                close();
              },
            },
            icone("mail", 17),
            "Ouvrir dans la messagerie"
          )
        : null,
    ].filter(Boolean),
  });
}

/* ----------------------------- Verifications ---------------------------- */

function verifications(ctx, doc, calc) {
  const liste = manques(ctx.dossier, doc, calc);
  if (!liste.length) {
    return carte({
      variante: "ok",
      titre: "Mentions obligatoires",
      corps: aide("Toutes les mentions obligatoires sont présentes. Le document peut partir."),
    });
  }

  return carte({
    variante: "avert",
    titre: "Avant d'envoyer",
    sousTitre: `${pluriel(liste.length, "point")} à compléter`,
    corps: [
      el("ul", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        liste.map((m) => el("li", { style: { display: "flex", gap: "8px" } }, icone("alerte", 15), el("span", m)))
      ),
      bouton("Compléter la fiche entreprise", { onclick: () => ctx.aller("reglages"), petit: true }),
    ],
  });
}

/* -------------------------------- Aperçu -------------------------------- */

function apercu(ctx, doc) {
  return el(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: "16px" } },
    el(
      "div.rang.no-print",
      bouton("Imprimer ou enregistrer en PDF", { variante: "plein", ico: "imprimer", onclick: () => imprimer(ctx) })
    ),
    feuille(ctx, doc)
  );
}

/* ============================ Actions d'en-tete =========================== */

function actionsDocument(ctx, doc) {
  const calc = calculer(doc, ctx.dossier.entreprise);
  const cle = statutEffectif(doc, calc);
  const boutons = [];

  if (doc.statut === "brouillon") {
    boutons.push(
      // Pas de pictogramme sur les actions decisives : sur telephone, l'en-tete
      // reduit les boutons a icone a leur seule icone, et une coche seule ne
      // dit pas si l'on valide, si l'on accepte, ou si l'on marque payé. Sans
      // icone, le libelle survit.
      bouton(doc.kind === "devis" ? "Valider et envoyer" : "Valider la facture", {
        variante: "plein",
        petit: true,
        onclick: async () => {
          // Le calcul est REFAIT ici, et non repris de celui du rendu : les
          // lignes se saisissent sans re-rendre l'en-tete, et un calcul
          // capture au rendu reclamerait « aucune ligne chiffrée » sur un
          // document qu'on vient justement de remplir.
          const liste = manques(ctx.dossier, doc, calculer(doc, ctx.dossier.entreprise));
          if (liste.length) {
            const ok = await ctx.confirmer({
              titre: "Il manque des mentions obligatoires",
              texte: `${liste.length} point(s) sont incomplets — voir le bas de l'écran. Valider quand même ? Le numéro sera attribué définitivement.`,
              valider: "Valider quand même",
              danger: false,
            });
            if (!ok) return;
          }
          ctx.maj((d) => valider(d, doc));
          ctx.toast(`${doc.numero} validé.`);
        },
      })
    );
  }

  if (doc.kind === "devis" && (cle === "envoye" || cle === "expire")) {
    boutons.push(
      bouton("Accepté", {
        variante: "plein",
        petit: true,
        onclick: () =>
          ctx.maj(() => {
            doc.statut = "accepte";
            doc.accepteLe = aujourdhui();
          }),
      }),
      // « Refusé » quitte l'en-tete sur telephone : il reste accessible par le
      // selecteur d'etat de la carte Suivi, ou l'on saisit aussi le motif.
      bouton("Refusé", {
        petit: true,
        optionnel: true,
        onclick: () =>
          ctx.maj(() => {
            doc.statut = "refuse";
          }),
      })
    );
  }

  if (doc.kind === "devis" && doc.statut === "accepte") {
    const acomptes = acomptesDuDevis(ctx.dossier, doc.id);
    boutons.push(
      bouton(acomptes.length ? "Facture de solde" : "Facturer", {
        variante: "plein",
        ico: "factures",
        petit: true,
        onclick: () => {
          const facture = acomptes.length
            ? factureSolde(ctx.dossier, doc, acomptes)
            : factureDepuisDevis(ctx.dossier, doc);
          ctx.maj((d) => d.documents.push(facture));
          ctx.aller("factures", facture.id);
        },
      })
    );
    if (!acomptes.length && calc.acompte > 0) {
      boutons.push(
        bouton("Facture d'acompte", {
          ico: "euro",
          petit: true,
          onclick: () => {
            const facture = factureAcompte(ctx.dossier, doc);
            ctx.maj((d) => d.documents.push(facture));
            ctx.aller("factures", facture.id);
          },
        })
      );
    }
  }

  if (doc.kind === "facture" && doc.statut !== "brouillon" && calc.reste > 0.004) {
    boutons.push(
      bouton("Encaisser", { ico: "euro", petit: true, variante: "plein", onclick: () => ouvrirPaiement(ctx, doc, calc) })
    );
  }

  // « Imprimer » quitte aussi l'en-tete sur telephone : l'onglet Aperçu porte
  // le meme bouton, en grand, juste au-dessus de la feuille.
  boutons.push(
    bouton("Imprimer", {
      ico: "imprimer",
      petit: true,
      optionnel: true,
      onclick: () => {
        ctx.poserVue({ mode: "apercu" });
        imprimer(ctx);
      },
    })
  );

  boutons.push(menuPlus(ctx, doc, calc));
  return boutons;
}

/**
 * Le menu des actions rares : dupliquer, avoir, supprimer.
 *
 * Elles sont rangees derriere un bouton parce qu'on ne s'en sert presque
 * jamais, et qu'une barre d'en-tete a huit boutons ne se lit plus.
 */
function menuPlus(ctx, doc, calc) {
  return boutonIcone("menu", "Autres actions", {
    variante: "contour",
    onclick: () =>
      ctx.modale({
        titre: "Autres actions",
        corps: el(
          "div.liste",
          el(
            "button.ligne.ligne--cliquable",
            {
              type: "button",
              onclick: () => {
                const copie = {
                  ...doc,
                  id: id(doc.kind === "devis" ? "dev" : "fac"),
                  numero: "",
                  statut: "brouillon",
                  date: aujourdhui(),
                  paiements: [],
                  envoyeLe: "",
                  accepteLe: "",
                  lignes: doc.lignes.map((l) => ({ ...l, id: id("lg") })),
                };
                ctx.maj((d) => d.documents.push(copie));
                ctx.aller(doc.kind === "devis" ? "devis" : "factures", copie.id);
                document.querySelector("dialog.modale[open]")?.close();
              },
            },
            el("div.ligne__icone", icone("copie", 18)),
            el(
              "div.ligne__corps",
              el("div.ligne__titre", "Dupliquer"),
              el("div.ligne__meta", el("span", "Nouveau brouillon, mêmes lignes"))
            )
          ),
          doc.kind === "devis" && doc.statut === "accepte"
            ? null
            : doc.kind === "facture" && doc.statut !== "brouillon"
              ? el(
                  "button.ligne.ligne--cliquable",
                  {
                    type: "button",
                    onclick: () => {
                      const avoir = avoirDepuisFacture(ctx.dossier, doc);
                      ctx.maj((d) => d.documents.push(avoir));
                      ctx.aller("factures", avoir.id);
                      document.querySelector("dialog.modale[open]")?.close();
                    },
                  },
                  el("div.ligne__icone.ligne__icone--alerte", icone("archive", 18)),
                  el(
                    "div.ligne__corps",
                    el("div.ligne__titre", "Établir un avoir"),
                    el(
                      "div.ligne__meta",
                      el("span", "La seule façon correcte d'annuler une facture émise")
                    )
                  )
                )
              : null,
          doc.statut === "brouillon"
            ? el(
                "button.ligne.ligne--cliquable",
                {
                  type: "button",
                  onclick: async () => {
                    document.querySelector("dialog.modale[open]")?.close();
                    const ok = await ctx.confirmer({
                      titre: "Supprimer ce brouillon ?",
                      texte: "Il n'a pas de numéro : sa suppression ne laisse aucun trou dans la numérotation.",
                    });
                    if (!ok) return;
                    ctx.maj((d) => {
                      d.documents = d.documents.filter((x) => x.id !== doc.id);
                    });
                    ctx.aller(doc.kind === "devis" ? "devis" : "factures");
                    ctx.toast("Brouillon supprimé.");
                  },
                },
                el("div.ligne__icone.ligne__icone--alerte", icone("poubelle", 18)),
                el(
                  "div.ligne__corps",
                  el("div.ligne__titre", "Supprimer le brouillon"),
                  el("div.ligne__meta", el("span", "Sans numéro, donc sans conséquence"))
                )
              )
            : el(
                "div.ligne",
                el("div.ligne__icone", icone("archive", 18)),
                el(
                  "div.ligne__corps",
                  el("div.ligne__titre", "Suppression impossible"),
                  el(
                    "div.ligne__meta",
                    el(
                      "span",
                      "Un document numéroté doit être conservé. Établissez un avoir pour l'annuler."
                    )
                  )
                )
              )
        ),
        actions: (close) => [bouton("Fermer", { onclick: close })],
      }),
  });
}

