/* =============================================================================
   LIKEMM — moderationService (§22 / §23 / §25 / §29 / §32 / §45 / §50)
   =============================================================================
   Ce service n'accorde aucun droit : il ne fait qu'appeler des fonctions RPC
   qui verifient le role COTE BASE (app.require_role). Un utilisateur ordinaire
   qui appellerait ces methodes recevrait une erreur « Action reservee a
   l'equipe de moderation ». L'interface /admin n'est qu'un confort : elle n'est
   jamais ce qui protege.

   Chaque action exige une raison ecrite et est journalisee dans admin_actions.
   ========================================================================== */

import { rpc } from "../lib/supabase.js";

export const SANCTION_TYPES = [
  { value: "warning", label: "Avertissement", needsDuration: false },
  { value: "limit", label: "Limitation temporaire", needsDuration: true },
  { value: "suspension", label: "Suspension", needsDuration: true },
  { value: "ban", label: "Bannissement definitif", needsDuration: false, adminOnly: true },
];

export const moderationService = {
  // --- Lecture --------------------------------------------------------------
  listReports(status = null, limit = 50, offset = 0) {
    return rpc("mod_list_reports", { p_status: status, p_limit: limit, p_offset: offset });
  },
  listAppeals(status = null, limit = 50, offset = 0) {
    return rpc("mod_list_appeals", { p_status: status, p_limit: limit, p_offset: offset });
  },
  listFraudSignals(onlyOpen = true, limit = 50, offset = 0) {
    return rpc("mod_list_fraud_signals", { p_only_open: onlyOpen, p_limit: limit, p_offset: offset });
  },
  listSanctions(activeOnly = false, limit = 50, offset = 0) {
    return rpc("mod_list_sanctions", { p_active_only: activeOnly, p_limit: limit, p_offset: offset });
  },
  listAdminActions(limit = 50, offset = 0) {
    return rpc("mod_list_admin_actions", { p_limit: limit, p_offset: offset });
  },
  userDetail(username) {
    return rpc("mod_user_detail", { p_username: username });
  },
  stats(days = 30) {
    return rpc("mod_stats", { p_days: days });
  },

  // --- Sanctions ------------------------------------------------------------
  sanction({ username, type, reason, ruleViolated = null, durationDays = null, reportId = null }) {
    return rpc("mod_sanction_user", {
      p_username: username,
      p_type: type,
      p_reason: reason,
      p_rule_violated: ruleViolated,
      p_duration_days: durationDays,
      p_report_id: reportId,
    });
  },
  liftSanction(sanctionId, reason) {
    return rpc("mod_lift_sanction", { p_sanction_id: sanctionId, p_reason: reason });
  },

  // --- Contenu --------------------------------------------------------------
  setProfileHidden(username, hidden, reason) {
    return rpc("mod_set_profile_hidden", { p_username: username, p_hidden: hidden, p_reason: reason });
  },
  removeImage(username, kind, reason) {
    return rpc("mod_remove_profile_image", { p_username: username, p_kind: kind, p_reason: reason });
  },
  clearBio(username, reason) {
    return rpc("mod_clear_bio", { p_username: username, p_reason: reason });
  },
  /** §22 / §30 : retrait de likes frauduleux. `sinceHours` borne la periode. */
  removeFraudulentLikes({ username, direction = "received", sinceHours = 24, reason }) {
    return rpc("mod_remove_fraudulent_likes", {
      p_username: username,
      p_direction: direction,
      p_since: `${Math.max(1, Number(sinceHours) || 24)} hours`,
      p_reason: reason,
    });
  },

  // --- Signalements et contestations ---------------------------------------
  resolveReport(reportId, status, note) {
    return rpc("mod_resolve_report", { p_report_id: reportId, p_status: status, p_note: note });
  },
  decideAppeal(appealId, status, decision) {
    return rpc("mod_decide_appeal", { p_appeal_id: appealId, p_status: status, p_decision: decision });
  },
  reviewFraudSignal(signalId, outcome, note = null) {
    return rpc("mod_review_fraud_signal", { p_signal_id: signalId, p_outcome: outcome, p_note: note });
  },

  // --- Roles (proprietaire uniquement) --------------------------------------
  setRole(username, role, reason) {
    return rpc("mod_set_role", { p_username: username, p_role: role, p_reason: reason });
  },

  // --- Maintenance ----------------------------------------------------------
  recomputeLikeCounts() {
    return rpc("recompute_like_counts");
  },
};

/** Hierarchie des roles, identique a celle appliquee en base. */
export const ROLE_LEVEL = { user: 1, moderator: 2, admin: 3, owner: 4 };

export function hasRole(role, minimum) {
  return (ROLE_LEVEL[role] || 0) >= (ROLE_LEVEL[minimum] || 99);
}
