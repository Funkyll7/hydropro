/**
 * photos.js — prendre une photo de chantier, la ranger, la revoir.
 *
 * LA PRISE DE VUE PASSE PAR UN <input type="file" capture>, pas par
 * `getUserMedia`. Ce n'est pas une facilite : un flux video demande la
 * permission camera, ne marche qu'en HTTPS, oblige a fabriquer un viseur, ne
 * sait pas declencher l'autofocus ni le flash, et donne une image de moins
 * bonne qualite que l'appareil photo du telephone. `capture="environment"`
 * ouvre l'appareil photo NATIF — celui que l'artisan sait deja utiliser, avec
 * sa mise au point et sa lampe — et rend le fichier a l'application.
 *
 * Sur un ordinateur, le meme bouton ouvre le selecteur de fichiers. C'est le
 * comportement attendu : on y range les photos prises dans la journee.
 */

import { el, fill } from "../core/dom.js";
import { bouton, boutonIcone, champ, champSelect, vide } from "./champs.js";
import { icone } from "./icones.js";
import * as Photos from "../core/photos.js";
import { photoVide } from "../domain/dossier.js";
import { dateCourte, heureDe } from "../core/format.js";

/** « 2,4 Mo », « 312 Ko ». */
export function poids(octets) {
  if (!octets) return "—";
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/* ============================== La prise de vue =========================== */

/**
 * Les deux boutons d'ajout.
 *
 * Deux, et non un seul : `capture` FORCE l'appareil photo et interdit de
 * choisir une image existante. Or on veut les deux — photographier sur place,
 * et rattacher le soir les photos deja prises. Un seul bouton aurait exclu
 * l'un des deux usages.
 */
export function boutonsAjout(ctx, chantier, options = {}) {
  const ajouter = (capture) => {
    const input = el("input", {
      type: "file",
      accept: "image/*",
      multiple: !capture,
      hidden: true,
    });
    // `capture` est un attribut booleen : le poser, meme a "", declenche
    // l'appareil photo. Il ne doit donc exister que sur le premier bouton.
    if (capture) input.setAttribute("capture", "environment");

    document.body.append(input);
    input.addEventListener("change", async () => {
      const fichiers = [...(input.files || [])];
      input.remove();
      if (fichiers.length) await enregistrerPhotos(ctx, chantier, fichiers, options.phase);
    });
    input.click();
  };

  return [
    bouton("Photographier", { variante: "plein", ico: "photo", onclick: () => ajouter(true) }),
    bouton("Depuis l'appareil", { ico: "import", onclick: () => ajouter(false) }),
  ];
}

/**
 * Comprime, range et etiquette les photos choisies.
 *
 * L'ordre compte : on RANGE L'IMAGE D'ABORD, et on n'ajoute l'etiquette au
 * dossier que si l'ecriture a reussi. L'inverse laisserait des vignettes
 * cassees pointant vers des images qui n'existent pas — et l'artisan croirait
 * avoir une preuve qu'il n'a pas.
 */
export async function enregistrerPhotos(ctx, chantier, fichiers, phase = "pendant") {
  await Photos.demanderPersistance();

  const place = await Photos.place();
  if (place && place.part > 0.9) {
    ctx.toast(
      `La mémoire du navigateur est pleine à ${Math.round(place.part * 100)} %. Exportez et faites du ménage avant d'ajouter des photos.`,
      { erreur: true, duree: 9000 }
    );
    return;
  }

  let ajoutees = 0;
  let refusees = 0;

  for (const [i, fichier] of fichiers.entries()) {
    if (!fichier.type.startsWith("image/")) {
      refusees += 1;
      continue;
    }
    // Toujours signaler, meme pour une seule photo : la compression d'une image
    // de telephone prend pres d'une seconde, pendant laquelle rien ne bouge a
    // l'ecran. Sans ce message, on appuie une deuxieme fois.
    ctx.toast(
      fichiers.length > 1 ? `Photo ${i + 1} sur ${fichiers.length}…` : "Enregistrement de la photo…",
      { duree: 2500 }
    );
    try {
      const preparee = await Photos.preparer(fichier);
      const etiquette = photoVide({ phase, octets: preparee.octets });
      const range = await Photos.ranger(etiquette.id, preparee);
      if (!range) {
        refusees += 1;
        continue;
      }
      chantier.photos.push(etiquette);
      ajoutees += 1;
    } catch {
      refusees += 1;
    }
  }

  if (ajoutees) ctx.maj(() => {});
  if (refusees) {
    ctx.toast(
      `${refusees} photo(s) n'ont pas pu être enregistrées. La mémoire du navigateur est peut-être pleine — exportez votre dossier.`,
      { erreur: true, duree: 9000 }
    );
  } else if (ajoutees) {
    ctx.toast(`${ajoutees} photo${ajoutees > 1 ? "s" : ""} ajoutée${ajoutees > 1 ? "s" : ""}.`);
  }
}

/* ================================ La galerie ============================== */

/**
 * La grille de vignettes d'un chantier.
 *
 * Elle se remplit APRÈS avoir ete rendue : les images vivent dans IndexedDB,
 * donc leur lecture est asynchrone, alors que les vues de cette application
 * sont synchrones. La grille est donc rendue vide puis peuplee — ce qui evite
 * de rendre toutes les vues asynchrones pour une seule d'entre elles.
 */
export function galerie(ctx, chantier, options = {}) {
  const grille = el("div.photos");
  const liste = options.photos || chantier.photos || [];

  if (!liste.length) {
    return vide({
      ico: "photo",
      titre: "Aucune photo",
      texte:
        "Une photo « avant » prise en arrivant vaut mieux qu'un long débat trois semaines plus tard, et une photo « pendant » montre ce que plus personne ne reverra une fois le mur refermé.",
      action: options.sansAjout ? null : el("div.rang", ...boutonsAjout(ctx, chantier)),
    });
  }

  peupler();
  return grille;

  async function peupler() {
    for (const photo of liste) {
      const vignette = el("div.photo.squelette");
      grille.append(vignette);

      const adresse = await Photos.url(photo.id, "vignette");
      if (!adresse) {
        // L'etiquette existe, l'image non : dossier importe sans ses photos,
        // ou stockage vide par le navigateur. On le DIT, au lieu d'afficher
        // un carre gris que personne ne saurait interpreter.
        fill(
          vignette,
          el("div.photo__manquante", icone("alerte", 20), el("span", "Image absente de cet appareil"))
        );
        vignette.classList.remove("squelette");
        continue;
      }

      fill(
        vignette,
        el("img.photo__img", { src: adresse, alt: photo.legende || "Photo de chantier", loading: "lazy" }),
        photo.phase ? el(`span.photo__phase.photo__phase--${photo.phase}`, libellePhase(ctx, photo.phase)) : null,
        photo.legende ? el("span.photo__legende", photo.legende) : null
      );
      vignette.classList.remove("squelette");
      // On ouvre sur TOUTES les photos du chantier, pas seulement sur celles
      // de la phase cliquee : les fleches servent a montrer un avant puis un
      // apres, ce qui suppose de traverser les groupes.
      vignette.onclick = () => ouvrirPhoto(ctx, chantier, photo);
    }
  }
}

function libellePhase(ctx, cle) {
  return ctx.ref.reference.phasesPhoto.find((p) => p.cle === cle)?.nom || cle;
}

/* ============================== La visionneuse ============================ */

/**
 * Une photo en grand, avec ce qui la decrit et ce qu'on peut en faire.
 *
 * Les fleches permettent de parcourir le chantier sans revenir a la grille :
 * c'est ainsi qu'on montre un avant/apres a un client, en tenant le telephone
 * devant lui.
 */
export function ouvrirPhoto(ctx, chantier, photo, liste = null) {
  const toutes = liste || chantier.photos || [];
  let index = Math.max(0, toutes.findIndex((p) => p.id === photo.id));

  const corps = el("div.visionneuse");
  const dessiner = async () => {
    const courante = toutes[index];
    const adresse = await Photos.url(courante.id, "plein");

    fill(
      corps,
      el(
        "div.visionneuse__image",
        adresse
          ? el("img", { src: adresse, alt: courante.legende || "Photo de chantier" })
          : el("div.photo__manquante", icone("alerte", 24), el("span", "Image absente de cet appareil")),
        toutes.length > 1
          ? el(
              "div.visionneuse__fleches",
              boutonIcone("gauche", "Photo précédente", {
                variante: "contour",
                onclick: () => {
                  index = (index - 1 + toutes.length) % toutes.length;
                  dessiner();
                },
              }),
              el("span.visionneuse__compte", `${index + 1} / ${toutes.length}`),
              boutonIcone("droite", "Photo suivante", {
                variante: "contour",
                onclick: () => {
                  index = (index + 1) % toutes.length;
                  dessiner();
                },
              })
            )
          : null
      ),
      champ("Légende", {
        valeur: courante.legende,
        placeholder: "Ce qu'on doit comprendre en la regardant dans deux ans",
        oninput: (v) => ctx.majSilencieux(() => {
          courante.legende = v;
        }),
      }),
      champSelect("Phase", {
        valeur: courante.phase,
        options: ctx.ref.reference.phasesPhoto.map((p) => ({ valeur: p.cle, nom: p.nom })),
        aide: ctx.ref.reference.phasesPhoto.find((p) => p.cle === courante.phase)?.aide,
        onchange: (v) => ctx.maj(() => {
          courante.phase = v;
        }),
      }),
      el(
        "div.champ__aide",
        `Prise le ${dateCourte(courante.prise)} à ${heureDe(courante.prise)} · ${poids(courante.octets)}`
      )
    );
  };

  dessiner();

  ctx.modale({
    titre: "Photo de chantier",
    large: true,
    corps,
    actions: (fermer) => [
      bouton("Supprimer", {
        variante: "danger",
        ico: "poubelle",
        onclick: async () => {
          const courante = toutes[index];
          const ok = await ctx.confirmer({
            titre: "Supprimer cette photo ?",
            texte: "Elle sera effacée de cet appareil. Si elle est votre seule preuve de l'état avant travaux, exportez-la d'abord.",
          });
          if (!ok) return;
          await Photos.supprimer(courante.id);
          fermer();
          ctx.maj(() => {
            chantier.photos = chantier.photos.filter((p) => p.id !== courante.id);
          });
          ctx.toast("Photo supprimée.");
        },
      }),
      bouton("Enregistrer sur l'appareil", {
        ico: "export",
        onclick: async () => {
          const courante = toutes[index];
          const adresse = await Photos.url(courante.id, "plein");
          if (!adresse) return ctx.toast("Image absente de cet appareil.", { erreur: true });
          const a = el("a", {
            href: adresse,
            download: `${(courante.legende || "chantier").replace(/[^\w-]+/g, "-").slice(0, 40)}-${courante.id}.jpg`,
          });
          document.body.append(a);
          a.click();
          a.remove();
        },
      }),
      bouton("Fermer", { variante: "plein", onclick: fermer }),
    ],
  });
}
