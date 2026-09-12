/* =============================================================================
   LIKEMM — blockService (§22)
   =============================================================================
   Le blocage est une vraie table avec de vraies regles backend : il empeche
   reellement les interactions (like, consultation du profil, apparition dans
   la recherche) et ne se contente pas de masquer visuellement.
   ========================================================================== */

import { supabase, rpc } from "../lib/supabase.js";

export const blockService = {
  async block(username) {
    return rpc("block_user", { p_target_username: username });
  },

  async unblock(username) {
    return rpc("unblock_user", { p_target_username: username });
  },

  async listBlocked() {
    const { data, error } = await supabase
      .from("blocks")
      .select("blocked_id, created_at, profiles!blocks_blocked_id_fkey(username, avatar_url)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({
      user_id: row.blocked_id,
      created_at: row.created_at,
      username: row.profiles?.username || null,
      avatar_url: row.profiles?.avatar_url || null,
    }));
  },
};
