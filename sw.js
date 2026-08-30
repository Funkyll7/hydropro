/**
 * sw.js — le cache hors ligne.
 *
 * L'application n'a besoin du reseau que pour SE charger. Une fois la coquille
 * en cache, tout se passe dans le navigateur et le dossier vit dans le
 * localStorage : elle marche donc entierement hors ligne. Ce n'est pas un
 * gadget. Un plombier remplit son bon d'intervention dans une cave, une
 * chaufferie, un sous-sol de copropriete — trois endroits ou le reseau ne
 * passe pas, et ou il est hors de question de perdre ce qu'on vient de saisir.
 *
 * DEUX STRATEGIES, et la distinction porte sur ce qui casse quand on se
 * trompe :
 *
 *  - la COQUILLE (HTML, CSS, JS) est servie depuis le cache, puis rafraichie
 *    en arriere-plan. Priorite au demarrage instantane ; une version en retard
 *    d'un chargement n'a aucune consequence ;
 *  - les DONNEES DE REFERENCE (taux de TVA, mentions legales) sont demandees
 *    au RESEAU d'abord, le cache ne servant que de repli. Un taux de TVA
 *    perime servi silencieusement produirait une facture fausse, et c'est le
 *    seul bug que cette application ne peut pas se permettre.
 */

const VERSION = "hydropro-v1";
const CACHE_COQUE = `${VERSION}-coque`;
const CACHE_DATA = `${VERSION}-data`;

/**
 * LA LISTE DOIT ETRE COMPLETE. `addAll` est ATOMIQUE : un seul fichier
 * manquant fait echouer toute l'installation, la premiere inscription est
 * jetee, et le mode hors ligne ne s'installe jamais — sans le moindre message,
 * puisque le site continue de marcher en ligne. `tools/verification.html` compare
 * cette liste au contenu reel du dossier.
 */
const COQUE = [
  "./",
  "index.html",
  "manifest.webmanifest",

  "assets/css/theme.css",
  "assets/css/base.css",
  "assets/css/layout.css",
  "assets/css/components.css",
  "assets/css/print.css",
  "assets/img/favicon.svg",

  "assets/js/main.js",
  "assets/js/config.js",
  "assets/js/core/data.js",
  "assets/js/core/dom.js",
  "assets/js/core/format.js",
  "assets/js/core/photos.js",
  "assets/js/core/prefs.js",
  "assets/js/core/store.js",
  "assets/js/domain/agenda.js",
  "assets/js/domain/catalogue.js",
  "assets/js/domain/chantiers.js",
  "assets/js/domain/clients.js",
  "assets/js/domain/contrats.js",
  "assets/js/domain/documents.js",
  "assets/js/domain/dossier.js",
  "assets/js/domain/mentions.js",
  "assets/js/domain/numerotation.js",
  "assets/js/domain/stats.js",
  "assets/js/ui/accueil.js",
  "assets/js/ui/agenda.js",
  "assets/js/ui/catalogue.js",
  "assets/js/ui/chantiers.js",
  "assets/js/ui/champs.js",
  "assets/js/ui/chiffres.js",
  "assets/js/ui/clients.js",
  "assets/js/ui/contrats.js",
  "assets/js/ui/documents.js",
  "assets/js/ui/icones.js",
  "assets/js/ui/impression.js",
  "assets/js/ui/interventions.js",
  "assets/js/ui/parts.js",
  "assets/js/ui/photos.js",
  "assets/js/ui/reglages.js",
  "assets/js/ui/sidebar.js",
  "assets/js/ui/theme.js",

  "data/reference.json",
  "data/tva.json",
  "data/mentions.json",
  "data/checklist.json",
  "data/catalogue.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_COQUE)
      .then((cache) => cache.addAll(COQUE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(cles.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/data/")) {
    event.respondWith(reseauDAbord(requete));
    return;
  }
  event.respondWith(cacheDAbord(requete));
});

/** Le reseau, et le cache seulement s'il echoue. Pour les donnees de reference. */
async function reseauDAbord(requete) {
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) {
      const cache = await caches.open(CACHE_DATA);
      cache.put(requete, reponse.clone());
    }
    return reponse;
  } catch {
    const cache = await caches.match(requete);
    if (cache) return cache;
    throw new Error("hors ligne, et aucune donnée de référence en cache");
  }
}

/** Le cache tout de suite, le reseau en arriere-plan. Pour la coquille. */
async function cacheDAbord(requete) {
  const cache = await caches.match(requete);
  const reseau = fetch(requete)
    .then((reponse) => {
      if (reponse.ok) {
        caches.open(CACHE_COQUE).then((c) => c.put(requete, reponse.clone()));
      }
      return reponse;
    })
    .catch(() => null);

  if (cache) return cache;

  const reponse = await reseau;
  if (reponse) return reponse;

  // Une navigation hors ligne vers une adresse inconnue retombe sur la page
  // d'accueil : l'application est une page unique, elle saura se retrouver.
  if (requete.mode === "navigate") {
    const accueil = await caches.match("index.html");
    if (accueil) return accueil;
  }
  return new Response("Hors ligne.", { status: 503, statusText: "Hors ligne" });
}
