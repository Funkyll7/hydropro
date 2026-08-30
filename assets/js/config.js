/**
 * config.js — les quelques reglages qu'on a envie de changer sans lire le code.
 */

export const CONFIG = {
  /** Le nom affiche. A changer aussi dans <title> et dans le manifeste. */
  nom: "Clé de 12",
  baseline: "Gestion plombier-chauffagiste",

  /**
   * Cles localStorage. Changer de version repart d'un dossier vierge.
   *
   * TOUT est ici, et rien n'est ailleurs : ce fichier est la seule reponse a
   * la question « ou sont mes donnees ». Elles ne quittent jamais ce
   * navigateur — voir la note de sauvegarde du README.
   */
  storage: {
    /** Le dossier complet : entreprise, clients, rendez-vous, documents. */
    dossier: "cle12.dossier.v1",
    /** Theme, taille du texte, onglet ouvert : ce qui decrit l'APPAREIL. */
    prefs: "cle12.prefs.v1",
  },

  /**
   * Rappel de sauvegarde, en JOURS.
   *
   * Le dossier vit dans le localStorage de CE navigateur, et le localStorage
   * s'efface : un nettoyage d'historique, un mode prive, un telephone change.
   * Passe ce delai sans export, un bandeau le rappelle. 0 pour ne plus le voir.
   */
  rappelSauvegardeJours: 14,

  /**
   * Cache hors ligne (sw.js). Interrupteur de secours : le passer a `false` ne
   * se contente pas de ne plus enregistrer le service worker, il DESINSCRIT
   * celui qui serait deja en place et vide ses caches.
   */
  offline: true,

  /** Journee de travail affichee dans l'agenda, en heures pleines. */
  journee: { debut: 8, fin: 19 },

  /** Duree par defaut d'un rendez-vous, en minutes, si le type n'en donne pas. */
  dureeRdvMin: 60,

  /** Au-dela, la case du mois affiche « +N » au lieu d'empiler les pastilles. */
  evtsParJour: 3,

  /** Delai de paiement propose sur une facture neuve, en jours. */
  delaiPaiementJours: 30,

  /** Duree de validite proposee sur un devis neuf, en jours. */
  validiteDevisJours: 30,

  /**
   * Seuils du tableau de bord.
   *   relanceDevisJours : un devis envoye sans reponse depuis N jours remonte
   *   echeanceContratJours : un contrat d'entretien du sur les N prochains jours
   */
  seuils: {
    relanceDevisJours: 10,
    echeanceContratJours: 45,
    expirationDevisJours: 7,
  },

  /** Nombre maximal d'annulations gardees en memoire. */
  undoMax: 25,

  /** Liens vers les sources officielles, montres dans l'application. */
  liens: {
    tvaTravaux: "https://www.economie.gouv.fr/particuliers/tva-travaux-logement",
    mentionsFacture: "https://entreprendre.service-public.fr/vosdroits/F23208",
    devisObligatoire: "https://entreprendre.service-public.fr/vosdroits/F31144",
    decennale: "https://entreprendre.service-public.fr/vosdroits/F22308",
    entretienChaudiere: "https://www.service-public.fr/particuliers/vosdroits/F31653",
    factureElectronique: "https://www.impots.gouv.fr/facturation-electronique-entre-entreprises",
    delaisPaiement: "https://entreprendre.service-public.fr/vosdroits/F23211",
  },
};
