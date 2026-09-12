/* =============================================================================
   LIKEMM — metadonnees de page (§17 / §39 / §40)
   =============================================================================
   HONNETETE TECHNIQUE, a lire avant de modifier ce fichier.

   Likemm est une application monopage servie statiquement (voir le choix
   d'hebergement dans docs/DEPLOY.md). Les balises modifiees ici le sont APRES
   le chargement de JavaScript. Cela signifie :

     * Le titre, la description et le `noindex` fonctionnent pour les
       utilisateurs et pour les moteurs de recherche qui executent JavaScript.
     * Les previews de partage (og:image avec l'avatar de la personne) sur
       Discord, TikTok, X, Instagram ou Snapchat NE fonctionnent PAS par
       profil : ces robots lisent le HTML brut, sans executer JavaScript. Ils
       verront donc toujours la carte generique de Likemm definie dans
       index.html.

   Le cahier des charges demande explicitement de ne pas pretendre le
   contraire (§17 : « Ne pas pretendre qu'une preview dynamique fonctionne si le
   systeme actuel ne le permet pas »). docs/DEPLOY.md decrit les deux facons
   d'obtenir de vraies previews par profil le jour ou ce sera souhaite.
   ========================================================================== */

import { SITE_URL, APP_NAME } from "./config.js";

const DEFAULT_TITLE = `${APP_NAME} — le classement de popularite`;
const DEFAULT_DESCRIPTION =
  "Likemm classe les profils selon le nombre de likes reellement recus. " +
  "Creez votre profil, partagez-le, grimpez le classement.";

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!value) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    const [key, val] = selector.replace(/^meta\[|\]$/g, "").split("=");
    el.setAttribute(key, val.replace(/["']/g, ""));
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!href) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Applique les metadonnees d'une page.
 * @param {object} options
 * @param {string} [options.title]
 * @param {string} [options.description]
 * @param {string} [options.path]        chemin canonique (ex: "/@alex")
 * @param {boolean} [options.noindex]    exclut la page des moteurs (§39)
 */
export function setPageMeta({ title, description, path, noindex = false } = {}) {
  const fullTitle = title ? `${title} · ${APP_NAME}` : DEFAULT_TITLE;
  const desc = description || DEFAULT_DESCRIPTION;
  const url = path ? `${SITE_URL}${path}` : SITE_URL;

  document.title = fullTitle;
  setMeta('meta[name="description"]', "content", desc);
  setLink("canonical", url);

  // §39 : « Les profils prives doivent etre exclus des moteurs de recherche. »
  setMeta('meta[name="robots"]', "content", noindex ? "noindex, nofollow" : "index, follow");

  setMeta('meta[property="og:title"]', "content", fullTitle);
  setMeta('meta[property="og:description"]', "content", desc);
  setMeta('meta[property="og:url"]', "content", url);
  setMeta('meta[name="twitter:title"]', "content", fullTitle);
  setMeta('meta[name="twitter:description"]', "content", desc);
}

export function resetPageMeta() {
  setPageMeta({});
}
