/* =============================================================================
   LIKEMM — shareService (§16 / §27 / §49 et §4-§7 des ameliorations)
   =============================================================================
   Le partage est une fonctionnalite CENTRALE du produit, pas un bouton
   secondaire : c'est lui qui alimente la boucle
   profil -> partage -> visiteur -> like -> inscription -> nouveau partage.

   Honnetete technique (§16) : « Ne jamais promettre une integration native si
   la plateforme ne permet pas cette integration. »
     * TikTok, Instagram et Snapchat n'offrent PAS d'API web permettant de
       publier depuis un site. Sur mobile, le partage natif du telephone
       (Web Share API) propose ces applications lorsqu'elles sont installees :
       c'est le seul chemin reel, et c'est celui qu'on utilise.
     * Discord, X et WhatsApp acceptent un lien pre-rempli : ces boutons-la
       ouvrent bien la plateforme concernee.
     * La copie du lien fonctionne partout, toujours.
   ========================================================================== */

import { SITE_URL, APP_NAME } from "../lib/config.js";
import { analyticsService, EVENTS } from "./analyticsService.js";

/** URL publique d'un profil : https://likemm.site/@alex */
export function profileUrl(username, { ref = null } = {}) {
  const base = `${SITE_URL}/@${username}`;
  // §27 : « Permettre d'identifier la source de partage avec des parametres
  // appropries, tout en respectant la confidentialite. » Le parametre ne
  // contient que le username de la personne qui partage — une donnee deja
  // publique — et rien d'autre.
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

/** Lien d'acces a un profil prive (§32). */
export function privateProfileUrl(username, token) {
  return `${SITE_URL}/@${username}?k=${encodeURIComponent(token)}`;
}

/** Texte de partage du profil. */
function profileMessage(username) {
  return `Mon profil ${APP_NAME} : @${username}`;
}

/**
 * Texte de partage du classement (§6 des ameliorations).
 * Le nombre de likes et le rang viennent des VRAIES donnees : si le rang est
 * inconnu, on ne l'invente pas, on partage simplement le profil.
 */
export function rankMessage({ username, rank, likes, mode = "general" }) {
  if (rank == null) return profileMessage(username);
  if (mode === "24h") return `Je suis #${rank} aujourd'hui sur ${APP_NAME}.`;
  const likesPart =
    typeof likes === "number" ? ` avec ${likes.toLocaleString("fr-FR")} likes` : "";
  return `Je suis actuellement #${rank} sur ${APP_NAME}${likesPart}.`;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* on tente la methode de repli ci-dessous */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export const shareService = {
  profileUrl,
  privateProfileUrl,
  rankMessage,

  /** Le partage natif du telephone est-il reellement disponible ? */
  canShareNatively() {
    return typeof navigator !== "undefined" && typeof navigator.share === "function";
  },

  /**
   * Partage natif. Renvoie 'shared', 'cancelled' ou 'unavailable' : l'appelant
   * ne doit afficher une confirmation que pour 'shared' (§26).
   */
  async shareNative({ title, text, url, context = "profile" }) {
    if (!this.canShareNatively()) return "unavailable";
    analyticsService.trackEvent(EVENTS.SHARE_CLICKED, { channel: "native", source: context });
    try {
      await navigator.share({ title, text, url });
      analyticsService.trackEvent(EVENTS.SHARE_COMPLETED, { channel: "native", source: context });
      return "shared";
    } catch (error) {
      // AbortError = l'utilisateur a ferme la feuille de partage. Ce n'est pas
      // une erreur, et surtout pas un partage reussi.
      if (error?.name === "AbortError") return "cancelled";
      return "unavailable";
    }
  },

  /** Copie du lien. Renvoie un booleen honnete : false si la copie a echoue. */
  async copyLink(url, { context = "profile" } = {}) {
    const ok = await copyToClipboard(url);
    if (ok) {
      analyticsService.trackEvent(EVENTS.PROFILE_LINK_COPIED, { source: context });
      analyticsService.trackEvent(EVENTS.SHARE_COMPLETED, { channel: "copy", source: context });
    }
    return ok;
  },

  /**
   * Plateformes acceptant reellement un lien pre-rempli.
   * TikTok, Instagram et Snapchat n'y figurent pas : leur seule voie est le
   * partage natif ci-dessus.
   */
  webIntents({ text, url }) {
    const t = encodeURIComponent(text);
    const u = encodeURIComponent(url);
    return [
      { key: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
      { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
      { key: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
      { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
      { key: "email", label: "Email", href: `mailto:?subject=${t}&body=${t}%20${u}` },
    ];
  },

  openIntent(intent, { context = "profile" } = {}) {
    analyticsService.trackEvent(EVENTS.SHARE_CLICKED, { channel: intent.key, source: context });
    window.open(intent.href, "_blank", "noopener,noreferrer");
    // On ne sait PAS si la personne a reellement publie : on n'enregistre donc
    // pas share_completed ici. Mesurer une intention plutot qu'un faux succes.
  },

  profileMessage,
};
