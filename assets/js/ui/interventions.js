/**
 * interventions.js — les bons d'intervention.
 *
 * Le bon d'intervention est ce qu'on remplit SUR PLACE, souvent d'une main,
 * parfois avec des gants. Il n'a donc pas la meme forme qu'un devis : de
 * grandes zones de texte, deux boutons pour pointer l'heure d'arrivee et de
 * depart, et les pieces posees a la volee.
 *
 * Il sert ensuite a trois choses : facturer sans rien avoir oublie, prouver ce
 * qui a ete fait en cas de litige, et retrouver dans deux ans pourquoi cette
 * chaudiere-la se met en securite tous les hivers.
 */

import { el } from "../core/dom.js";
import {
  aide,
  autoComplete,
  bouton,
  boutonIcone,
  carte,
  carteListe,
  champ,
  champDate,
  champHeure,
  champMontant,
  champNombre,
  champSelect,
  champZone,
  coche,
  defs,
  filtres,
  recherche,
  vide,
} from "./champs.js";
import { icone } from "./icones.js";
import { retour } from "./parts.js";
import { imprimer } from "./impression.js";
import {
  arrondi,
  aujourdhui,
  dateCourte,
  dateLongue,
  duree,
  euros,
  heureDe,
  maintenantArrondi,
  minutesEntre,
  normalise,
  nombre,
  pluriel,
} from "../core/format.js";
import { interventionVide, ligneVide, parId, equipementParId } from "../domain/dossier.js";
import { adresseCourte, adresseLignes, correspond, nomClient } from "../domain/clients.js";
import { documentDepuisIntervention } from "../domain/documents.js";
import { chercher as chercherCatalogue, ligneDepuisArticle } from "../domain/catalogue.js";
import { attribuerNumero } from "../domain/numerotation.js";
import { piedDePage } from "../domain/mentions.js";

export function titre(ctx) {
  const i = ctx.params ? parId(ctx.dossier.interventions, ctx.params) : null;
  if (!i) return "Interventions";
  const client = parId(ctx.dossier.clients, i.clientId);
  return `${i.numero || "Bon d'intervention"} — ${client ? nomClient(client) : "sans client"}`;
}

export function actions(ctx) {
  const i = ctx.params ? parId(ctx.dossier.interventions, ctx.params) : null;
  if (i) {
    return [
      bouton("Imprimer", { ico: "imprimer", petit: true, onclick: () => imprimer(ctx) }),
      !i.documentId
        ? bouton("Facturer", {
            ico: "factures",
            variante: "plein",
            petit: true,
            onclick: () => facturer(ctx, i, "facture"),
          })
        : bouton("Voir la facture", {
            ico: "factures",
            petit: true,
            onclick: () => ctx.aller("factures", i.documentId),
          }),
    ];
  }
  return [
    bouton("Nouveau bon", { ico: "plus", variante: "plein", petit: true, onclick: () => ouvrirIntervention(ctx, null) }),
  ];
}

export const nouveau = (ctx) => ouvrirIntervention(ctx, null);

export function rendre(ctx) {
  const i = ctx.params ? parId(ctx.dossier.interventions, ctx.params) : null;
  if (ctx.params && !i) {
    return vide({
      ico: "interventions",
      titre: "Bon d'intervention introuvable",
      action: bouton("Revenir à la liste", { variante: "plein", onclick: () => ctx.aller("interventions") }),
    });
  }
  return i ? fiche(ctx, i) : liste(ctx);
}

/**
 * Cree un bon d'intervention et l'ouvre.
 *
 * Depuis un rendez-vous, il herite du client, de l'appareil, de la date et de
 * l'heure d'arrivee : sur le terrain, tout ce qu'on n'a pas a retaper est
 * autant de gagne.
 */
export function ouvrirIntervention(ctx, existante, options = {}) {
  if (existante) {
    ctx.aller("interventions", existante.id);
    return;
  }

  const rdv = options.rdv || null;
  const inter = interventionVide({
    rdvId: rdv?.id || "",
    clientId: rdv?.clientId || options.clientId || "",
    chantierId: rdv?.chantierId || options.chantierId || "",
    equipementId: rdv?.equipementId || "",
    date: rdv ? rdv.debut.slice(0, 10) : aujourdhui(),
    arrivee: rdv ? heureDe(rdv.debut) : maintenantArrondi(),
    motif: rdv?.titre || rdv?.note || "",
  });

  ctx.maj((d) => {
    inter.numero = attribuerNumero(d, "intervention", inter.date);
    d.interventions.push(inter);
    if (rdv) {
      const r = parId(d.rdv, rdv.id);
      if (r) r.statut = "fait";
    }
  });
  ctx.aller("interventions", inter.id);
}

/* ================================= La liste =============================== */

function liste(ctx) {
  const q = ctx.vue.q || "";
  const filtre = ctx.vue.filtre || "tous";

  const tous = [...ctx.dossier.interventions].sort((a, b) => b.date.localeCompare(a.date));
  const visibles = tous
    .filter((i) => (filtre === "afacturer" ? i.aFacturer && !i.documentId : filtre === "facturees" ? Boolean(i.documentId) : true))
    .filter((i) => {
      if (!q) return true;
      const client = parId(ctx.dossier.clients, i.clientId);
      return [i.numero, i.motif, i.diagnostic, i.travaux, client ? nomClient(client) : ""].some((c) =>
        normalise(c).includes(normalise(q))
      );
    });

  return el(
    "div.onglet",
    el(
      "div.barre-outils",
      recherche({ valeur: q, placeholder: "Client, motif, diagnostic…", oninput: (v) => ctx.poserVue({ q: v }) })
    ),
    filtres([
      { nom: "Tous", n: tous.length, actif: filtre === "tous", onclick: () => ctx.poserVue({ filtre: "tous" }) },
      {
        nom: "À facturer",
        n: tous.filter((i) => i.aFacturer && !i.documentId).length,
        actif: filtre === "afacturer",
        onclick: () => ctx.poserVue({ filtre: "afacturer" }),
      },
      {
        nom: "Facturées",
        n: tous.filter((i) => i.documentId).length,
        actif: filtre === "facturees",
        onclick: () => ctx.poserVue({ filtre: "facturees" }),
      },
    ]),
    visibles.length
      ? carteListe({
          titre: pluriel(visibles.length, "bon d'intervention", "bons d'intervention"),
          contenu: el(
            "div",
            visibles.map((i) => {
              const client = parId(ctx.dossier.clients, i.clientId);
              const total = arrondi(
                (i.lignes || []).reduce((s, l) => s + nombre(l.quantite, 0) * nombre(l.pu, 0), 0)
              );
              return el(
                "button.ligne.ligne--cliquable",
                { type: "button", onclick: () => ctx.aller("interventions", i.id) },
                el(
                  `div.ligne__icone${i.documentId ? ".ligne__icone--ok" : ""}`,
                  icone("interventions", 18)
                ),
                el(
                  "div.ligne__corps",
                  el("div.ligne__titre", `${i.numero || "Bon"} — ${client ? nomClient(client) : "sans client"}`),
                  el(
                    "div.ligne__meta",
                    el("span", dateCourte(i.date)),
                    i.motif ? el("span", i.motif) : null,
                    i.arrivee && i.depart ? el("span", duree(minutesEntre(`${i.date}T${i.arrivee}`, `${i.date}T${i.depart}`))) : null
                  )
                ),
                el(
                  "div.ligne__droite",
                  total ? el("div.ligne__montant", euros(total)) : null,
                  i.documentId
                    ? el("span.etat.etat--ok", "Facturé")
                    : i.aFacturer
                      ? el("span.etat.etat--avert", "À facturer")
                      : el("span.etat.etat--neutre", "Sans suite")
                )
              );
            })
          ),
        })
      : vide({
          ico: "interventions",
          titre: "Aucun bon d'intervention",
          texte:
            "Le bon d'intervention se remplit sur place : heure d'arrivée, ce qui a été constaté, ce qui a été fait, les pièces posées. Il devient une facture en un clic.",
          action: bouton("Nouveau bon", { variante: "plein", ico: "plus", onclick: () => ouvrirIntervention(ctx, null) }),
        })
  );
}

/* ================================= La fiche =============================== */

function fiche(ctx, inter) {
  const client = parId(ctx.dossier.clients, inter.clientId);
  const eq = equipementParId(ctx.dossier, inter.equipementId);
  const checklists = ctx.ref.checklist.checklists;
  const choisie = checklists.find((c) => c.cle === (ctx.vue.checklist || "")) || null;

  const maj = (nom) => (v) =>
    ctx.majSilencieux(() => {
      inter[nom] = v;
    });

  return el(
    "div.onglet",
    el("div.barre-outils.no-print", retour(ctx, "interventions", "Tous les bons")),

    carte({
      titre: "Intervention",
      sousTitre: inter.numero,
      corps: [
        client
          ? el(
              "div.liste",
              el(
                "div.ligne",
                el("div.ligne__icone.ligne__icone--accent", icone("clients", 18)),
                el(
                  "div.ligne__corps",
                  el("div.ligne__titre", nomClient(client)),
                  el("div.ligne__meta", el("span", adresseCourte(client)), client.tel ? el("span", client.tel) : null)
                ),
                el(
                  "div.ligne__actions",
                  boutonIcone("clients", "Ouvrir la fiche client", { onclick: () => ctx.aller("clients", client.id) })
                )
              )
            )
          : autoComplete({
              label: "Client",
              placeholder: "Nom, téléphone, ville…",
              chercher: (q) => ctx.dossier.clients.filter((c) => !c.archive && correspond(c, q)),
              rendreItem: (c) => ({ nom: nomClient(c), note: adresseCourte(c) || c.tel }),
              onchoisir: (c) => ctx.maj(() => {
                inter.clientId = c.id;
              }),
            }),

        el(
          "div.grille.grille--3",
          champDate("Date", { valeur: inter.date, onchange: (v) => ctx.maj(() => {
            inter.date = v;
          }) }),
          el(
            "div.champ",
            el("div.champ__label", "Heure d'arrivée"),
            el(
              "div.rang",
              el("div", { style: { flex: "1" } }, champHeure(null, { valeur: inter.arrivee, onchange: maj("arrivee") })),
              boutonIcone("horloge", "Pointer l'heure actuelle", {
                variante: "contour",
                onclick: () => ctx.maj(() => {
                  inter.arrivee = maintenantArrondi();
                }),
              })
            )
          ),
          el(
            "div.champ",
            el("div.champ__label", "Heure de départ"),
            el(
              "div.rang",
              el("div", { style: { flex: "1" } }, champHeure(null, { valeur: inter.depart, onchange: maj("depart") })),
              boutonIcone("horloge", "Pointer l'heure actuelle", {
                variante: "contour",
                onclick: () => ctx.maj(() => {
                  inter.depart = maintenantArrondi();
                }),
              })
            )
          )
        ),

        inter.arrivee && inter.depart
          ? aide(
              `Durée sur place : ${duree(minutesEntre(`${inter.date}T${inter.arrivee}`, `${inter.date}T${inter.depart}`))}. Vérifiez que la main d'œuvre facturée y correspond.`
            )
          : null,

        client && (client.equipements || []).length
          ? champSelect("Appareil", {
              valeur: inter.equipementId,
              options: [
                { valeur: "", nom: "— aucun —" },
                ...client.equipements.map((e) => ({
                  valeur: e.id,
                  nom: [e.marque, e.modele, e.emplacement].filter(Boolean).join(" · ") || "Appareil",
                })),
              ],
              onchange: (v) => ctx.maj(() => {
                inter.equipementId = v;
              }),
            })
          : null,

        eq
          ? defs([
              { label: "Marque et modèle", valeur: [eq.marque, eq.modele].filter(Boolean).join(" ") },
              { label: "Numéro de série", valeur: eq.numeroSerie },
              { label: "Posé le", valeur: eq.installeLe ? dateCourte(eq.installeLe) : "" },
              { label: "Dernier entretien", valeur: eq.dernierEntretien ? dateCourte(eq.dernierEntretien) : "" },
            ])
          : null,
      ],
    }),

    carte({
      titre: "Constat et travaux",
      corps: [
        champ("Motif de l'appel", {
          valeur: inter.motif,
          placeholder: "Ce que le client a décrit",
          oninput: maj("motif"),
        }),
        champZone("Diagnostic", {
          valeur: inter.diagnostic,
          lignes: 4,
          placeholder: "Ce qui a été constaté : code défaut, pièce en cause, pression, mesures relevées…",
          aide: "C'est ce paragraphe qu'on relira dans deux ans en se demandant pourquoi cet appareil retombe en panne.",
          oninput: maj("diagnostic"),
        }),
        champZone("Travaux réalisés", {
          valeur: inter.travaux,
          lignes: 4,
          placeholder: "Ce qui a été fait, ce qui reste à faire, les recommandations",
          oninput: maj("travaux"),
        }),
      ],
    }),

    checklist(ctx, checklists, choisie),
    lignes(ctx, inter),
    suite(ctx, inter),
    feuilleIntervention(ctx, inter, client, eq)
  );
}

/* -------------------------------- Checklist ----------------------------- */

/**
 * Les check-lists de terrain.
 *
 * Elles ne sont pas enregistrees dans le dossier, et c'est voulu : ce ne sont
 * pas des donnees, ce sont des rappels. Les cocher servirait a se donner
 * l'impression d'avoir fait, alors que ce qui compte est le paragraphe de
 * diagnostic juste au-dessus.
 */
function checklist(ctx, checklists, choisie) {
  return carte({
    titre: "Mémo d'intervention",
    sousTitre: "Ce qu'on oublie quand on est pressé",
    corps: [
      champSelect("Type d'intervention", {
        valeur: choisie?.cle || "",
        options: [{ valeur: "", nom: "— choisir —" }, ...checklists.map((c) => ({ valeur: c.cle, nom: c.nom }))],
        onchange: (v) => ctx.poserVue({ checklist: v }),
      }),
      choisie
        ? el(
            "div",
            el("div.champ__aide", `Durée habituelle : ${choisie.duree}`),
            el(
              "ol",
              { style: { display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "0" } },
              choisie.etapes.map((e, i) =>
                el(
                  "li",
                  { style: { display: "flex", gap: "10px", fontSize: "var(--t-petit)" } },
                  el(
                    "span",
                    {
                      style: {
                        flex: "none",
                        fontFamily: "var(--font-chiffre)",
                        color: "var(--texte-fantome)",
                        fontWeight: "700",
                      },
                    },
                    String(i + 1).padStart(2, "0")
                  ),
                  el("span", e)
                )
              )
            )
          )
        : null,
    ],
  });
}

/* -------------------------------- Les lignes ---------------------------- */

function lignes(ctx, inter) {
  const total = arrondi((inter.lignes || []).reduce((s, l) => s + nombre(l.quantite, 0) * nombre(l.pu, 0), 0));

  return carteListe({
    titre: "Main d'œuvre et pièces posées",
    sousTitre: total ? `${euros(total)} HT — reprises telles quelles sur la facture` : "Rien de chiffré pour l'instant",
    contenu: el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "8px", padding: "16px" } },
      (inter.lignes || []).map((l) =>
        el(
          "div.rang",
          { style: { alignItems: "flex-end" } },
          el("div", { style: { flex: "3", minWidth: "160px" } }, champ(null, {
            valeur: l.designation,
            placeholder: "Désignation",
            oninput: (v) => ctx.majSilencieux(() => {
              l.designation = v;
            }),
          })),
          el("div", { style: { flex: "0 0 90px" } }, champNombre(null, {
            valeur: l.quantite,
            unite: l.unite,
            onchange: (v) => ctx.maj(() => {
              l.quantite = v;
            }),
          })),
          el("div", { style: { flex: "0 0 120px" } }, champMontant(null, {
            valeur: l.pu,
            onchange: (v) => ctx.maj(() => {
              l.pu = v;
            }),
          })),
          boutonIcone("poubelle", "Supprimer la ligne", {
            variante: "danger",
            onclick: () => ctx.maj(() => {
              inter.lignes = inter.lignes.filter((x) => x.id !== l.id);
            }),
          })
        )
      ),
      autoComplete({
        label: "Ajouter depuis le catalogue",
        placeholder: "Main d'œuvre, groupe de sécurité, déplacement…",
        chercher: (q) => chercherCatalogue(ctx.dossier.catalogue, q).slice(0, 30),
        rendreItem: (a) => ({ nom: a.designation, note: `${euros(a.pu)} / ${a.unite} · ${a.categorie}` }),
        onchoisir: (a) => ctx.maj(() => inter.lignes.push(ligneDepuisArticle(a))),
      }),
      bouton("Ligne libre", {
        ico: "plus",
        petit: true,
        onclick: () => ctx.maj(() => inter.lignes.push(ligneVide({ tva: ctx.dossier.entreprise.tvaDefaut }))),
      })
    ),
  });
}

/* --------------------------------- Suite -------------------------------- */

function suite(ctx, inter) {
  return carte({
    titre: "Suite à donner",
    corps: [
      coche("À facturer", {
        valeur: inter.aFacturer === true,
        note: "Décochez pour une intervention sous garantie, sous contrat, ou offerte.",
        onchange: (v) => ctx.maj(() => {
          inter.aFacturer = v;
        }),
      }),
      inter.documentId
        ? aide("Cette intervention a déjà été facturée.")
        : el(
            "div.rang",
            bouton("Créer la facture", {
              variante: "plein",
              ico: "factures",
              onclick: () => facturer(ctx, inter, "facture"),
            }),
            bouton("Créer un devis", { ico: "devis", onclick: () => facturer(ctx, inter, "devis") })
          ),
      el(
        "div.rang",
        bouton("Supprimer ce bon", {
          variante: "danger",
          ico: "poubelle",
          onclick: async () => {
            const ok = await ctx.confirmer({
              titre: "Supprimer ce bon d'intervention ?",
              texte: "Le rendez-vous et la facture éventuelle sont conservés.",
            });
            if (!ok) return;
            ctx.aller("interventions");
            ctx.maj((d) => {
              d.interventions = d.interventions.filter((x) => x.id !== inter.id);
            });
          },
        })
      ),
    ],
  });
}

function facturer(ctx, inter, kind) {
  const doc = documentDepuisIntervention(ctx.dossier, inter, kind);
  ctx.maj((d) => {
    d.documents.push(doc);
    const i = parId(d.interventions, inter.id);
    if (i && kind === "facture") i.documentId = doc.id;
  });
  ctx.aller(kind === "devis" ? "devis" : "factures", doc.id);
}

/* ---------------------------- La feuille papier -------------------------
   Le bon d'intervention imprime, a faire signer sur place. Il reprend la mise
   en page du devis : c'est la meme entreprise, et le client doit reconnaitre
   les documents qu'il recoit.
   ======================================================================== */

function feuilleIntervention(ctx, inter, client, eq) {
  const e = ctx.dossier.entreprise;
  const total = arrondi((inter.lignes || []).reduce((s, l) => s + nombre(l.quantite, 0) * nombre(l.pu, 0), 0));

  return el(
    "div.doc",
    el(
      "div.doc__tete",
      el(
        "div.doc__emetteur",
        el("strong", e.nom || "Votre entreprise"),
        e.adresse ? el("div", e.adresse) : null,
        el("div", [e.cp, e.ville].filter(Boolean).join(" ")),
        e.tel ? el("div", `Tél. ${e.tel}`) : null
      ),
      el(
        "div",
        el("div.doc__titre", "Bon d'intervention"),
        el("div.doc__numero", inter.numero || ""),
        el("div.doc__dates", dateLongue(inter.date))
      )
    ),
    el(
      "div.doc__parties",
      el(
        "div.doc__bloc",
        el("div.doc__bloc-titre", "Client"),
        client ? adresseLignes(client).map((l) => el("div", l)) : el("div", "—"),
        client?.tel ? el("div", `Tél. ${client.tel}`) : null
      ),
      el(
        "div.doc__bloc",
        el("div.doc__bloc-titre", "Intervention"),
        el("div", `Arrivée : ${inter.arrivee || "—"}`),
        el("div", `Départ : ${inter.depart || "—"}`),
        eq ? el("div", [eq.marque, eq.modele].filter(Boolean).join(" ")) : null,
        eq?.numeroSerie ? el("div", `N° ${eq.numeroSerie}`) : null
      )
    ),
    inter.motif ? el("div.doc__objet", el("strong", "Motif de l'appel"), inter.motif) : null,
    inter.diagnostic ? el("div.doc__objet", el("strong", "Diagnostic"), inter.diagnostic) : null,
    inter.travaux ? el("div.doc__objet", el("strong", "Travaux réalisés"), inter.travaux) : null,
    (inter.lignes || []).length
      ? el(
          "table.doc__table",
          el("thead", el("tr", el("th", "Désignation"), el("th.num", "Qté"), el("th.num", "P.U. HT"), el("th.num", "Total HT"))),
          el(
            "tbody",
            inter.lignes.map((l) =>
              el(
                "tr",
                el("td", l.designation || ""),
                el("td.num", nombre(l.quantite, 0)),
                el("td.num", euros(nombre(l.pu, 0))),
                el("td.num", euros(nombre(l.quantite, 0) * nombre(l.pu, 0)))
              )
            ),
            el(
              "tr",
              el("td", { colspan: 3, style: { textAlign: "right", fontWeight: "700" } }, "Total HT"),
              el("td.num", { style: { fontWeight: "700" } }, euros(total))
            )
          )
        )
      : null,
    el(
      "div.doc__signature",
      el("strong", "Travaux réceptionnés"),
      el("div", { style: { marginTop: "2px" } }, "Date et signature du client :")
    ),
    el("div.doc__pied", piedDePage(e))
  );
}

