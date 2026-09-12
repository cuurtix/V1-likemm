/* =============================================================================
   LIKEMM — provenance des nouveaux utilisateurs (§3 des ameliorations)
   =============================================================================
   Objectif : « savoir quels canaux apportent reellement des utilisateurs ».

   Ce qui est capte : uniquement des PARAMETRES D'URL que la personne nous
   transmet elle-meme en cliquant sur un lien (?ref=alex, ?utm_source=tiktok).
   Ce qui n'est PAS capte : ni le referrer complet, ni l'empreinte du
   navigateur, ni aucune donnee d'un tiers (§13 : ne pas collecter inutilement).

   La valeur est rangee dans sessionStorage jusqu'a l'inscription, puis envoyee
   une seule fois avec la creation du compte. Elle n'est jamais republiee.
   ========================================================================== */

const KEY = "likemm.acquisition";

const CHANNELS = ["share", "social", "campaign", "search", "direct"];

const SOCIAL_HOSTS = [
  "tiktok.com", "instagram.com", "snapchat.com", "discord.com", "discord.gg",
  "youtube.com", "youtu.be", "x.com", "twitter.com", "facebook.com", "reddit.com",
  "t.co", "linkedin.com", "pinterest.com", "twitch.tv", "threads.net",
];
const SEARCH_HOSTS = ["google.", "bing.com", "duckduckgo.com", "ecosia.org", "qwant.com", "yahoo."];

function safeSession(action, fallback = null) {
  try {
    return action(window.sessionStorage);
  } catch {
    // Navigation privee, stockage bloque : la provenance est simplement inconnue.
    return fallback;
  }
}

/** Detecte la provenance a partir de l'URL courante et du referrer. */
function detect() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");
  const utmCampaign = params.get("utm_campaign");

  const utm = {};
  if (utmSource) utm.source = utmSource.slice(0, 64);
  if (utmMedium) utm.medium = utmMedium.slice(0, 64);
  if (utmCampaign) utm.campaign = utmCampaign.slice(0, 64);

  // 1. Lien partage par un utilisateur : ?ref=<username>
  if (ref) {
    return { channel: "share", ref: ref.replace(/[^a-z0-9_]/gi, "").slice(0, 64), utm };
  }

  // 2. Campagne identifiee par des parametres UTM.
  if (utmSource || utmCampaign) {
    const source = (utmSource || "").toLowerCase();
    const channel = SOCIAL_HOSTS.some((h) => source.includes(h.split(".")[0]))
      ? "social"
      : "campaign";
    return { channel, ref: null, utm };
  }

  // 3. Referrer : on ne conserve QUE la categorie deduite, jamais l'URL.
  const referrer = document.referrer || "";
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase();
      if (host && host !== window.location.hostname) {
        if (SOCIAL_HOSTS.some((h) => host.endsWith(h) || host === h)) {
          return { channel: "social", ref: null, utm };
        }
        if (SEARCH_HOSTS.some((h) => host.includes(h))) {
          return { channel: "search", ref: null, utm };
        }
        return { channel: "campaign", ref: null, utm };
      }
    } catch {
      /* referrer illisible : on retombe sur "direct" */
    }
  }

  return { channel: "direct", ref: null, utm };
}

/**
 * A appeler une fois au demarrage de l'application. La premiere detection de la
 * session fait foi : un utilisateur arrive par un lien partage puis navigue
 * reste attribue au partage.
 */
export function captureAcquisition() {
  const existing = safeSession((s) => s.getItem(KEY));
  if (existing) return JSON.parse(existing);

  const value = detect();
  safeSession((s) => s.setItem(KEY, JSON.stringify(value)));
  return value;
}

export function getAcquisition() {
  const raw = safeSession((s) => s.getItem(KEY));
  if (!raw) return { channel: "direct", ref: null, utm: {} };
  try {
    const parsed = JSON.parse(raw);
    return {
      channel: CHANNELS.includes(parsed.channel) ? parsed.channel : "direct",
      ref: parsed.ref || null,
      utm: parsed.utm && typeof parsed.utm === "object" ? parsed.utm : {},
    };
  } catch {
    return { channel: "direct", ref: null, utm: {} };
  }
}

/** Vrai si l'utilisateur est arrive par le lien partage d'un autre profil. */
export function cameFromShare() {
  return getAcquisition().channel === "share";
}

/** Metadonnees envoyees a l'inscription (lues par le trigger handle_new_user). */
export function acquisitionSignupMeta() {
  const a = getAcquisition();
  return {
    acquisition_channel: a.channel,
    acquisition_ref: a.ref,
    acquisition_utm: a.utm,
  };
}
