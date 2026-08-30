/**
 * reglages.js — la fiche entreprise, la numerotation, les sauvegardes.
 *
 * C'est le premier ecran a remplir, et le seul qu'on ne rouvre presque jamais.
 * Il est donc organise par ce qui BLOQUE : ce qui manque pour qu'un devis soit
 * legal apparait en haut, en rouge, avec le champ juste en dessous.
 */

import { el } from "../core/dom.js";
import { CONFIG } from "../config.js";
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
  kpi,
  sectionTitre,
} from "./champs.js";
import { icone } from "./icones.js";
import { pluriel } from "../core/format.js";
import { poidsKo } from "../domain/dossier.js";
import { doublons, etatCompteurs, reglerCompteur, trous } from "../domain/numerotation.js";

export const titre = () => "Réglages";

export function actions(ctx) {
  return [
    bouton("Exporter", { ico: "export", petit: true, onclick: ctx.exporter }),
    bouton("Importer", { ico: "import", petit: true, onclick: ctx.importer }),
  ];
}

export function rendre(ctx) {
  return el(
    "div.onglet",
    manquants(ctx),
    identite(ctx),
    legal(ctx),
    banque(ctx),
    defauts(ctx),
    numerotation(ctx),
    sauvegarde(ctx),
    obligations(ctx),
    aPropos(ctx)
  );
}

/* ============================== Ce qui manque ============================= */

/**
 * La liste de ce qui empeche d'emettre un document valable.
 *
 * Elle disparait entierement une fois la fiche remplie : un encadre
 * d'avertissement permanent finit par ne plus rien avertir.
 */
function manquants(ctx) {
  const e = ctx.dossier.entreprise;
  const liste = [
    !e.nom && "Le nom de l'entreprise",
    !e.adresse && "L'adresse",
    !e.siret && "Le numéro SIRET",
    e.assujettiTva && !e.tvaIntra && "Le numéro de TVA intracommunautaire",
    !e.assureur && "L'assureur de la garantie décennale",
    !e.contratAssurance && "Le numéro de contrat d'assurance",
    !e.mediateur && "Le médiateur de la consommation",
  ].filter(Boolean);

  if (!liste.length) return null;

  return carte({
    variante: "avert",
    titre: "À compléter avant d'envoyer un document",
    sousTitre: `${pluriel(liste.length, "mention")} obligatoire(s) manquante(s)`,
    corps: [
      el(
        "ul",
        { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        liste.map((m) => el("li", { style: { display: "flex", gap: "8px" } }, icone("alerte", 15), el("span", m)))
      ),
      aide(
        "Ces mentions sont obligatoires sur tout devis et toute facture de travaux du bâtiment. Leur absence est sanctionnée, et l'assurance décennale est la première chose que vérifie un client averti."
      ),
    ],
  });
}

/* =============================== Identité ================================ */

function identite(ctx) {
  const e = ctx.dossier.entreprise;
  const maj = (cle) => (v) =>
    ctx.majSilencieux(() => {
      e[cle] = v;
    });

  return carte({
    titre: "Identité de l'entreprise",
    sousTitre: "Ce qui s'imprime en haut de chaque document",
    corps: [
      el(
        "div.grille.grille--2",
        champ("Nom commercial", { valeur: e.nom, placeholder: "Plomberie Martin", oninput: maj("nom") }),
        champ("Forme juridique", {
          valeur: e.forme,
          placeholder: "Entreprise individuelle, SARL, SASU…",
          oninput: maj("forme"),
        })
      ),
      el(
        "div.grille.grille--2",
        champ("Responsable", { valeur: e.responsable, placeholder: "Prénom et nom", oninput: maj("responsable") }),
        champ("Capital social", { valeur: e.capital, placeholder: "5 000 €", aide: "Uniquement pour les sociétés.", oninput: maj("capital") })
      ),
      champ("Adresse", { valeur: e.adresse, oninput: maj("adresse") }),
      el(
        "div.grille.grille--3",
        champ("Code postal", { valeur: e.cp, inputmode: "numeric", oninput: maj("cp") }),
        champ("Ville", { valeur: e.ville, oninput: maj("ville") }),
        champ("Téléphone", { valeur: e.tel, type: "tel", oninput: maj("tel") })
      ),
      el(
        "div.grille.grille--2",
        champ("Adresse e-mail", { valeur: e.email, type: "email", oninput: maj("email") }),
        champ("Site internet", { valeur: e.web, oninput: maj("web") })
      ),
      logo(ctx),
    ],
  });
}

/**
 * Le logo.
 *
 * Il est stocke en data URI DANS le dossier, ce qui le fait voyager avec
 * l'export — un logo range ailleurs se perd au premier changement de machine.
 * En contrepartie il pese sur le quota du localStorage, d'ou le redimensionnement
 * automatique : au-dela de 400 px de large, une image ne sert plus a rien sur
 * une feuille A4, et un logo de 3 Mo peut a lui seul remplir la memoire.
 */
function logo(ctx) {
  const e = ctx.dossier.entreprise;

  const choisir = () => {
    const input = el("input", { type: "file", accept: "image/*", hidden: true });
    document.body.append(input);
    input.addEventListener("change", async () => {
      const fichier = input.files?.[0];
      input.remove();
      if (!fichier) return;
      try {
        const data = await reduireImage(fichier, 400);
        ctx.maj(() => {
          e.logo = data;
        });
        ctx.toast("Logo enregistré.");
      } catch {
        ctx.toast("Cette image n'a pas pu être lue.", { erreur: true });
      }
    });
    input.click();
  };

  return el(
    "div.champ",
    el("div.champ__label", "Logo"),
    el(
      "div.rang",
      e.logo
        ? el("img", { src: e.logo, alt: "Logo", style: { maxHeight: "64px", maxWidth: "200px", objectFit: "contain" } })
        : el("div.champ__aide", "Aucun logo. Facultatif, mais un document à en-tête fait sérieux."),
      bouton(e.logo ? "Remplacer" : "Choisir une image", { petit: true, onclick: choisir }),
      e.logo
        ? bouton("Retirer", {
            variante: "danger",
            petit: true,
            onclick: () => ctx.maj(() => {
              e.logo = "";
            }),
          })
        : null
    ),
    el("div.champ__aide", "L'image est réduite à 400 px de large et rangée dans le dossier : elle suit vos exports.")
  );
}

function reduireImage(fichier, largeurMax) {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onerror = rejeter;
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = rejeter;
      img.onload = () => {
        const ratio = Math.min(1, largeurMax / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resoudre(canvas.toDataURL("image/png"));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

/* ============================ Mentions légales =========================== */

function legal(ctx) {
  const e = ctx.dossier.entreprise;
  const maj = (cle) => (v) =>
    ctx.majSilencieux(() => {
      e[cle] = v;
    });

  return carte({
    titre: "Mentions légales et assurances",
    sousTitre: "Obligatoires sur les devis et les factures de travaux",
    corps: [
      el(
        "div.grille.grille--3",
        champ("SIRET", { valeur: e.siret, inputmode: "numeric", oninput: maj("siret") }),
        champ("Code APE", { valeur: e.ape, placeholder: "4322A", oninput: maj("ape") }),
        champ("RCS ou RM", { valeur: e.rcs, placeholder: "RCS Lyon 123 456 789", oninput: maj("rcs") })
      ),
      coche("Assujetti à la TVA", {
        valeur: e.assujettiTva !== false,
        note: "Décochez si vous êtes en franchise en base (art. 293 B du CGI) : aucune TVA n'apparaîtra sur vos documents.",
        onchange: (v) =>
          ctx.maj(() => {
            e.assujettiTva = v;
          }),
      }),
      e.assujettiTva !== false
        ? champ("Numéro de TVA intracommunautaire", {
            valeur: e.tvaIntra,
            placeholder: "FR12345678901",
            oninput: maj("tvaIntra"),
          })
        : aide("Vos documents porteront la mention « TVA non applicable, article 293 B du CGI »."),

      sectionTitre("Assurance décennale"),
      el(
        "div.grille.grille--3",
        champ("Assureur", { valeur: e.assureur, placeholder: "MAAF, AXA, SMABTP…", oninput: maj("assureur") }),
        champ("Numéro de contrat", { valeur: e.contratAssurance, oninput: maj("contratAssurance") }),
        champ("Couverture géographique", {
          valeur: e.couvertureAssurance,
          placeholder: "France métropolitaine",
          oninput: maj("couvertureAssurance"),
        })
      ),
      champ("Qualifications", {
        valeur: e.qualifications,
        placeholder: "PG (Professionnel du gaz), RGE QualiPAC, attestation fluides…",
        aide: "Rassure le client, et conditionne les aides auxquelles il a droit.",
        oninput: maj("qualifications"),
      }),

      sectionTitre("Médiation de la consommation"),
      el(
        "div.grille.grille--2",
        champ("Médiateur", { valeur: e.mediateur, placeholder: "Nom de l'organisme", oninput: maj("mediateur") }),
        champ("Site du médiateur", { valeur: e.mediateurUrl, placeholder: "https://…", oninput: maj("mediateurUrl") })
      ),
      aide(
        "Toute entreprise qui travaille pour des particuliers doit adhérer à un dispositif de médiation et en indiquer les coordonnées sur ses devis, ses factures et son site."
      ),
    ],
  });
}

/* ============================== Coordonnées bancaires ==================== */

function banque(ctx) {
  const e = ctx.dossier.entreprise;
  const maj = (cle) => (v) =>
    ctx.majSilencieux(() => {
      e[cle] = v;
    });

  return carte({
    titre: "Règlement",
    sousTitre: "S'imprime au bas des factures",
    corps: [
      el(
        "div.grille.grille--3",
        champ("IBAN", { valeur: e.iban, oninput: maj("iban") }),
        champ("BIC", { valeur: e.bic, oninput: maj("bic") }),
        champ("Banque", { valeur: e.banque, oninput: maj("banque") })
      ),
      champZone("Conditions particulières", {
        valeur: e.conditions,
        lignes: 3,
        placeholder: "Ce que vous voulez ajouter au bas de chaque document : délais, réserves, garanties…",
        oninput: maj("conditions"),
      }),
      champ("Ligne de pied de page", {
        valeur: e.piedDePage,
        placeholder: "Membre d'un centre de gestion agréé, adhérent…",
        oninput: maj("piedDePage"),
      }),
    ],
  });
}

/* =============================== Par défaut ============================== */

function defauts(ctx) {
  const e = ctx.dossier.entreprise;

  return carte({
    titre: "Valeurs par défaut",
    sousTitre: "Reprises à chaque nouveau document",
    corps: [
      el(
        "div.grille.grille--3",
        champMontant("Taux horaire", {
          valeur: e.tauxHoraire,
          unite: "€/h",
          aide: "Sert de référence ; le catalogue reste maître des prix.",
          onchange: (v) => ctx.maj(() => {
            e.tauxHoraire = v;
          }),
        }),
        champNombre("Validité des devis", {
          valeur: e.validiteDevis,
          unite: "jours",
          aide: "Au-delà, les prix ne vous engagent plus.",
          onchange: (v) => ctx.maj(() => {
            e.validiteDevis = v;
          }),
        }),
        champNombre("Délai de paiement", {
          valeur: e.delaiPaiement,
          unite: "jours",
          aide: "30 jours par défaut ; 60 jours maximum entre professionnels.",
          onchange: (v) => ctx.maj(() => {
            e.delaiPaiement = v;
          }),
        })
      ),
      el(
        "div.grille.grille--3",
        champNombre("Pénalités de retard", {
          valeur: e.penalites,
          unite: "%/an",
          aide: "Minimum légal : trois fois le taux d'intérêt légal. 12 % est un usage courant.",
          onchange: (v) => ctx.maj(() => {
            e.penalites = v;
          }),
        }),
        champNombre("Acompte proposé", {
          valeur: e.acompteDefaut,
          unite: "%",
          aide: "30 % à la signature est l'usage sur un chantier.",
          onchange: (v) => ctx.maj(() => {
            e.acompteDefaut = v;
          }),
        }),
        champSelect("TVA par défaut", {
          valeur: e.tvaDefaut,
          options: ctx.ref.tva.taux
            .filter((t) => t.valeur > 0)
            .map((t) => ({ valeur: t.valeur, nom: `${t.valeur} % — ${t.nom}` })),
          onchange: (v) => ctx.maj(() => {
            e.tvaDefaut = Number(v);
          }),
        })
      ),
      aideTva(ctx),
    ],
  });
}

/** Le rappel des trois taux, avec leurs conditions et la date de verification. */
function aideTva(ctx) {
  return el(
    "details.repli",
    el("summary.repli__tete", "Quel taux de TVA appliquer ?"),
    el(
      "div.repli__corps",
      aide(ctx.ref.tva.avertissement, "avert"),
      ...ctx.ref.tva.taux.map((t) =>
        el(
          "div",
          el("div.champ__label", `${t.valeur} % — ${t.nom}`),
          el("div.champ__aide", t.resume),
          el(
            "ul",
            { style: { paddingLeft: "16px", listStyle: "disc" } },
            t.cas.map((c) => el("li", { style: { fontSize: "var(--t-note)", color: "var(--texte-doux)" } }, c))
          )
        )
      ),
      el("div.champ__aide", `Vérifié le ${ctx.ref.tva.verifieLe}.`),
      el(
        "div.rang",
        ...ctx.ref.tva.sources.map((s) =>
          el("a.btn.btn--contour.btn--petit", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.nom)
        )
      )
    )
  );
}

/* ============================= Numérotation ============================== */

function numerotation(ctx) {
  const etats = etatCompteurs(ctx.dossier);
  const doublonsTrouves = doublons(ctx.dossier);
  const annee = String(new Date().getFullYear());
  const trousTrouves = trous(ctx.dossier, "facture", annee);

  return carte({
    titre: "Numérotation",
    sousTitre: "Les factures doivent porter une séquence continue, sans trou",
    corps: [
      aide(
        "Une facture ne reçoit son numéro qu'à sa validation, jamais à sa création : c'est ce qui permet de supprimer un brouillon sans laisser de trou dans la séquence. Un document numéroté, lui, ne peut plus être supprimé — on l'annule par un avoir."
      ),
      ...etats.slice(0, 2).map((e) =>
        el(
          "div",
          sectionTitre(e.annee),
          el(
            "div.tableau__defile",
            el(
              "table.tableau",
              el("thead", el("tr", el("th", "Type"), el("th.num", "Émis"), el("th", "Prochain numéro"), el("th", ""))),
              el(
                "tbody",
                e.lignes.map((l) =>
                  el(
                    "tr",
                    el("td", l.nom),
                    el("td.num", l.emis),
                    el("td", el("code", l.prochain)),
                    el(
                      "td",
                      bouton("Régler", {
                        petit: true,
                        onclick: () => ouvrirCompteur(ctx, l.kind, e.annee, l.emis, l.nom),
                      })
                    )
                  )
                )
              )
            )
          )
        )
      ),
      doublonsTrouves.length
        ? aide(
            `Attention : ${pluriel(doublonsTrouves.length, "numéro")} en double (${doublonsTrouves
              .map((d) => d.numero)
              .join(", ")}). Deux documents qui portent le même numéro rendent la comptabilité invalide.`,
            "alerte"
          )
        : null,
      trousTrouves.length
        ? aide(
            `Trous dans la séquence des factures ${annee} : ${trousTrouves.join(", ")}. Ce n'est pas forcément une erreur — une facture a pu être émise ailleurs — mais il faut pouvoir l'expliquer.`,
            "avert"
          )
        : null,
    ],
  });
}

function ouvrirCompteur(ctx, kind, annee, actuel, nom) {
  let valeur = actuel;

  ctx.modale({
    titre: `Compteur : ${nom} ${annee}`,
    corps: el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "16px" } },
      aide(
        "À régler quand on reprend une numérotation commencée ailleurs — carnet à souche, tableur, ancien logiciel. Indiquez le nombre de documents DÉJÀ émis cette année : le prochain portera le numéro suivant."
      ),
      champNombre("Documents déjà émis", {
        valeur: actuel,
        onchange: (v) => {
          valeur = v;
        },
      })
    ),
    actions: (close) => [
      bouton("Annuler", { onclick: close }),
      bouton("Régler", {
        variante: "plein",
        onclick: () => {
          close();
          ctx.maj((d) => reglerCompteur(d, kind, annee, valeur));
          ctx.toast("Compteur réglé.");
        },
      }),
    ],
  });
}

/* ============================== Sauvegarde =============================== */

function sauvegarde(ctx) {
  const poids = poidsKo(ctx.dossier);
  const d = ctx.dossier;

  return carte({
    variante: "cuivre",
    titre: "Vos données",
    sousTitre: "Elles ne quittent jamais ce navigateur",
    corps: [
      el(
        "div.grille.grille--4",
        kpi({ valeur: String(d.clients.length), label: "Clients" }),
        kpi({ valeur: String(d.documents.length), label: "Documents" }),
        kpi({ valeur: String(d.rdv.length), label: "Rendez-vous" }),
        kpi({
          valeur: `${poids} ko`,
          label: "Taille du dossier",
          detail: poids > 3500 ? "proche de la limite du navigateur" : "sur environ 5 000 ko disponibles",
          ton: poids > 3500 ? "alerte" : "",
        })
      ),
      aide(
        "Il n'y a ni compte, ni serveur, ni abonnement : tout est écrit dans la mémoire de CE navigateur. C'est ce qui rend l'application gratuite, rapide et utilisable hors ligne — et c'est aussi ce qui la rend fragile. Effacer les données de navigation efface le dossier. Exportez régulièrement, et rangez le fichier ailleurs : clé USB, disque externe, espace de stockage en ligne.",
        "avert"
      ),
      el(
        "div.rang",
        bouton("Exporter le dossier", { variante: "plein", ico: "export", onclick: ctx.exporter }),
        bouton("Importer une sauvegarde", { ico: "import", onclick: ctx.importer }),
        bouton("Tout effacer", {
          variante: "danger",
          ico: "poubelle",
          onclick: async () => {
            const ok = await ctx.confirmer({
              titre: "Effacer tout le dossier ?",
              texte: `Clients, rendez-vous, devis, factures : ${d.clients.length + d.documents.length + d.rdv.length} éléments seront définitivement supprimés. Exportez d'abord si vous n'êtes pas certain.`,
              valider: "Tout effacer",
            });
            if (!ok) return;
            const second = await ctx.confirmer({
              titre: "Vraiment ?",
              texte: "Cette action ne peut pas être annulée et aucune copie n'est conservée ailleurs.",
              valider: "Oui, tout effacer",
            });
            if (!second) return;
            localStorage.removeItem(CONFIG.storage.dossier);
            window.location.reload();
          },
        })
      ),
    ],
  });
}

/* ============================== Obligations ============================== */

function obligations(ctx) {
  return carteListe({
    titre: "Vos obligations",
    sousTitre: "Ce qu'un plombier-chauffagiste doit tenir à jour — vérifié le " + ctx.ref.checklist.verifieLe,
    contenu: el(
      "div",
      ctx.ref.checklist.obligations.map((o) =>
        el(
          "div.ligne",
          el("div.ligne__icone", icone("contrats", 18)),
          el(
            "div.ligne__corps",
            el("div.ligne__titre", o.nom),
            el("div.champ__aide", o.texte),
            o.risque ? el("div.champ__aide.champ__aide--alerte", o.risque) : null
          ),
          el("div.ligne__droite", el("span.tag", o.periodicite))
        )
      )
    ),
  });
}

/* ================================ À propos =============================== */

function aPropos(ctx) {
  return carte({
    titre: `À propos de ${CONFIG.nom}`,
    corps: [
      el(
        "p",
        `${CONFIG.nom} — ${CONFIG.baseline}. Site statique : aucune dépendance, aucun serveur, aucun suivi. Fonctionne hors ligne une fois ouvert.`
      ),
      el(
        "div.rang",
        ...Object.entries(CONFIG.liens).map(([cle, url]) =>
          el(
            "a.btn.btn--contour.btn--petit",
            { href: url, target: "_blank", rel: "noopener noreferrer" },
            icone("lien", 14),
            libelleLien(cle)
          )
        )
      ),
      aide(
        "Les informations réglementaires de cette application sont un aide-mémoire, pas un conseil juridique ou fiscal. Elles changent à chaque loi de finances : vérifiez auprès de votre comptable ou de votre organisation professionnelle avant d'engager un chantier important."
      ),
    ],
  });
}

const LIBELLES = {
  tvaTravaux: "TVA sur les travaux",
  mentionsFacture: "Mentions d'une facture",
  devisObligatoire: "Quand le devis est obligatoire",
  decennale: "Assurance décennale",
  entretienChaudiere: "Entretien de chaudière",
  factureElectronique: "Facturation électronique",
  delaisPaiement: "Délais de paiement",
};

const libelleLien = (cle) => LIBELLES[cle] || cle;

