/**
 * clients.js — le fichier clients et la fiche d'un client.
 *
 * La fiche est le vrai centre de l'application : c'est de la qu'on appelle,
 * qu'on pose un rendez-vous, qu'on chiffre, qu'on facture. Elle rassemble donc
 * quatre choses qui vivent ailleurs — les appareils, l'agenda, les documents,
 * les contrats — et on peut agir sur chacune sans quitter l'ecran.
 */

import { el } from "../core/dom.js";
import {
  aide,
  bouton,
  boutonIcone,
  carte,
  carteListe,
  champ,
  champDate,
  champSelect,
  champZone,
  coche,
  defs,
  filtres,
  kpi,
  recherche,
  sectionTitre,
  vide,
} from "./champs.js";
import { icone, iconeEquipement } from "./icones.js";
import { actionsClient, ligneDocument, ligneRdv, retour } from "./parts.js";
import { ouvrirRdv } from "./agenda.js";
import { creerDocument } from "./documents.js";
import { ouvrirContrat } from "./contrats.js";
import { creerChantier } from "./chantiers.js";
import * as Chantiers from "../domain/chantiers.js";
import {
  dateCourte,
  euros,
  eurosRonds,
  pluriel,
  relatif,
} from "../core/format.js";
import { clientVide, equipementVide, parId } from "../domain/dossier.js";
import {
  adresseCourte,
  bilan,
  correspond,
  dernierPassage,
  doublonsProbables,
  nomClient,
  prochainPassage,
  raisonsDeGarder,
  retardMoyen,
  trier,
} from "../domain/clients.js";
import { documentsDuClient } from "../domain/documents.js";
import { entretienDu } from "../domain/contrats.js";

export function titre(ctx) {
  const client = ctx.params ? parId(ctx.dossier.clients, ctx.params) : null;
  return client ? nomClient(client) : "Clients";
}

export function actions(ctx) {
  const client = ctx.params ? parId(ctx.dossier.clients, ctx.params) : null;
  if (client) {
    return [
      bouton("Rendez-vous", { ico: "agenda", petit: true, onclick: () => ouvrirRdv(ctx, null, { clientId: client.id }) }),
      bouton("Devis", {
        ico: "plus",
        variante: "plein",
        petit: true,
        onclick: () => creerDocument(ctx, "devis", { clientId: client.id, chantier: adresseCourte(client) }),
      }),
    ];
  }
  return [bouton("Nouveau client", { ico: "plus", variante: "plein", petit: true, onclick: () => creerClient(ctx) })];
}

export const nouveau = (ctx) => creerClient(ctx);

export function rendre(ctx) {
  const client = ctx.params ? parId(ctx.dossier.clients, ctx.params) : null;
  if (ctx.params && !client) {
    return vide({
      ico: "clients",
      titre: "Client introuvable",
      action: bouton("Revenir à la liste", { variante: "plein", onclick: () => ctx.aller("clients") }),
    });
  }
  return client ? fiche(ctx, client) : liste(ctx);
}

function creerClient(ctx, patch = {}) {
  const client = clientVide(patch);
  ctx.maj((d) => d.clients.push(client));
  ctx.aller("clients", client.id);
}

/* ================================= La liste =============================== */

function liste(ctx) {
  const q = ctx.vue.q || "";
  const tri = ctx.vue.tri || "nom";
  const montrerArchives = ctx.vue.archives === true;

  const base = ctx.dossier.clients.filter((c) => montrerArchives || !c.archive);
  const visibles = trier(base.filter((c) => correspond(c, q)), ctx.dossier, tri);
  const doublons = doublonsProbables(ctx.dossier);

  return el(
    "div.onglet",
    doublons.length
      ? carte({
          variante: "avert",
          titre: "Doublons probables",
          sousTitre: `${pluriel(doublons.length, "paire")} de fiches qui semblent désigner le même client`,
          corps: [
            aide(
              "Deux fiches pour un même client dispersent l'historique : on cherche une intervention sous l'une alors qu'elle est sous l'autre. Ouvrez-les pour vérifier, puis archivez celle qui ne sert plus."
            ),
            el(
              "div.liste",
              doublons.slice(0, 5).map(([a, b, motif]) =>
                el(
                  "div.ligne",
                  el("div.ligne__icone", icone("clients", 18)),
                  el(
                    "div.ligne__corps",
                    el("div.ligne__titre", `${nomClient(a)} · ${nomClient(b)}`),
                    el("div.ligne__meta", el("span", motif))
                  ),
                  el(
                    "div.ligne__actions",
                    bouton("Voir", { petit: true, onclick: () => ctx.aller("clients", a.id) }),
                    bouton("Voir", { petit: true, onclick: () => ctx.aller("clients", b.id) })
                  )
                )
              )
            ),
          ],
        })
      : null,

    el(
      "div.barre-outils",
      recherche({
        valeur: q,
        placeholder: "Nom, téléphone, ville, marque de chaudière…",
        oninput: (v) => ctx.poserVue({ q: v }),
      })
    ),

    filtres([
      { nom: "A → Z", actif: tri === "nom", onclick: () => ctx.poserVue({ tri: "nom" }) },
      { nom: "Vus récemment", actif: tri === "recent", onclick: () => ctx.poserVue({ tri: "recent" }) },
      { nom: "Chiffre d'affaires", actif: tri === "ca", onclick: () => ctx.poserVue({ tri: "ca" }) },
      { nom: "Par ville", actif: tri === "ville", onclick: () => ctx.poserVue({ tri: "ville" }) },
      {
        nom: "Archivés",
        actif: montrerArchives,
        n: ctx.dossier.clients.filter((c) => c.archive).length,
        onclick: () => ctx.poserVue({ archives: !montrerArchives }),
      },
    ]),

    visibles.length
      ? carteListe({
          titre: pluriel(visibles.length, "client"),
          contenu: el(
            "div",
            visibles.map((c) => {
              const b = bilan(ctx.dossier, c.id);
              const dernier = dernierPassage(ctx.dossier, c.id);
              return el(
                "button.ligne.ligne--cliquable",
                { type: "button", onclick: () => ctx.aller("clients", c.id) },
                el("div.ligne__icone", icone("clients", 18)),
                el(
                  "div.ligne__corps",
                  el("div.ligne__titre", nomClient(c)),
                  el(
                    "div.ligne__meta",
                    el("span", adresseCourte(c) || "adresse non renseignée"),
                    c.tel ? el("span", c.tel) : null,
                    dernier ? el("span", `vu ${relatif(dernier)}`) : null,
                    (c.equipements || []).length
                      ? el("span", pluriel(c.equipements.length, "appareil"))
                      : null
                  )
                ),
                el(
                  "div.ligne__droite",
                  el("div.ligne__montant", eurosRonds(b.facture)),
                  b.du > 0 ? el("span.etat.etat--alerte", `${eurosRonds(b.du)} dû`) : null
                )
              );
            })
          ),
        })
      : vide({
          ico: "clients",
          titre: q ? "Aucun client ne correspond" : "Aucun client",
          texte: q
            ? "La recherche porte aussi sur le téléphone, la ville et les marques d'appareils."
            : "Créez une fiche dès le premier appel : elle porte l'historique, les appareils et les documents.",
          action: bouton("Nouveau client", { variante: "plein", ico: "plus", onclick: () => creerClient(ctx) }),
        })
  );
}

/* ================================= La fiche =============================== */

function fiche(ctx, client) {
  const b = bilan(ctx.dossier, client.id);
  const retard = retardMoyen(ctx.dossier, client.id);
  const prochain = prochainPassage(ctx.dossier, client.id);

  return el(
    "div.onglet",
    el("div.barre-outils", retour(ctx, "clients", "Tous les clients"), el("div.rang.pousse", ...actionsClient(client))),

    client.archive ? aide("Cette fiche est archivée : elle n'apparaît plus dans les listes.", "avert") : null,

    el(
      "div.grille.grille--4",
      kpi({ valeur: eurosRonds(b.facture), label: "Facturé", detail: pluriel(b.nbDocuments, "document") }),
      kpi({ valeur: eurosRonds(b.encaisse), label: "Encaissé", ton: "ok" }),
      kpi({
        valeur: eurosRonds(b.du),
        label: "Reste dû",
        ton: b.enRetard > 0 ? "alerte" : "",
        detail: b.enRetard > 0 ? `dont ${eurosRonds(b.enRetard)} en retard` : "à jour",
      }),
      kpi({
        valeur: retard === null ? "—" : `${retard > 0 ? "+" : ""}${retard} j`,
        label: "Paiement",
        detail:
          retard === null
            ? "aucune facture soldée"
            : retard > 5
              ? "paie en retard : demandez un acompte"
              : "paie dans les temps",
        ton: retard !== null && retard > 5 ? "avert" : "",
      })
    ),

    coordonnees(ctx, client),
    chantiers(ctx, client),
    equipements(ctx, client),
    contratsDuClient(ctx, client),
    historique(ctx, client, prochain),
    documents(ctx, client),
    zoneDanger(ctx, client)
  );
}

/* ----------------------------- Coordonnees ------------------------------ */

function coordonnees(ctx, client) {
  const maj = (champName) => (v) =>
    ctx.majSilencieux(() => {
      client[champName] = v;
    });

  return carte({
    titre: "Coordonnées",
    sousTitre: "Enregistrées au fil de la frappe",
    corps: [
      el(
        "div.grille.grille--3",
        champSelect("Type", {
          valeur: client.type,
          options: ctx.ref.reference.typesClient.map((t) => ({ valeur: t.cle, nom: t.nom })),
          onchange: (v) => ctx.maj(() => {
            client.type = v;
          }),
        }),
        champ("Civilité", { valeur: client.civilite, placeholder: "M., Mme", oninput: maj("civilite") }),
        champ("Société", {
          valeur: client.societe,
          placeholder: "Raison sociale, syndic, agence",
          aide: "Si elle est remplie, c'est elle qui s'imprime sur les documents.",
          oninput: maj("societe"),
        })
      ),
      el(
        "div.grille.grille--2",
        champ("Nom", { valeur: client.nom, oninput: maj("nom") }),
        champ("Prénom", { valeur: client.prenom, oninput: maj("prenom") })
      ),
      el(
        "div.grille.grille--3",
        champ("Téléphone", { valeur: client.tel, type: "tel", inputmode: "tel", oninput: maj("tel") }),
        champ("Autre téléphone", { valeur: client.tel2, type: "tel", inputmode: "tel", oninput: maj("tel2") }),
        champ("Adresse e-mail", { valeur: client.email, type: "email", inputmode: "email", oninput: maj("email") })
      ),
      champ("Adresse", { valeur: client.adresse, placeholder: "N° et rue", oninput: maj("adresse") }),
      el(
        "div.grille.grille--3",
        champ("Complément", { valeur: client.complement, placeholder: "Bâtiment, étage, appartement", oninput: maj("complement") }),
        champ("Code postal", { valeur: client.cp, inputmode: "numeric", oninput: maj("cp") }),
        champ("Ville", { valeur: client.ville, oninput: maj("ville") })
      ),
      champ("Accès", {
        valeur: client.acces,
        placeholder: "Digicode, interphone, où se garer, le chien…",
        aide: "Ce qu'on aimerait savoir avant d'arriver, et qu'on oublie toujours de noter.",
        oninput: maj("acces"),
      }),
      client.type !== "particulier"
        ? champ("SIRET", { valeur: client.siret, inputmode: "numeric", oninput: maj("siret") })
        : null,
      champZone("Notes", {
        valeur: client.notes,
        lignes: 3,
        placeholder: "Historique, particularités de l'installation, préférences…",
        oninput: maj("notes"),
      }),
    ],
  });
}

/* ------------------------------ Chantiers -------------------------------
   Un client peut avoir plusieurs lieux de travail : un syndic en a trente, un
   bailleur en a autant que de logements, un particulier finit par en avoir
   deux — la salle de bain, puis la chaufferie deux ans plus tard. C'est le
   chantier qui porte les photos, parce que c'est le LIEU qu'on photographie,
   pas la personne.
   ======================================================================== */

function chantiers(ctx, client) {
  const liste = Chantiers.trier((client.chantiers || []).map((chantier) => ({ chantier, client })));
  const statuts = ctx.ref.reference.statutsChantier;

  return carteListe({
    titre: "Chantiers",
    sousTitre: liste.length
      ? `${pluriel(liste.length, "lieu de travail", "lieux de travail")} — chacun avec ses photos et ses documents`
      : "Aucun chantier : les photos et l'historique se rattachent à un lieu",
    actions: [
      bouton("Nouveau chantier", { ico: "plus", petit: true, onclick: () => creerChantier(ctx, client) }),
    ],
    contenu: liste.length
      ? el(
          "div",
          liste.map(({ chantier }) => {
            const e = Chantiers.etat(chantier, statuts);
            const nbPhotos = (chantier.photos || []).length;
            return el(
              `button.ligne.ligne--cliquable.ligne--marque.ligne--marque-${e.couleur}`,
              { type: "button", onclick: () => ctx.aller("chantiers", chantier.id) },
              el("div.ligne__icone", icone("chantiers", 18)),
              el(
                "div.ligne__corps",
                el("div.ligne__titre", Chantiers.nomChantier(chantier)),
                el(
                  "div.ligne__meta",
                  el("span", Chantiers.adresseCourte(chantier) || "adresse du client"),
                  nbPhotos ? el("span", pluriel(nbPhotos, "photo")) : el("span", "aucune photo")
                )
              ),
              el("div.ligne__droite", el(`span.etat.etat--${e.couleur}`, e.nom))
            );
          })
        )
      : el(
          "div.champ__aide",
          { style: { padding: "12px 16px" } },
          "Créez-en un dès la première visite : il portera les photos avant travaux, les devis et l'accès."
        ),
  });
}

/* ----------------------------- Equipements ------------------------------ */

function equipements(ctx, client) {
  const liste = client.equipements || [];
  const categories = ctx.ref.reference.categoriesEquipement;

  return carteListe({
    variante: "cuivre",
    titre: "Appareils",
    sousTitre: "La chaudière, le ballon, la PAC — avec leur marque, leur numéro de série et leur dernier entretien",
    actions: [
      bouton("Ajouter", { ico: "plus", petit: true, onclick: () => ouvrirEquipement(ctx, client, null) }),
    ],
    contenu: liste.length
      ? el(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "8px", padding: "16px" } },
          liste.map((eq) => {
            const cat = categories.find((c) => c.cle === eq.categorie);
            const du = entretienDu(eq, categories);

            return el(
              "div.equip",
              el("div.ligne__icone.ligne__icone--cuivre", iconeEquipement(eq.categorie)),
              el(
                "div.equip__corps",
                el("div.equip__nom", [eq.marque, eq.modele].filter(Boolean).join(" ") || cat?.nom || "Appareil"),
                el(
                  "div.equip__meta",
                  [
                    cat?.nom,
                    eq.puissance ? `${eq.puissance} kW` : null,
                    eq.numeroSerie ? `n° ${eq.numeroSerie}` : null,
                    eq.emplacement,
                    eq.installeLe ? `posé le ${dateCourte(eq.installeLe)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                ),
                eq.dernierEntretien
                  ? el(
                      "div.equip__meta",
                      `Dernier entretien ${relatif(eq.dernierEntretien)}`,
                      du && du.jours < 0
                        ? el("strong", { style: { color: "var(--alerte)" } }, ` — entretien dû depuis ${-du.jours} jours`)
                        : du && du.jours < 60
                          ? el("strong", { style: { color: "var(--avert)" } }, ` — prochain ${relatif(du.echeance)}`)
                          : null
                    )
                  : el("div.equip__meta", { style: { color: "var(--avert)" } }, "Aucun entretien enregistré"),
                eq.garantieJusquau
                  ? el("div.equip__meta", `Garantie jusqu'au ${dateCourte(eq.garantieJusquau)}`)
                  : null
              ),
              el(
                "div.ligne__actions",
                boutonIcone("agenda", "Programmer l'entretien", {
                  onclick: () =>
                    ouvrirRdv(ctx, null, { clientId: client.id, equipementId: eq.id, type: "entretien" }),
                }),
                boutonIcone("crayon", "Modifier l'appareil", { onclick: () => ouvrirEquipement(ctx, client, eq) })
              )
            );
          })
        )
      : el(
          "div.champ__aide",
          { style: { padding: "16px" } },
          "Aucun appareil enregistré. Photographier la plaque signalétique lors de la première visite fait gagner un quart d'heure à chaque intervention suivante."
        ),
  });
}

function ouvrirEquipement(ctx, client, equipement) {
  const nouveauEq = !equipement;
  const eq = equipement ? { ...equipement } : equipementVide();

  ctx.modale({
    titre: nouveauEq ? "Nouvel appareil" : "Appareil",
    corps: el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "16px" } },
      champSelect("Famille", {
        valeur: eq.categorie,
        options: ctx.ref.reference.categoriesEquipement.map((c) => ({ valeur: c.cle, nom: c.nom })),
        aide: ctx.ref.reference.categoriesEquipement.find((c) => c.cle === eq.categorie)?.aide,
        onchange: (v) => {
          eq.categorie = v;
        },
      }),
      el(
        "div.grille.grille--2",
        champ("Marque", { valeur: eq.marque, placeholder: "Saunier Duval, Viessmann, Atlantic…", oninput: (v) => (eq.marque = v) }),
        champ("Modèle", { valeur: eq.modele, oninput: (v) => (eq.modele = v) })
      ),
      el(
        "div.grille.grille--3",
        champ("Numéro de série", {
          valeur: eq.numeroSerie,
          aide: "Le numéro que demande le SAV du fabricant.",
          oninput: (v) => (eq.numeroSerie = v),
        }),
        champSelect("Énergie", {
          valeur: eq.energie,
          options: ctx.ref.reference.energies.map((e) => ({ valeur: e.cle, nom: e.nom })),
          onchange: (v) => (eq.energie = v),
        }),
        champ("Puissance", { valeur: eq.puissance, placeholder: "24", aide: "en kW", oninput: (v) => (eq.puissance = v) })
      ),
      champ("Emplacement", { valeur: eq.emplacement, placeholder: "Cuisine, cave, garage, combles", oninput: (v) => (eq.emplacement = v) }),
      el(
        "div.grille.grille--3",
        champDate("Posé le", { valeur: eq.installeLe, onchange: (v) => (eq.installeLe = v) }),
        champDate("Garantie jusqu'au", { valeur: eq.garantieJusquau, onchange: (v) => (eq.garantieJusquau = v) }),
        champDate("Dernier entretien", {
          valeur: eq.dernierEntretien,
          aide: "Sert à calculer la prochaine échéance.",
          onchange: (v) => (eq.dernierEntretien = v),
        })
      ),
      champZone("Notes", { valeur: eq.notes, lignes: 2, oninput: (v) => (eq.notes = v) })
    ),
    actions: (close) => [
      !nouveauEq
        ? bouton("Supprimer", {
            variante: "danger",
            onclick: async () => {
              const ok = await ctx.confirmer({
                titre: "Supprimer cet appareil ?",
                texte: "L'historique des interventions est conservé, mais le lien avec l'appareil sera perdu.",
              });
              if (!ok) return;
              close();
              ctx.maj((d) => {
                const c = parId(d.clients, client.id);
                c.equipements = c.equipements.filter((x) => x.id !== eq.id);
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
            const c = parId(d.clients, client.id);
            const i = c.equipements.findIndex((x) => x.id === eq.id);
            if (i >= 0) c.equipements[i] = eq;
            else c.equipements.push(eq);
          });
        },
      }),
    ].filter(Boolean),
  });
}

/* ------------------------------ Contrats -------------------------------- */

function contratsDuClient(ctx, client) {
  const liste = ctx.dossier.contrats.filter((c) => c.clientId === client.id);
  if (!liste.length && !(client.equipements || []).length) return null;

  return carteListe({
    titre: "Contrats d'entretien",
    sousTitre: liste.length ? null : "Aucun contrat : c'est du chiffre d'affaires connu d'avance qui dort",
    actions: [
      bouton("Nouveau contrat", {
        ico: "plus",
        petit: true,
        onclick: () => ouvrirContrat(ctx, null, { clientId: client.id }),
      }),
    ],
    contenu: liste.length
      ? el(
          "div",
          liste.map((c) =>
            el(
              "button.ligne.ligne--cliquable.ligne--marque.ligne--marque-cuivre",
              { type: "button", onclick: () => ctx.aller("contrats", c.id) },
              el("div.ligne__icone.ligne__icone--cuivre", icone("contrats", 18)),
              el(
                "div.ligne__corps",
                el("div.ligne__titre", c.intitule),
                el(
                  "div.ligne__meta",
                  el("span", c.actif ? "actif" : "inactif"),
                  c.prochainPassage ? el("span", `prochaine visite ${relatif(c.prochainPassage)}`) : null
                )
              ),
              el("div.ligne__droite", el("div.ligne__montant", euros(c.montant)))
            )
          )
        )
      : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Proposez-en un à la prochaine visite d'entretien."),
  });
}

/* ------------------------------ Historique ------------------------------ */

function historique(ctx, client, prochain) {
  const rdvs = ctx.dossier.rdv
    .filter((r) => r.clientId === client.id)
    .sort((a, b) => b.debut.localeCompare(a.debut))
    .slice(0, 12);

  const interventions = ctx.dossier.interventions
    .filter((i) => i.clientId === client.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return el(
    "div.grille.grille--large",
    carteListe({
      titre: "Rendez-vous",
      sousTitre: prochain ? `Prochain passage ${relatif(prochain)}` : "Aucun passage prévu",
      actions: [
        bouton("Poser un rendez-vous", {
          ico: "plus",
          petit: true,
          onclick: () => ouvrirRdv(ctx, null, { clientId: client.id }),
        }),
      ],
      contenu: rdvs.length
        ? el("div", rdvs.map((r) => ligneRdv(ctx, r, { montrerDate: true, onclick: () => ouvrirRdv(ctx, r) })))
        : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Aucun rendez-vous."),
    }),

    carteListe({
      titre: "Interventions",
      sousTitre: interventions.length ? pluriel(interventions.length, "bon d'intervention", "bons d'intervention") : "Aucun bon d'intervention",
      contenu: interventions.length
        ? el(
            "div",
            interventions.slice(0, 8).map((i) =>
              el(
                "button.ligne.ligne--cliquable",
                { type: "button", onclick: () => ctx.aller("interventions", i.id) },
                el("div.ligne__icone", icone("interventions", 18)),
                el(
                  "div.ligne__corps",
                  el("div.ligne__titre", i.motif || "Intervention"),
                  el(
                    "div.ligne__meta",
                    el("span", dateCourte(i.date)),
                    i.documentId ? el("span", "facturée") : el("span", "à facturer")
                  )
                )
              )
            )
          )
        : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Aucune intervention enregistrée."),
    })
  );
}

/* ------------------------------- Documents ------------------------------ */

function documents(ctx, client) {
  const devis = documentsDuClient(ctx.dossier, client.id, "devis");
  const factures = ctx.dossier.documents
    .filter((d) => d.clientId === client.id && d.kind !== "devis")
    .sort((a, b) => b.date.localeCompare(a.date));

  return el(
    "div",
    sectionTitre("Documents"),
    el(
      "div.grille.grille--large",
      carteListe({
        titre: "Devis",
        sousTitre: pluriel(devis.length, "devis", "devis"),
        actions: [
          bouton("Nouveau", {
            ico: "plus",
            petit: true,
            onclick: () => creerDocument(ctx, "devis", { clientId: client.id, chantier: adresseCourte(client) }),
          }),
        ],
        contenu: devis.length
          ? el("div", devis.slice(0, 8).map((d) => ligneDocument(ctx, d, { onclick: () => ctx.aller("devis", d.id) })))
          : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Aucun devis."),
      }),
      carteListe({
        titre: "Factures",
        sousTitre: pluriel(factures.length, "facture"),
        actions: [
          bouton("Nouvelle", {
            ico: "plus",
            petit: true,
            onclick: () => creerDocument(ctx, "facture", { clientId: client.id, chantier: adresseCourte(client) }),
          }),
        ],
        contenu: factures.length
          ? el(
              "div",
              factures.slice(0, 8).map((d) => ligneDocument(ctx, d, { onclick: () => ctx.aller("factures", d.id) }))
            )
          : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Aucune facture."),
      })
    )
  );
}

/* ------------------------------ Zone rouge ------------------------------ */

/**
 * L'archivage et la suppression.
 *
 * Un client cite par une facture n'est PAS supprimable : la facture doit etre
 * conservee dix ans, et une facture dont le client a disparu est une facture
 * invalide. L'ecran dit pourquoi, et propose l'archivage — qui fait ce que
 * l'utilisateur voulait vraiment : ne plus le voir dans les listes.
 */
function zoneDanger(ctx, client) {
  const raisons = raisonsDeGarder(ctx.dossier, client.id);

  return carte({
    titre: "Archiver ou supprimer",
    corps: [
      defs([
        { label: "Fiche créée le", valeur: dateCourte(client.creeLe) },
        { label: "Dernier passage", valeur: dernierPassage(ctx.dossier, client.id) ? dateCourte(dernierPassage(ctx.dossier, client.id)) : "" },
      ]),
      coche("Archiver cette fiche", {
        valeur: client.archive === true,
        note: "La fiche disparaît des listes et de la recherche, mais rien n'est perdu.",
        onchange: (v) =>
          ctx.maj(() => {
            client.archive = v;
          }),
      }),
      raisons.length
        ? aide(
            `Suppression impossible : ${raisons.join(", ")}. Les documents comptables doivent être conservés, et un document sans client n'est pas valable. Archivez la fiche à la place.`,
            "avert"
          )
        : bouton("Supprimer définitivement", {
            variante: "danger",
            ico: "poubelle",
            onclick: async () => {
              const ok = await ctx.confirmer({
                titre: "Supprimer ce client ?",
                texte: "Aucun document ne le cite : la suppression est sans conséquence, mais définitive.",
              });
              if (!ok) return;
              const copie = { ...client };
              ctx.aller("clients");
              ctx.maj((d) => {
                d.clients = d.clients.filter((c) => c.id !== client.id);
              });
              ctx.toast("Client supprimé.", {
                action: { nom: "Annuler", faire: () => ctx.maj((d) => d.clients.push(copie)) },
              });
            },
          }),
    ],
  });
}

