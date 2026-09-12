/* =============================================================================
   LIKEMM — profileService (§5 / §6 / §7 / §20 / §21 / §32)
   ========================================================================== */

import { supabase, rpc } from "../lib/supabase.js";

export const profileService = {
  /** Profil complet de l'utilisateur connecte, role et sanctions compris. */
  async getMe() {
    return rpc("get_me");
  },

  /**
   * Profil public par username.
   * @param {string} username
   * @param {string|null} inviteToken token d'un lien prive (§32)
   */
  async getPublicProfile(username, inviteToken = null) {
    return rpc("get_public_profile", {
      p_username: username,
      p_invite_token: inviteToken,
    });
  },

  /** Disponibilite d'un username — indication d'interface uniquement (§5). */
  async checkUsername(username) {
    return rpc("check_username", { p_username: username });
  },

  async updateUsername(username) {
    return rpc("update_username", { p_username: username });
  },

  /**
   * Champs modifiables directement par leur proprietaire. Les colonnes
   * sensibles (status, username, role) ne sont meme pas accordees en ecriture
   * au role `authenticated` : une tentative echouerait cote base.
   */
  async updateProfile(patch) {
    const allowed = ["bio", "avatar_url", "cover_url", "external_links", "is_private", "hide_likes", "profile_completed"];
    const payload = {};
    for (const key of allowed) {
      if (key in patch) payload[key] = patch[key];
    }
    if (Object.keys(payload).length === 0) return null;

    const { data: session } = await supabase.auth.getUser();
    const uid = session?.user?.id;
    if (!uid) throw Object.assign(new Error("Non connecte"), { hint: "AUTH_REQUIRED" });

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", uid)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Preferences de notification (§20). */
  async updateNotificationPreferences(patch) {
    const allowed = ["notify_likes", "notify_rank", "notify_email_security", "notify_email_marketing"];
    const payload = {};
    for (const key of allowed) if (key in patch) payload[key] = patch[key];
    if (Object.keys(payload).length === 0) return null;

    const { data: session } = await supabase.auth.getUser();
    const uid = session?.user?.id;
    if (!uid) throw Object.assign(new Error("Non connecte"), { hint: "AUTH_REQUIRED" });

    const { data, error } = await supabase
      .from("profile_private")
      .update(payload)
      .eq("user_id", uid)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** §32 : liens d'acces revocables pour un profil prive. */
  async listPrivateLinks() {
    const { data, error } = await supabase
      .from("private_profile_links")
      .select("id, label, created_at, expires_at, revoked_at, last_used_at, use_count")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /** Le token en clair n'est renvoye qu'ici, une seule fois. */
  async createPrivateLink(label = null) {
    return rpc("create_private_link", { p_label: label, p_expires_in: null });
  },

  async revokePrivateLinks(linkId = null) {
    return rpc("revoke_private_links", { p_link_id: linkId });
  },

  /** §43 : enregistrement du consentement parental lorsqu'il est requis. */
  async recordParentalConsent(proofReference) {
    return rpc("record_parental_consent", { p_proof_reference: proofReference });
  },
};
