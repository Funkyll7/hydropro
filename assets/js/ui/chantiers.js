/**
 * chantiers.js — la liste des chantiers et la fiche de l'un d'eux.
 *
 * La fiche repond a trois questions, dans cet ordre : a quoi ressemble ce
 * chantier (les photos), qu'est-ce qu'on y a decide (les documents), et
 * quand y retourne-t-on (les rendez-vous).
 *
 * Les photos passent AVANT le formulaire d'adresse, et ce n'est pas un detail
 * de mise en page : on ouvre cette fiche en arrivant sur place, souvent pour
 * verifier dans quel etat on avait laisse la chaufferie. L'adresse, on l'a
 * sous les yeux.
 */

import { el } from "../core/dom.js";
import {
  aide,
  bouton,
  carte,
  carteListe,
  champ,
  champDate,
  champSelect,
  champZone,
  etat as pastille,
  filtres,
  kpi,
  recherche,
  sectionTitre,
  vide,
} from "./champs.js";
import { icone } from "./icones.js";
import { actionsClient, ligneDocument, ligneRdv, retour } from "./parts.js";
import { boutonsAjout, galerie, poids } from "./photos.js";
import { ouvrirRdv } from "./agenda.js";
import { creerDocument } from "./documents.js";
import { dateCourte, eurosRonds, pluriel, relatif } from "../core/format.js";
import { chantierParId, chantierVide, parId, tousLesChantiers } from "../domain/dossier.js";
import { nomClient, adresseCourte as adresseClient } from "../domain/clients.js";
import * as Chantiers from "../domain/chantiers.js";
import * as Photos from "../core/photos.js";

export function titre(ctx) {
  const trouve = ctx.params ? chantierParId(ctx.dossier, ctx.params) : null;
  return trouve ? Chantiers.nomChantier(trouve.chantier) : "Chantiers";
}

export function actions(ctx) {
  const trouve = ctx.params ? chantierParId(ctx.dossier, ctx.params) : null;
  if (trouve) {
    return [
      bouton("Devis", {
        ico: "devis",
        petit: true,
        optionnel: true,
        onclick: () => nouveauDocument(ctx, trouve, "devis"),
      }),
      bouton("Rendez-vous", {
        ico: "agenda",
        petit: true,
        onclick: () =>
          ouvrirRdv(ctx, null, {
            clientId: trouve.client.id,
            chantierId: trouve.chantier.id,
            adresse: Chantiers.adresseCourte(trouve.chantier),
          }),
      }),
    ];
  }
  return [];
}

export function rendre(ctx) {
  const trouve = ctx.params ? chantierParId(ctx.dossier, ctx.params) : null;
  if (ctx.params && !trouve) {
    return vide({
      ico: "chantiers",
      titre: "Chantier introuvable",
      texte: "Il a peut-être été supprimé, ou son client archivé.",
      action: bouton("Revenir à la liste", { variante: "plein", onclick: () => ctx.aller("chantiers") }),
    });
  }
  return trouve ? fiche(ctx, trouve) : liste(ctx);
}

/**
 * Cree un chantier chez un client et ouvre sa fiche.
 *
 * L'adresse du client est recopiee comme point de depart : dans neuf cas sur
 * dix c'est la bonne, et la corriger est plus rapide que la retaper.
 */
export function creerChantier(ctx, client, patch = {}) {
  const chantier = chantierVide({
    adresse: client.adresse || "",
    complement: client.complement || "",
    cp: client.cp || "",
    ville: client.ville || "",
    acces: client.acces || "",
    ...patch,
  });
  ctx.maj((d) => {
    const c = parId(d.clients, client.id);
    c.chantiers = c.chantiers || [];
    c.chantiers.push(chantier);
  });
  ctx.aller("chantiers", chantier.id);
}

/* ================================= La liste =============================== */

function liste(ctx) {
  const q = ctx.vue.q || "";
  const filtre = ctx.vue.filtre || "actifs";
  const statuts = ctx.ref.reference.statutsChantier;

  const tous = tousLesChantiers(ctx.dossier).filter(({ client }) => !client.archive);
  const compte = (cle) => tous.filter((x) => x.chantier.statut === cle).length;

  const visibles = Chantiers.trier(
    tous
      .filter(({ chantier }) => (filtre === "actifs" ? chantier.statut !== "termine" : filtre === "tous" ? true : chantier.statut === filtre))
      .filter(({ chantier, client }) => Chantiers.correspond(chantier, client, q))
  );

  const avecPhotos = tous.filter((x) => (x.chantier.photos || []).length).length;

  return el(
    "div.onglet",

    el(
      "div.grille.grille--3",
      kpi({
        valeur: String(compte("en-cours")),
        label: "Chantiers en cours",
        detail: "là où l'on va cette semaine",
        ton: compte("en-cours") ? "info" : "",
      }),
      kpi({ valeur: String(compte("prevu")), label: "Prévus", detail: "acceptés, pas encore commencés" }),
      kpi({
        valeur: String(avecPhotos),
        label: "Chantiers photographiés",
        detail: `sur ${pluriel(tous.length, "chantier")}`,
      })
    ),

    el(
      "div.barre-outils",
      recherche({
        valeur: q,
        placeholder: "Nom, adresse, ville, client, légende de photo…",
        oninput: (v) => ctx.poserVue({ q: v }),
      })
    ),

    filtres([
      { nom: "Actifs", n: tous.length - compte("termine"), actif: filtre === "actifs", onclick: () => ctx.poserVue({ filtre: "actifs" }) },
      ...statuts.map((s) => ({
        nom: s.nom,
        n: compte(s.cle),
        actif: filtre === s.cle,
        aide: s.aide,
        onclick: () => ctx.poserVue({ filtre: s.cle }),
      })),
      { nom: "Tous", n: tous.length, actif: filtre === "tous", onclick: () => ctx.poserVue({ filtre: "tous" }) },
    ]),

    visibles.length
      ? carteListe({
          titre: pluriel(visibles.length, "chantier"),
          sousTitre: "Les chantiers en cours d'abord",
          contenu: el("div", visibles.map((x) => ligneChantier(ctx, x))),
        })
      : vide({
          ico: "chantiers",
          titre: q || filtre !== "actifs" ? "Rien ne correspond" : "Aucun chantier",
          texte:
            q || filtre !== "actifs"
              ? "Essayez un autre filtre ou une autre recherche."
              : "Un chantier se crée depuis la fiche d'un client. Il porte une adresse, des photos et les documents qui s'y rattachent — un même client peut en avoir autant qu'il a de logements.",
          action: bouton("Voir les clients", { variante: "plein", ico: "clients", onclick: () => ctx.aller("clients") }),
        })
  );
}

function ligneChantier(ctx, { chantier, client }) {
  const e = Chantiers.etat(chantier, ctx.ref.reference.statutsChantier);
  const nbPhotos = (chantier.photos || []).length;
  const b = Chantiers.bilan(ctx.dossier, chantier.id);

  return el(
    `button.ligne.ligne--cliquable.ligne--marque.ligne--marque-${e.couleur}`,
    { type: "button", onclick: () => ctx.aller("chantiers", chantier.id) },
    el("div.ligne__icone", icone("chantiers", 18)),
    el(
      "div.ligne__corps",
      el("div.ligne__titre", Chantiers.nomChantier(chantier)),
      el(
        "div.ligne__meta",
        el("span", nomClient(client)),
        el("span", Chantiers.adresseCourte(chantier) || "adresse non renseignée"),
        nbPhotos ? el("span", `${pluriel(nbPhotos, "photo")}`) : null
      )
    ),
    el(
      "div.ligne__droite",
      b.facture ? el("div.ligne__montant", eurosRonds(b.facture)) : null,
      pastille(e.nom, e.couleur)
    )
  );
}

/* ================================= La fiche =============================== */

function fiche(ctx, trouve) {
  const { chantier, client } = trouve;
  const b = Chantiers.bilan(ctx.dossier, chantier.id);
  const nbPhotos = (chantier.photos || []).length;

  return el(
    "div.onglet",
    el(
      "div.barre-outils",
      retour(ctx, "chantiers", "Tous les chantiers"),
      bouton(nomClient(client), { ico: "clients", petit: true, onclick: () => ctx.aller("clients", client.id) }),
      el("div.rang.pousse", ...actionsClient(client, Chantiers.adresseCourte(chantier)))
    ),

    el(
      "div.grille.grille--4",
      kpi({ valeur: eurosRonds(b.facture), label: "Facturé ici", detail: "hors taxes" }),
      kpi({ valeur: eurosRonds(b.encaisse), label: "Encaissé", ton: "ok" }),
      kpi({ valeur: eurosRonds(b.du), label: "Reste dû", ton: b.du > 0 ? "alerte" : "" }),
      kpi({
        valeur: String(nbPhotos),
        label: "Photos",
        detail: nbPhotos ? poids(Chantiers.poidsPhotos(chantier)) : "aucune prise",
      })
    ),

    photos(ctx, chantier),
    formulaire(ctx, chantier, client),
    liens(ctx, chantier, client),
    zoneDanger(ctx, chantier, client)
  );
}

/* -------------------------------- Photos -------------------------------- */

function photos(ctx, chantier) {
  const groupes = Chantiers.photosParPhase(chantier);
  const comparaison = Chantiers.avantApres(chantier);

  return carte({
    titre: "Photos du chantier",
    sousTitre:
      "« Avant » protège d'un « c'était déjà comme ça ». « Pendant » montre ce que le mur cachera. « Après » se montre au client.",
    actions: boutonsAjout(ctx, chantier),
    corps: [
      comparaison
        ? aide(
            "Ce chantier a un avant et un après : c'est exactement ce qu'on montre à un client qui a oublié l'état de départ, et ce qu'une assurance demande en cas de litige."
          )
        : null,

      groupes.length
        ? el(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "16px" } },
            groupes.map((g) =>
              el(
                "div",
                sectionTitre(`${g.nom} — ${pluriel(g.photos.length, "photo")}`),
                galerie(ctx, chantier, { photos: g.photos })
              )
            )
          )
        : galerie(ctx, chantier),
    ],
  });
}

/* ------------------------------ Le formulaire --------------------------- */

function formulaire(ctx, chantier, client) {
  const maj = (cle) => (v) =>
    ctx.majSilencieux(() => {
      chantier[cle] = v;
    });

  return carte({
    titre: "Le chantier",
    corps: [
      el(
        "div.grille.grille--2",
        champ("Nom du chantier", {
          valeur: chantier.nom,
          placeholder: "Salle de bain, chaufferie, appartement 3B…",
          aide: "Ce qui permet de le distinguer des autres chantiers du même client.",
          oninput: maj("nom"),
        }),
        champSelect("État", {
          valeur: chantier.statut,
          options: ctx.ref.reference.statutsChantier.map((s) => ({ valeur: s.cle, nom: s.nom })),
          aide: ctx.ref.reference.statutsChantier.find((s) => s.cle === chantier.statut)?.aide,
          onchange: (v) => ctx.maj(() => {
            chantier.statut = v;
          }),
        })
      ),
      champ("Adresse", { valeur: chantier.adresse, placeholder: "N° et rue", oninput: maj("adresse") }),
      el(
        "div.grille.grille--3",
        champ("Complément", { valeur: chantier.complement, placeholder: "Bâtiment, étage, appartement", oninput: maj("complement") }),
        champ("Code postal", { valeur: chantier.cp, inputmode: "numeric", oninput: maj("cp") }),
        champ("Ville", { valeur: chantier.ville, oninput: maj("ville") })
      ),
      champ("Accès", {
        valeur: chantier.acces,
        placeholder: "Digicode, interphone, où se garer, qui a la clé…",
        aide: "Ce qu'on aimerait savoir avant d'arriver, et qu'on redemande à chaque fois.",
        oninput: maj("acces"),
      }),
      el(
        "div.grille.grille--2",
        champDate("Début des travaux", { valeur: chantier.debut, onchange: (v) => ctx.maj(() => {
          chantier.debut = v;
        }) }),
        champDate("Fin des travaux", { valeur: chantier.fin, onchange: (v) => ctx.maj(() => {
          chantier.fin = v;
        }) })
      ),
      champZone("Notes", {
        valeur: chantier.notes,
        lignes: 3,
        placeholder: "Particularités de l'installation, ce qui reste à faire, ce que le client a demandé…",
        oninput: maj("notes"),
      }),
      adresseDifferente(chantier, client)
        ? aide("L'adresse du chantier diffère de celle du client : c'est celle du chantier qui s'imprimera sur les devis et les factures rattachés.")
        : null,
    ],
  });
}

const adresseDifferente = (chantier, client) =>
  Chantiers.adresseCourte(chantier) && Chantiers.adresseCourte(chantier) !== adresseClient(client);

/* --------------------------- Documents et agenda ------------------------ */

function liens(ctx, chantier, client) {
  const docs = Chantiers.documentsDuChantier(ctx.dossier, chantier.id);
  const devis = docs.filter((d) => d.kind === "devis");
  const factures = docs.filter((d) => d.kind !== "devis");
  const rdvs = Chantiers.rdvDuChantier(ctx.dossier, chantier.id);
  const inters = Chantiers.interventionsDuChantier(ctx.dossier, chantier.id);

  return el(
    "div",
    sectionTitre("Ce qui se rattache à ce chantier"),
    el(
      "div.grille.grille--large",
      carteListe({
        titre: "Devis",
        sousTitre: devis.length ? pluriel(devis.length, "devis", "devis") : "Aucun devis pour ce chantier",
        actions: [bouton("Nouveau", { ico: "plus", petit: true, onclick: () => nouveauDocument(ctx, { chantier, client }, "devis") })],
        contenu: devis.length
          ? el("div", devis.map((d) => ligneDocument(ctx, d, { onclick: () => ctx.aller("devis", d.id) })))
          : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Aucun devis."),
      }),
      carteListe({
        titre: "Factures",
        sousTitre: factures.length ? pluriel(factures.length, "facture") : "Aucune facture pour ce chantier",
        actions: [bouton("Nouvelle", { ico: "plus", petit: true, onclick: () => nouveauDocument(ctx, { chantier, client }, "facture") })],
        contenu: factures.length
          ? el("div", factures.map((d) => ligneDocument(ctx, d, { onclick: () => ctx.aller("factures", d.id) })))
          : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Aucune facture."),
      }),
      carteListe({
        titre: "Rendez-vous",
        sousTitre: rdvs.length ? pluriel(rdvs.length, "rendez-vous", "rendez-vous") : "Aucun passage enregistré",
        actions: [
          bouton("Poser", {
            ico: "plus",
            petit: true,
            onclick: () =>
              ouvrirRdv(ctx, null, {
                clientId: client.id,
                chantierId: chantier.id,
                adresse: Chantiers.adresseCourte(chantier),
              }),
          }),
        ],
        contenu: rdvs.length
          ? el("div", rdvs.map((r) => ligneRdv(ctx, r, { montrerDate: true, onclick: () => ouvrirRdv(ctx, r) })))
          : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Aucun rendez-vous."),
      }),
      inters.length
        ? carteListe({
            titre: "Interventions",
            sousTitre: pluriel(inters.length, "bon d'intervention", "bons d'intervention"),
            contenu: el(
              "div",
              inters.map((i) =>
                el(
                  "button.ligne.ligne--cliquable",
                  { type: "button", onclick: () => ctx.aller("interventions", i.id) },
                  el("div.ligne__icone", icone("interventions", 18)),
                  el(
                    "div.ligne__corps",
                    el("div.ligne__titre", i.motif || "Intervention"),
                    el("div.ligne__meta", el("span", dateCourte(i.date)), el("span", relatif(i.date)))
                  )
                )
              )
            ),
          })
        : null
    )
  );
}

function nouveauDocument(ctx, { chantier, client }, kind) {
  creerDocument(ctx, kind, {
    clientId: client.id,
    chantierId: chantier.id,
    chantier: Chantiers.adressePourDocument(chantier, client),
    objet: chantier.nom || "",
  });
}

/* ------------------------------ Zone rouge ------------------------------ */

function zoneDanger(ctx, chantier, client) {
  const raisons = Chantiers.raisonsDeGarder(ctx.dossier, chantier.id);
  const nbPhotos = (chantier.photos || []).length;

  return carte({
    titre: "Supprimer ce chantier",
    corps: [
      raisons.length
        ? aide(
            `Suppression impossible : ${raisons.join(", ")}. Un document comptable ne doit pas se retrouver rattaché à un lieu qui n'existe plus. Passez-le plutôt en « terminé ».`,
            "avert"
          )
        : bouton("Supprimer définitivement", {
            variante: "danger",
            ico: "poubelle",
            onclick: async () => {
              const ok = await ctx.confirmer({
                titre: "Supprimer ce chantier ?",
                texte: nbPhotos
                  ? `Ses ${nbPhotos} photo(s) seront effacées de cet appareil, définitivement. Exportez-les d'abord si elles servent de preuve.`
                  : "Aucun document ne s'y rattache : la suppression est sans conséquence, mais définitive.",
              });
              if (!ok) return;

              // Les images partent AVANT l'etiquette : l'inverse laisserait des
              // images orphelines dans IndexedDB, que plus rien ne citerait et
              // que rien ne viendrait jamais nettoyer.
              await Photos.supprimerLot((chantier.photos || []).map((p) => p.id));

              ctx.aller("chantiers");
              ctx.maj((d) => {
                const c = parId(d.clients, client.id);
                c.chantiers = (c.chantiers || []).filter((x) => x.id !== chantier.id);
              });
              ctx.toast("Chantier supprimé.");
            },
          }),
    ],
  });
}
