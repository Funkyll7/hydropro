/**
 * agenda.js — le planning : le mois, la semaine, la journee, et la fiche
 * d'un rendez-vous.
 *
 * TROIS VUES, ET CHACUNE REPOND A UNE QUESTION DIFFERENTE :
 *   - le MOIS repond a « quand puis-je le caser ? » ;
 *   - la SEMAINE repond a « comment s'annonce la semaine ? » ;
 *   - le JOUR repond a « qu'est-ce que je fais maintenant ? ».
 * C'est pour cela qu'elles ne montrent pas les memes choses : le mois se
 * contente de pastilles, le jour affiche l'adresse et le telephone.
 */

import { el } from "../core/dom.js";
import { CONFIG } from "../config.js";
import {
  autoComplete,
  bouton,
  boutonIcone,

  carteListe,
  champ,
  champDate,
  champHeure,
  champNombre,
  champSelect,
  champZone,
  coche,
  segment,
  vide,
  aide,
} from "./champs.js";
import { icone } from "./icones.js";
import { actionsClient, ligneRdv, nomType } from "./parts.js";
import {
  ajouteJours,
  ajouteMinutes,
  aujourdhui,
  dateJour,
  dateJourLongue,
  duree,
  heureDe,
  instant,
  jourDe,
  maintenantArrondi,
  minutesEntre,
  moisLong,
  pluriel,
  versDate,
} from "../core/format.js";
import {
  chargeJour,
  conflits,
  creneauTexte,
  dureeRdv,
  ferie,
  finRdv,
  grilleMois,
  indexParJour,
  rdvDuJour,
  titreRdv,
} from "../domain/agenda.js";
import { rdvVide, parId, equipementParId } from "../domain/dossier.js";
import { correspond, adresseCourte, nomClient } from "../domain/clients.js";
import { creerDocument } from "./documents.js";
import { ouvrirIntervention } from "./interventions.js";
import { marquerPassage } from "../domain/contrats.js";

export const titre = (ctx) => {
  const { vue, curseur } = etatVue(ctx);
  if (vue === "jour") return dateJourLongue(curseur);
  if (vue === "semaine") return `Semaine du ${dateJour(debutSemaine(curseur))}`;
  return moisLong(curseur);
};

export function actions(ctx) {
  return [
    bouton("Aujourd'hui", { onclick: () => ctx.poserVue({ curseur: aujourdhui() }), petit: true }),
    bouton("Rendez-vous", { ico: "plus", variante: "plein", onclick: () => ouvrirRdv(ctx, null), petit: true }),
  ];
}

export const nouveau = (ctx) => ouvrirRdv(ctx, null);

function etatVue(ctx) {
  return { vue: ctx.vue.vue || "mois", curseur: ctx.vue.curseur || aujourdhui() };
}

function debutSemaine(jour) {
  const d = versDate(jour);
  const decalage = (d.getDay() + 6) % 7;
  return ajouteJours(jour, -decalage);
}

export function rendre(ctx) {
  const { vue, curseur } = etatVue(ctx);

  const barre = el(
    "div.barre-outils",
    segment(
      [
        { valeur: "mois", nom: "Mois" },
        { valeur: "semaine", nom: "Semaine" },
        { valeur: "jour", nom: "Jour" },
      ],
      vue,
      (v) => ctx.poserVue({ vue: v }),
      "Vue de l'agenda"
    ),
    el(
      "div.rang.pousse",
      boutonIcone("gauche", "Période précédente", { variante: "contour", onclick: () => decaler(ctx, -1) }),
      boutonIcone("droite", "Période suivante", { variante: "contour", onclick: () => decaler(ctx, 1) })
    )
  );

  const corps =
    vue === "jour" ? vueJour(ctx, curseur) : vue === "semaine" ? vueSemaine(ctx, curseur) : vueMois(ctx, curseur);

  return el("div.onglet", barre, corps);
}

function decaler(ctx, sens) {
  const { vue, curseur } = etatVue(ctx);
  if (vue === "jour") return ctx.poserVue({ curseur: ajouteJours(curseur, sens) });
  if (vue === "semaine") return ctx.poserVue({ curseur: ajouteJours(curseur, 7 * sens) });
  const d = versDate(curseur);
  const suivant = new Date(d.getFullYear(), d.getMonth() + sens, 1);
  return ctx.poserVue({
    curseur: `${suivant.getFullYear()}-${String(suivant.getMonth() + 1).padStart(2, "0")}-01`,
  });
}

/* ================================= Le mois =============================== */

function vueMois(ctx, curseur) {
  const d = versDate(curseur);
  const cases = grilleMois(d.getFullYear(), d.getMonth());
  const index = indexParJour(ctx.dossier.rdv);
  const types = ctx.ref.reference.typesRdv;

  const grille = el(
    "div.cal__grille",
    cases.map((c) => {
      const liste = (index.get(c.jour) || []).filter((r) => r.statut !== "annule");
      const montres = liste.slice(0, CONFIG.evtsParJour);

      return el(
        `button.cal__jour${c.horsMois ? ".cal__jour--hors" : ""}${c.weekend ? ".cal__jour--weekend" : ""}${
          c.ferie ? ".cal__jour--ferie" : ""
        }`,
        {
          type: "button",
          title: c.ferie || "",
          onclick: () => ctx.poserVue({ vue: "jour", curseur: c.jour }),
        },
        el(
          "div.cal__num",
          el(`span${c.auj ? ".cal__num--auj" : ""}`, c.numero),
          c.ferie ? el("span.cal__ferie", c.ferie) : null
        ),
        el(
          "div.cal__evts",
          montres.map((r) => {
            const client = parId(ctx.dossier.clients, r.clientId);
            return el(
              `span.cal__evt.cal__evt--${r.type}${r.statut === "fait" ? ".cal__evt--fait" : ""}`,
              { title: `${creneauTexte(r, types)} — ${titreRdv(r, client, types)}` },
              el("span.cal__evt-heure", heureDe(r.debut)),
              el("span.cal__evt-texte", titreRdv(r, client, types))
            );
          }),
          liste.length > montres.length ? el("span.cal__plus", `+${liste.length - montres.length}`) : null
        )
      );
    })
  );

  return el(
    "div.cal",
    el(
      "div.cal__entetes",
      ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((j) => el("div.cal__entete", j))
    ),
    grille
  );
}

/* =============================== La semaine ============================== */

function vueSemaine(ctx, curseur) {
  const debut = debutSemaine(curseur);
  const jours = Array.from({ length: 7 }, (_, i) => ajouteJours(debut, i));
  const types = ctx.ref.reference.typesRdv;

  return el(
    "div.grille.grille--large",
    jours.map((jour) => {
      const liste = rdvDuJour(ctx.dossier, jour).filter((r) => r.statut !== "annule");
      const nomFerie = ferie(jour);

      return carteListe({

        titre: dateJourLongue(jour),
        sousTitre: nomFerie
          ? `${nomFerie} · ${pluriel(liste.length, "rendez-vous", "rendez-vous")}`
          : liste.length
            ? `${pluriel(liste.length, "rendez-vous", "rendez-vous")} · ${duree(chargeJour(ctx.dossier, jour, types))}`
            : "libre",
        actions: [
          boutonIcone("plus", `Ajouter un rendez-vous le ${dateJour(jour)}`, {
            onclick: () => ouvrirRdv(ctx, null, { jour }),
          }),
        ],
        contenu: liste.length
          ? el("div", liste.map((r) => ligneRdv(ctx, r, { onclick: () => ouvrirRdv(ctx, r) })))
          : el("div.champ__aide", { style: { padding: "12px 16px" } }, "Journée libre."),
      });
    })
  );
}

/* ================================ Le jour ================================ */

function vueJour(ctx, jour) {
  const types = ctx.ref.reference.typesRdv;
  const liste = rdvDuJour(ctx.dossier, jour);
  const nomFerie = ferie(jour);
  const minutes = chargeJour(ctx.dossier, jour, types);

  const contenu = liste.length
    ? el(
        "div.jour",
        liste.map((r) => {
          const client = parId(ctx.dossier.clients, r.clientId);
          const enConflit = conflits(ctx.dossier, r, types).length > 0;

          return el(
            "div.jour__creneau",
            { onclick: () => ouvrirRdv(ctx, r) },
            el("div.jour__heure", heureDe(r.debut), el("span.jour__fin", heureDe(finRdv(r, types)))),
            el(`div.jour__barre.jour__barre--${r.type}`),
            el(
              "div.jour__corps",
              el("div.jour__titre", titreRdv(r, client, types)),
              el(
                "div.jour__meta",
                el("span", nomType(ctx.ref, r.type)),
                el("span", duree(dureeRdv(r, types))),
                r.adresse || client ? el("span", r.adresse || adresseCourte(client)) : null,
                r.statut === "fait" ? el("span", "· fait") : null,
                r.statut === "annule" ? el("span", "· annulé") : null,
                enConflit ? el("span", { style: { color: "var(--alerte)", fontWeight: "700" } }, "· chevauchement") : null
              ),
              r.note ? el("div.champ__aide", r.note) : null
            )
          );
        })
      )
    : vide({
        ico: "agenda",
        titre: nomFerie || "Journée libre",
        texte: nomFerie ? "Jour férié." : "Aucun rendez-vous ce jour-là.",
        action: bouton("Poser un rendez-vous", {
          variante: "plein",
          ico: "plus",
          onclick: () => ouvrirRdv(ctx, null, { jour }),
        }),
      });

  return carteListe({
    titre: dateJourLongue(jour),
    sousTitre: [nomFerie, liste.length ? duree(minutes) : null].filter(Boolean).join(" · ") || "aucun rendez-vous",
    actions: [
      boutonIcone("plus", "Ajouter un rendez-vous", { variante: "contour", onclick: () => ouvrirRdv(ctx, null, { jour }) }),
    ],
    contenu,
  });
}

/* ========================== La fiche rendez-vous =========================
   Une modale, et non un ecran : on ouvre un rendez-vous depuis quatre endroits
   differents, et revenir d'un ecran plein oblige a se demander ou l'on
   retombe. La modale se ferme, et on est reste ou l'on etait.
   ======================================================================== */

export function ouvrirRdv(ctx, rdvExistant, options = {}) {
  const types = ctx.ref.reference.typesRdv;
  const nouveauRdv = !rdvExistant;

  const jourDefaut = options.jour || ctx.vue.curseur || aujourdhui();
  const brouillon = rdvExistant
    ? { ...rdvExistant }
    : rdvVide({
        debut: instant(jourDefaut, jourDefaut === aujourdhui() ? maintenantArrondi() : "08:00"),
        clientId: options.clientId || "",
        type: options.type || "depannage",
        contratId: options.contratId || "",
        equipementId: options.equipementId || "",
      });

  if (!brouillon.fin) {
    brouillon.fin = ajouteMinutes(brouillon.debut, dureeRdv(brouillon, types));
  }

  const corps = el("div");
  const dessiner = () => corps.replaceChildren(...formulaireRdv(ctx, brouillon, dessiner, types));
  dessiner();

  const { fermer } = ctx.modale({
    titre: nouveauRdv ? "Nouveau rendez-vous" : "Rendez-vous",
    corps,
    actions: (close) => [
      !nouveauRdv
        ? bouton("Supprimer", {
            variante: "danger",
            ico: "poubelle",
            onclick: async () => {
              const ok = await ctx.confirmer({
                titre: "Supprimer ce rendez-vous ?",
                texte: "Il disparaîtra de l'agenda. L'intervention et les documents liés, eux, sont conservés.",
              });
              if (!ok) return;
              close();
              const copie = { ...brouillon };
              ctx.maj((d) => {
                d.rdv = d.rdv.filter((r) => r.id !== brouillon.id);
              });
              ctx.toast("Rendez-vous supprimé.", {
                action: {
                  nom: "Annuler",
                  faire: () => ctx.maj((d) => d.rdv.push(copie)),
                },
              });
            },
          })
        : null,
      bouton("Fermer", { onclick: close }),
      bouton("Enregistrer", {
        variante: "plein",
        onclick: () => {
          if (!brouillon.debut) {
            ctx.toast("Il manque la date et l'heure.", { erreur: true });
            return;
          }
          close();
          ctx.maj((d) => {
            const i = d.rdv.findIndex((r) => r.id === brouillon.id);
            if (i >= 0) d.rdv[i] = brouillon;
            else d.rdv.push(brouillon);
          });
          ctx.toast(nouveauRdv ? "Rendez-vous ajouté." : "Rendez-vous enregistré.");
        },
      }),
    ].filter(Boolean),
  });

  void fermer;
}

function formulaireRdv(ctx, r, redessiner, types) {
  const client = parId(ctx.dossier.clients, r.clientId);
  const conflitsTrouves = conflits(ctx.dossier, r, types);
  const dureeMin = r.fin ? minutesEntre(r.debut, r.fin) : dureeRdv(r, types);

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
              el(
                "div.ligne__meta",
                el("span", adresseCourte(client) || "adresse non renseignée"),
                client.tel ? el("span", client.tel) : null
              )
            ),
            el(
              "div.ligne__actions",
              boutonIcone("croix", "Détacher le client", {
                onclick: () => {
                  r.clientId = "";
                  redessiner();
                },
              })
            )
          )
        ),
        el("div.rang", ...actionsClient(client, r.adresse))
      )
    : autoComplete({
        label: "Client",
        placeholder: "Nom, téléphone, ville…",
        aide: "Laisser vide pour un rendez-vous sans client (fournisseur, congé, formation).",
        chercher: (q) => ctx.dossier.clients.filter((c) => !c.archive && correspond(c, q)),
        rendreItem: (c) => ({ nom: nomClient(c), note: adresseCourte(c) || c.tel }),
        onchoisir: (c) => {
          r.clientId = c.id;
          if (!r.adresse) r.adresse = adresseCourte(c);
          redessiner();
        },
      });

  const equipements = client?.equipements || [];

  return [
    choixClient,

    champSelect("Type d'intervention", {
      valeur: r.type,
      options: types.map((t) => ({ valeur: t.cle, nom: t.nom })),
      aide: types.find((t) => t.cle === r.type)?.aide,
      onchange: (v) => {
        const ancienneDuree = minutesEntre(r.debut, r.fin);
        r.type = v;
        // La duree suit le type tant qu'elle n'a pas ete touchee a la main :
        // un entretien dure une heure, une installation une demi-journee.
        const attendue = types.find((t) => t.cle === v)?.dureeMin || CONFIG.dureeRdvMin;
        if (!r.dureePersonnalisee) r.fin = ajouteMinutes(r.debut, attendue);
        void ancienneDuree;
        redessiner();
      },
    }),

    el(
      "div.grille.grille--3",
      champDate("Date", {
        valeur: jourDe(r.debut),
        onchange: (v) => {
          if (!v) return;
          const h = heureDe(r.debut) || "08:00";
          const d = minutesEntre(r.debut, r.fin);
          r.debut = instant(v, h);
          r.fin = ajouteMinutes(r.debut, d);
          redessiner();
        },
      }),
      champHeure("Heure d'arrivée", {
        valeur: heureDe(r.debut),
        onchange: (v) => {
          if (!v) return;
          const d = minutesEntre(r.debut, r.fin);
          r.debut = instant(jourDe(r.debut), v);
          r.fin = ajouteMinutes(r.debut, d);
          redessiner();
        },
      }),
      champNombre("Durée", {
        valeur: dureeMin,
        unite: "min",
        onchange: (v) => {
          r.dureePersonnalisee = true;
          r.fin = ajouteMinutes(r.debut, Math.max(15, v || 60));
          redessiner();
        },
      })
    ),

    conflitsTrouves.length
      ? aide(
          `Attention : ce créneau chevauche ${conflitsTrouves
            .map((c) => `${creneauTexte(c, types)} (${titreRdv(c, parId(ctx.dossier.clients, c.clientId), types)})`)
            .join(", ")}.`,
          "alerte"
        )
      : null,

    champ("Intitulé", {
      valeur: r.titre,
      placeholder: client ? nomClient(client) : "Ce qu'il y a à faire",
      aide: "Facultatif. À défaut, le nom du client s'affiche dans l'agenda.",
      oninput: (v) => {
        r.titre = v;
      },
    }),

    champ("Adresse d'intervention", {
      valeur: r.adresse,
      placeholder: client ? adresseCourte(client) : "Rue, code postal, ville",
      aide: "À remplir seulement si le chantier n'est pas à l'adresse du client.",
      oninput: (v) => {
        r.adresse = v;
      },
    }),

    equipements.length
      ? champSelect("Appareil concerné", {
          valeur: r.equipementId,
          options: [
            { valeur: "", nom: "— aucun —" },
            ...equipements.map((e) => ({
              valeur: e.id,
              nom: [e.marque, e.modele, e.emplacement].filter(Boolean).join(" · ") || "Appareil",
            })),
          ],
          onchange: (v) => {
            r.equipementId = v;
          },
        })
      : null,

    champZone("Note", {
      valeur: r.note,
      lignes: 3,
      placeholder: "Code d'accès, étage, pièces à prévoir, ce que le client a décrit au téléphone…",
      oninput: (v) => {
        r.note = v;
      },
    }),

    el(
      "div.grille.grille--2",
      champSelect("État", {
        valeur: r.statut,
        options: ctx.ref.reference.statutsRdv.map((s) => ({ valeur: s.cle, nom: s.nom })),
        onchange: (v) => {
          r.statut = v;
          redessiner();
        },
      }),
      coche("Urgence", {
        valeur: r.urgent === true,
        note: "Se signale dans l'agenda et justifie la majoration",
        onchange: (v) => {
          r.urgent = v;
          redessiner();
        },
      })
    ),

    r.id && r.clientId
      ? el(
          "div.carte__pied",
          { style: { margin: "0 -24px -24px", borderRadius: "0" } },
          bouton("Bon d'intervention", {
            ico: "interventions",
            petit: true,
            onclick: () => ouvrirIntervention(ctx, null, { rdv: r }),
          }),
          bouton("Devis", {
            ico: "devis",
            petit: true,
            onclick: () => creerDocument(ctx, "devis", { clientId: r.clientId, chantier: r.adresse }),
          }),
          r.contratId
            ? bouton("Entretien fait", {
                ico: "coche",
                petit: true,
                onclick: () => {
                  ctx.maj((d) => {
                    const c = parId(d.contrats, r.contratId);
                    if (c) marquerPassage(c, jourDe(r.debut));
                    const rr = parId(d.rdv, r.id);
                    if (rr) rr.statut = "fait";
                    const eq = equipementParId(d, r.equipementId);
                    if (eq) {
                      const client = d.clients.find((c2) => c2.equipements.some((e) => e.id === r.equipementId));
                      const cible = client?.equipements.find((e) => e.id === r.equipementId);
                      if (cible) cible.dernierEntretien = jourDe(r.debut);
                    }
                  });
                  ctx.toast("Entretien enregistré, prochaine visite reprogrammée.");
                },
              })
            : null
        )
      : null,
  ].filter(Boolean);
}
