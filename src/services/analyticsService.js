/* =============================================================================
   LIKEMM — analyticsService (§1 des ameliorations, §36)
   =============================================================================
   « Creer une fonction/service centralise de type trackEvent(eventName,
   metadata). Ne pas disperser le tracking directement dans toute
   l'application. »

   Tout passe donc par `trackEvent`. Les regles, dans l'ordre :

     1. Le nom doit exister dans EVENTS ci-dessous ET dans la table
        analytics_event_types cote base : un nom inconnu est ignore des deux
        cotes. Impossible d'inventer un evenement.
     2. Sans consentement analytics, rien n'est envoye — on n'appelle meme pas
        le reseau.
     3. Les metadonnees passent par une liste blanche cote base : une donnee
        personnelle glissee par erreur est retiree avant enregistrement.
     4. Le tracking n'attend jamais : une erreur de mesure ne doit pas
        degrader l'experience (§ objectif general : « Le tracking doit
        fonctionner en arriere-plan et ne pas degrader l'experience »).

   A noter : les metriques structurelles (inscrits, likes, partages, activation,
   retention) sont calculees a partir des tables reelles par public.mod_stats().
   Elles ne dependent donc pas de ces evenements.
   ========================================================================== */

import { rpc } from "../lib/supabase.js";
import { consentService } from "./consentService.js";
import { GA_MEASUREMENT_ID } from "../lib/config.js";

/** Plan de mesure. Identique a la table analytics_event_types. */
export const EVENTS = Object.freeze({
  SESSION_STARTED: "session_started",
  SESSION_ENDED: "session_ended",
  USER_SIGNED_UP: "user_signed_up",
  LOGIN: "login",
  LOGOUT: "logout",
  PROFILE_COMPLETED: "profile_completed",
  PROFILE_VIEWED: "profile_viewed",
  SHARED_PROFILE_VIEWED: "shared_profile_viewed",
  LEADERBOARD_VIEWED: "leaderboard_viewed",
  LEADERBOARD_24H_VIEWED: "leaderboard_24h_viewed",
  OWN_RANK_VIEWED: "own_rank_viewed",
  RANK_PROGRESS_VIEWED: "rank_progress_viewed",
  NEIGHBOR_PROFILE_VIEWED: "neighbor_profile_viewed",
  LIKE_GIVEN: "like_given",
  LIKE_REMOVED: "like_removed",
  SEARCH_PERFORMED: "search_performed",
  SHARE_CLICKED: "share_clicked",
  SHARE_COMPLETED: "share_completed",
  PROFILE_LINK_COPIED: "profile_link_copied",
  SIGNUP_FROM_SHARE: "signup_from_share",
  LIKE_FROM_SHARED_PROFILE: "like_from_shared_profile",
  NOTIFICATION_OPENED: "notification_opened",
  REPORT_CREATED: "report_created",
  APPEAL_CREATED: "appeal_created",
  ACCOUNT_DELETED: "account_deleted",
  DATA_EXPORT_REQUESTED: "data_export_requested",
  CONSENT_UPDATED: "consent_updated",
});

const KNOWN = new Set(Object.values(EVENTS));

/** Identifiants techniques, aleatoires, sans aucune donnee personnelle. */
function randomId() {
  const bytes = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getAnonId() {
  try {
    let id = window.localStorage.getItem("likemm.anon_id");
    if (!id) {
      id = randomId();
      window.localStorage.setItem("likemm.anon_id", id);
    }
    return id;
  } catch {
    return null;
  }
}

let sessionId = null;
function getSessionId() {
  if (sessionId) return sessionId;
  try {
    sessionId = window.sessionStorage.getItem("likemm.session_id");
    if (!sessionId) {
      sessionId = randomId();
      window.sessionStorage.setItem("likemm.session_id", sessionId);
    }
  } catch {
    sessionId = randomId();
  }
  return sessionId;
}

export const analyticsService = {
  /**
   * Point d'entree unique de toute la mesure.
   * @param {string} eventName  une valeur de EVENTS
   * @param {object} [metadata] uniquement des cles de la liste blanche
   */
  trackEvent(eventName, metadata = {}) {
    if (!KNOWN.has(eventName)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[analytics] evenement inconnu : « ${eventName} ». ` +
            `Ajoutez-le a EVENTS et a la table analytics_event_types.`,
        );
      }
      return;
    }

    // §12 / §37 : sans consentement, aucune mesure — pas meme un appel reseau.
    if (!consentService.isGranted("analytics")) return;

    // Mesure d'audience tierce, si et seulement si elle est configuree.
    if (GA_MEASUREMENT_ID && typeof window.gtag === "function") {
      try {
        window.gtag("event", eventName, metadata);
      } catch {
        /* une erreur de mesure ne doit jamais remonter a l'utilisateur */
      }
    }

    // Mesure interne. Volontairement non attendue (fire-and-forget).
    rpc("track_event", {
      p_event_name: eventName,
      p_metadata: metadata || {},
      p_anon_id: getAnonId(),
      p_session_id: getSessionId(),
    }).catch(() => {
      /* le tracking ne doit jamais degrader l'experience */
    });
  },

  /** Ouverture de session : un seul evenement par session de navigation. */
  trackSessionStart() {
    try {
      if (window.sessionStorage.getItem("likemm.session_tracked")) return;
      window.sessionStorage.setItem("likemm.session_tracked", "1");
    } catch {
      /* ignore */
    }
    this.trackEvent(EVENTS.SESSION_STARTED);
  },

  getAnonId,
  getSessionId,
};
