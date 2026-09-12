/* =============================================================================
   LIKEMM — searchService (§15)
   =============================================================================
   Recherche executee par PostgreSQL, avec index et pagination. Les profils
   prives, masques, suspendus, bannis, supprimes et bloques sont exclus par la
   fonction RPC elle-meme.
   ========================================================================== */

import { rpc } from "../lib/supabase.js";

export const searchService = {
  async searchProfiles(query, limit = 20, offset = 0) {
    const q = String(query || "").trim();
    if (!q) return [];
    return (
      (await rpc("search_profiles", { p_query: q, p_limit: limit, p_offset: offset })) || []
    );
  },
};
