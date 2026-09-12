/* =============================================================================
   LIKEMM — reportService (§21 / §24 / §31 / §33)
   =============================================================================
   Signaler un profil et contester une sanction ecrivent de VRAIES lignes en
   base. §33 : « Ne pas faire semblant qu'un appel a ete envoye si aucune
   donnee n'est reellement enregistree. »
   ========================================================================== */

import { supabase, rpc } from "../lib/supabase.js";

/** Motifs proposes a l'utilisateur, alignes sur l'enum report_category. */
export const REPORT_CATEGORIES = [
  { value: "photo", label: "Photo de profil ou couverture" },
  { value: "profile", label: "Profil" },
  { value: "username", label: "Nom d'utilisateur" },
  { value: "bio", label: "Bio" },
  { value: "behavior", label: "Comportement" },
  { value: "impersonation", label: "Usurpation d'identite" },
  { value: "illegal_content", label: "Contenu illegal" },
  { value: "minor_safety", label: "Protection d'un mineur" },
  { value: "spam", label: "Spam ou publicite non autorisee" },
  { value: "fraud", label: "Manipulation du classement, faux comptes, achat de likes" },
  { value: "other", label: "Autre" },
];

export const reportService = {
  async createReport({ targetUsername, category, description }) {
    return rpc("create_report", {
      p_target_username: targetUsername,
      p_category: category,
      p_description: description || null,
    });
  },

  /** Mes propres signalements. La RLS interdit de voir ceux des autres (§34). */
  async getMyReports() {
    const { data, error } = await supabase
      .from("reports")
      .select("id, category, status, created_at, resolved_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /** §45 : les sanctions me concernant, avec leur motivation. */
  async getMySanctions() {
    const { data, error } = await supabase
      .from("sanctions")
      .select("id, type, reason, rule_violated, starts_at, ends_at, revoked_at, appealable, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getMyAppeals() {
    const { data, error } = await supabase
      .from("appeals")
      .select("id, sanction_id, message, status, decision, created_at, resolved_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createAppeal({ sanctionId, message }) {
    return rpc("create_appeal", { p_sanction_id: sanctionId, p_message: message });
  },
};
