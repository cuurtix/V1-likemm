/* =============================================================================
   LIKEMM — configuration
   =============================================================================
   Tout ce qui est propre a l'environnement passe par ici. Aucune valeur n'est
   ecrite en dur ailleurs dans le code.

   RAPPEL DE SECURITE (§45 du cahier des charges) : seules les variables
   prefixees VITE_ sont incluses dans le bundle envoye au navigateur. Elles sont
   donc PUBLIQUES. La cle `anon` de Supabase est concue pour cela : c'est la RLS
   qui protege les donnees, pas le secret de la cle. La cle `service_role`, elle,
   n'a RIEN a faire ici — et le script `npm run audit:mock` echoue si elle
   apparait quelque part dans le projet.
   ========================================================================== */

const env = import.meta.env;

const missing = [];

function required(name, value) {
  const v = value == null ? "" : String(value).trim();
  if (v === "") {
    missing.push(name);
    return "";
  }
  return v;
}

export const SUPABASE_URL = required("VITE_SUPABASE_URL", env.VITE_SUPABASE_URL);
export const SUPABASE_ANON_KEY = required("VITE_SUPABASE_ANON_KEY", env.VITE_SUPABASE_ANON_KEY);

/**
 * Message d'erreur de configuration, ou null.
 * On ne leve PAS d'exception au chargement du module : cela produirait un ecran
 * blanc sans explication. main.jsx affiche un message lisible a la place.
 */
export const CONFIG_ERROR = missing.length
  ? `Variable${missing.length > 1 ? "s" : ""} d'environnement manquante${missing.length > 1 ? "s" : ""} : ${missing.join(", ")}.`
  : null;

/** Origine publique du site, utilisee pour construire les liens de partage. */
export const SITE_URL = (env.VITE_SITE_URL || window.location.origin).replace(/\/+$/, "");

/** Adresse de contact. Unique coordonnee connue du service (§47 / §48). */
export const CONTACT_EMAIL = env.VITE_CONTACT_EMAIL || "help@likemm.site";

/**
 * Version des documents juridiques. Elle est enregistree avec chaque
 * consentement et chaque acceptation des CGU (§39), afin de savoir quelle
 * version s'appliquait au moment de l'accord. A incrementer a chaque
 * modification de fond des documents.
 */
export const POLICY_VERSION = env.VITE_POLICY_VERSION || "2026-09-12";

/**
 * Mesure d'audience et pixels publicitaires.
 * Vides par defaut : rien n'est charge tant que ces identifiants ne sont pas
 * renseignes, et meme renseignes, le chargement reste conditionne au
 * consentement de l'utilisateur et a son age (§18 / §37).
 */
export const GA_MEASUREMENT_ID = env.VITE_GA_MEASUREMENT_ID || "";
export const META_PIXEL_ID = env.VITE_META_PIXEL_ID || "";
export const TIKTOK_PIXEL_ID = env.VITE_TIKTOK_PIXEL_ID || "";

export const APP_NAME = "Likemm";
export const APP_VERSION = "1.0.0";

/** Age minimum d'acces au service (§19 / §38). */
export const MIN_AGE = 13;

/** Contraintes d'upload, alignees sur les limites fixees cote bucket Supabase. */
export const IMAGE_LIMITS = {
  avatar: { maxBytes: 3 * 1024 * 1024, maxDimension: 800 },
  cover: { maxBytes: 6 * 1024 * 1024, maxDimension: 1600 },
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"],
};

/** Avatar par defaut. Aucune image n'est "inventee" pour un profil sans photo. */
export const DEFAULT_AVATAR = "/assets/default-avatar.png";
