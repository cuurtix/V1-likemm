/* =============================================================================
   LIKEMM — likeService (§9 / §10)
   =============================================================================
   Aucun composant n'ecrit dans la table `likes` : le role `authenticated` n'a
   meme pas le droit INSERT dessus. Tout passe par les fonctions RPC, qui
   verifient l'authentification, l'etat du compte, les blocages, les profils
   prives et les quotas avant d'ecrire (§44).
   ========================================================================== */

import { rpc } from "../lib/supabase.js";

export const likeService = {
  /**
   * @param {string} targetUserId
   * @param {object} [options]
   * @param {string|null} [options.inviteToken] token d'un profil prive
   * @param {string|null} [options.source] d'ou vient le like, pour la mesure
   * @returns {Promise<{ok:boolean, liked:boolean, target_likes_total:number, target_likes_24h:number}>}
   */
  async like(targetUserId, { inviteToken = null, source = null } = {}) {
    return rpc("like_user", {
      p_target_id: targetUserId,
      p_invite_token: inviteToken,
      p_source: source,
    });
  },

  async unlike(targetUserId) {
    return rpc("unlike_user", { p_target_id: targetUserId });
  },

  /** §10 : qui m'a like. L'identite est masquee si l'auteur l'a demande (§21). */
  async getMyLikers(limit = 30, offset = 0) {
    return (await rpc("get_my_likers", { p_limit: limit, p_offset: offset })) || [];
  },

  /** Les profils que j'ai likes. */
  async getMyLikedProfiles(limit = 30, offset = 0) {
    return (await rpc("get_my_liked_profiles", { p_limit: limit, p_offset: offset })) || [];
  },
};
