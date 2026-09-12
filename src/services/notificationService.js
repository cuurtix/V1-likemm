/* =============================================================================
   LIKEMM — notificationService (§19)
   =============================================================================
   Chaque notification correspond a un evenement reel enregistre en base :
   un like recu, un changement de rang mesure, un palier franchi. Aucune
   notification n'est fabriquee pour donner l'impression d'activite.
   ========================================================================== */

import { supabase, rpc } from "../lib/supabase.js";

export const notificationService = {
  async getNotifications({ limit = 30, offset = 0, onlyUnread = false } = {}) {
    return (
      (await rpc("get_notifications", {
        p_limit: limit,
        p_offset: offset,
        p_only_unread: onlyUnread,
      })) || []
    );
  },

  async markAsRead(ids = null) {
    return rpc("mark_notifications_read", { p_ids: ids });
  },

  async deleteNotification(id) {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) throw error;
    return true;
  },

  /**
   * Abonnement temps reel aux nouvelles notifications de l'utilisateur.
   * Ne fonctionne que si Realtime est active pour la table `notifications`
   * (voir docs/DEPLOY.md). Sans cela, l'application se contente de recharger
   * la liste a l'ouverture de l'onglet : rien ne casse.
   */
  subscribe(userId, onInsert) {
    if (!userId) return () => {};
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => onInsert(payload.new),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};
