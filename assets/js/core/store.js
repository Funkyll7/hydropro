/**
 * store.js — etat applicatif minimaliste.
 *
 * Un seul objet d'etat, des abonnes notifies apres chaque `set`. Les
 * notifications sont groupees dans une microtache : dix `set` d'affilee ne
 * declenchent qu'un seul rendu.
 */

export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  let pending = null;
  let changed = new Set();

  function flush() {
    pending = null;
    const keys = changed;
    changed = new Set();
    for (const listener of [...listeners]) listener(state, keys);
  }

  return {
    get state() {
      return state;
    },

    /** Fusionne un patch (ou le resultat d'une fonction) dans l'etat. */
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      let touched = false;
      for (const [key, value] of Object.entries(next)) {
        if (!Object.is(state[key], value)) {
          changed.add(key);
          touched = true;
        }
      }
      if (!touched) return;
      state = { ...state, ...next };
      if (!pending) pending = Promise.resolve().then(flush);
    },

    /** S'abonne aux changements. Renvoie la fonction de desabonnement. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Retarde un appel tant qu'il est reappele. Utile sur la saisie au clavier. */
export function debounce(fn, delay = 200) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Un identifiant court, unique dans un dossier.
 *
 * Il n'a pas besoin d'etre universellement unique : il ne sert qu'a relier
 * deux objets du MEME fichier. Le prefixe rend les exports lisibles a l'oeil —
 * « cli-k3f9a2 » se reconnait sans avoir a chercher dans quelle liste il est.
 */
export function id(prefixe = "x") {
  return `${prefixe}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}
