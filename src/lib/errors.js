/* =============================================================================
   LIKEMM — traduction des erreurs (§14 et §26 du cahier des charges)
   =============================================================================
   « Chaque operation backend doit avoir une gestion d'erreur » et « Ne jamais
   afficher une fausse reussite lorsqu'une operation reelle a echoue. »

   Les fonctions RPC levent leurs exceptions avec un HINT stable (ALREADY_LIKED,
   RATE_LIMITED, ACCOUNT_SUSPENDED...). C'est ce code machine qui est traduit
   ici, et non le message brut de PostgreSQL : l'utilisateur ne doit jamais voir
   « duplicate key value violates unique constraint ».
   ========================================================================== */

const BY_HINT = {
  AUTH_REQUIRED: "Vous devez etre connecte pour faire cela.",
  SETUP_REQUIRED: "Terminez la creation de votre compte pour continuer.",
  PROFILE_MISSING: "Votre profil est introuvable. Reconnectez-vous.",
  ACCOUNT_SUSPENDED:
    "Votre compte est temporairement suspendu. Vous pouvez contester cette decision.",
  ACCOUNT_BANNED: "Votre compte est banni. Vous pouvez contester cette decision.",
  ACCOUNT_DELETED: "Ce compte a ete supprime.",
  FORBIDDEN: "Vous n'avez pas les droits necessaires pour cette action.",

  USERNAME_INVALID: "Ce nom d'utilisateur n'est pas autorise.",
  USERNAME_TAKEN: "Ce nom d'utilisateur est deja pris.",
  USERNAME_CHANGE_LIMIT:
    "Vous avez deja change de nom d'utilisateur deux fois ce mois-ci. Reessayez plus tard.",
  BIRTHDATE_INVALID: "Cette date de naissance n'est pas valide.",
  AGE_TOO_YOUNG: "Likemm est accessible a partir de 13 ans.",
  ALREADY_SETUP: "Votre compte est deja finalise.",

  ALREADY_LIKED: "Vous avez deja like ce profil.",
  NOT_LIKED: "Vous n'avez pas like ce profil.",
  TARGET_NOT_FOUND: "Ce profil n'existe pas.",
  TARGET_UNAVAILABLE: "Ce profil n'est pas disponible.",
  TARGET_PRIVATE: "Ce profil est prive.",
  TARGET_MISSING: "Profil introuvable.",
  TARGET_SELF: "Cette action ne peut pas viser votre propre compte.",
  TARGET_PRIVILEGED: "Vous ne pouvez pas appliquer cette action a ce compte.",
  BLOCKED: "Cette interaction n'est pas possible.",

  RATE_LIMITED: "Trop de tentatives. Merci de patienter avant de reessayer.",
  LINK_LIMIT: "Vous avez atteint la limite de liens prives actifs. Revoquez-en un d'abord.",

  REPORT_DUPLICATE: "Vous avez deja un signalement en cours pour ce profil et ce motif.",
  APPEAL_EXISTS: "Vous avez deja conteste cette decision.",
  NOT_APPEALABLE: "Cette decision n'est pas contestable.",
  SANCTION_NOT_FOUND: "Sanction introuvable.",
  SANCTION_REVOKED: "Cette sanction a deja ete levee.",
  MESSAGE_TOO_SHORT: "Expliquez votre demande en quelques phrases.",
  REASON_REQUIRED: "Une raison ecrite est obligatoire.",
  DURATION_REQUIRED: "Indiquez une duree en jours.",
  REPORT_NOT_FOUND: "Signalement introuvable.",
  APPEAL_NOT_FOUND: "Contestation introuvable.",
  CONFIRMATION_INVALID: "Confirmation invalide.",
};

/** Messages de Supabase Auth (§26). */
const AUTH_PATTERNS = [
  [/invalid login credentials/i, "Email ou mot de passe incorrect."],
  [/email not confirmed/i, "Confirmez votre adresse email avant de vous connecter."],
  [/user already registered/i, "Un compte existe deja avec cette adresse email."],
  [/password should be at least/i, "Le mot de passe est trop court."],
  [/for security purposes.*(\d+) seconds/i, "Trop de tentatives. Patientez quelques instants."],
  [/email rate limit exceeded/i, "Trop d'emails envoyes. Reessayez dans quelques minutes."],
  [/token has expired|invalid token/i, "Ce lien a expire. Demandez-en un nouveau."],
  [/same password/i, "Le nouveau mot de passe doit etre different de l'ancien."],
  [/session.*(missing|expired)/i, "Votre session a expire. Reconnectez-vous."],
  [
    /database error saving new user/i,
    "La creation du compte a echoue. Verifiez le nom d'utilisateur et la date de naissance.",
  ],
];

/** Erreurs de stockage (§8 / §26). */
const STORAGE_PATTERNS = [
  [/payload too large|exceeded the maximum allowed size/i, "Cette image est trop lourde."],
  [/mime type.*not supported|invalid_mime_type/i, "Format d'image non accepte (JPEG, PNG ou WebP)."],
  [/row-level security|not authorized|permission denied/i, "Vous n'avez pas le droit de faire cela."],
];

/**
 * Traduit n'importe quelle erreur (RPC, Auth, Storage, reseau) en un message
 * affichable. Ne renvoie jamais une chaine vide : sans message clair,
 * l'utilisateur ne saurait pas ce qui s'est passe.
 */
export function mapError(error, fallback = "Une erreur est survenue. Reessayez.") {
  if (!error) return fallback;

  // 1. Code machine renvoye par nos fonctions RPC.
  const hint = error.hint || error?.details?.hint;
  if (hint && BY_HINT[hint]) return BY_HINT[hint];

  const message = String(error.message || error.error_description || error.error || "");

  // 2. Reseau / service injoignable (§14 : « Supabase est indisponible »).
  if (
    error.name === "TypeError" ||
    /failed to fetch|network ?error|load failed|fetch failed/i.test(message)
  ) {
    return "Connexion impossible. Verifiez votre reseau et reessayez.";
  }
  if (error.status === 503 || error.status === 502 || error.status === 504) {
    return "Le service est momentanement indisponible. Reessayez dans un instant.";
  }
  if (error.status === 429 || error.code === "54000") {
    return BY_HINT.RATE_LIMITED;
  }

  for (const [pattern, text] of AUTH_PATTERNS) if (pattern.test(message)) return text;
  for (const [pattern, text] of STORAGE_PATTERNS) if (pattern.test(message)) return text;

  // 3. Codes PostgreSQL generiques, traduits sans jargon.
  switch (error.code) {
    case "23505":
      return "Cette valeur est deja utilisee.";
    case "23503":
      return "Cet element n'existe pas ou plus.";
    case "22023":
      return message.startsWith("Nom d'utilisateur") ? message : "Donnees invalides.";
    case "42501":
      return "Vous n'avez pas le droit de faire cela.";
    case "PGRST301":
      return "Votre session a expire. Reconnectez-vous.";
    default:
      break;
  }

  // 4. Nos RPC produisent deja des messages en francais destines a l'utilisateur.
  if (/^[A-ZÀ-Ý]/.test(message) && message.length < 200 && !message.includes("relation ")) {
    return message;
  }

  return fallback;
}

/** Vrai si l'erreur signifie « il faut etre connecte ». */
export function isAuthError(error) {
  const hint = error?.hint;
  return (
    hint === "AUTH_REQUIRED" ||
    error?.code === "PGRST301" ||
    /jwt|session.*(missing|expired)/i.test(String(error?.message || ""))
  );
}

/** Vrai si le compte est bloque par une mesure de moderation. */
export function isSanctionError(error) {
  return ["ACCOUNT_SUSPENDED", "ACCOUNT_BANNED", "ACCOUNT_DELETED"].includes(error?.hint);
}
