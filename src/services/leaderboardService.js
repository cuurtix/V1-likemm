/* =============================================================================
   LIKEMM — leaderboardService (§11 / §12 / §13 / §14 / §43)
   =============================================================================
   Le classement est calcule COTE BASE. Le navigateur ne telecharge jamais tous
   les utilisateurs ni tous les likes pour trier lui-meme (§43 : « Eviter
   SELECT * FROM users pour ensuite filtrer cote frontend »).
   ========================================================================== */

import { rpc } from "../lib/supabase.js";

/** 'general' | '24h' cote interface -> 'general' | 'h24' cote base. */
function toRankingType(mode) {
  return mode === "24h" || mode === "h24" ? "h24" : "general";
}

export const leaderboardService = {
  /**
   * Page du classement.
   * @returns {Promise<Array<{board_position:number, rank:number, user_id:string,
   *   username:string, avatar_url:string|null, bio:string|null,
   *   likes_count:number, is_me:boolean, liked_by_me:boolean}>>}
   */
  async getLeaderboard(mode = "general", limit = 20, offset = 0) {
    return (
      (await rpc("get_leaderboard", {
        p_type: toRankingType(mode),
        p_limit: limit,
        p_offset: offset,
      })) || []
    );
  },

  /**
   * Mon rang exact. Peut legitimement valoir null : profil prive, compte non
   * finalise, aucun like sur 24 h... Dans ce cas `reason` explique pourquoi, et
   * l'interface affiche cette raison au lieu d'inventer une position.
   */
  async getMyRank(mode = "general") {
    return rpc("get_my_rank", { p_type: toRankingType(mode) });
  },

  /** « Tu es #284. Il te manque 12 likes pour depasser #283. » (§10 ameliorations) */
  async getRankContext(mode = "general") {
    return rpc("get_rank_context", { p_type: toRankingType(mode) });
  },

  /** Les voisins immediats au classement. */
  async getNeighbors(mode = "general", range = 1) {
    return (
      (await rpc("get_rank_neighbors", { p_type: toRankingType(mode), p_range: range })) || []
    );
  },

  /** §14 : historique reel des positions enregistrees. */
  async getMyRankHistory(mode = "general", days = 30) {
    return (
      (await rpc("get_my_rank_history", { p_type: toRankingType(mode), p_days: days })) || []
    );
  },
};
