/* =============================================================================
   LIKEMM — action « liker / retirer le like », partagee par toutes les vues
   =============================================================================
   Regle appliquee ici, directement tiree du cahier des charges (§26) :
   « Ne jamais afficher Like reussi si l'insertion Supabase a echoue. »

   L'interface se met a jour de facon optimiste pour rester reactive, mais elle
   est REMISE DANS SON ETAT PRECEDENT des que la base refuse, et le message
   d'erreur reel est affiche. Le compteur affiche ensuite est celui renvoye par
   la base, jamais un `+1` calcule dans le navigateur.
   ========================================================================== */

import { useState, useCallback } from "react";
import { likeService } from "../services/likeService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { mapError } from "../lib/errors.js";

/**
 * @param {object} options
 * @param {(userId: string, patch: object) => void} options.onResult
 *        applique le resultat REEL renvoye par la base a l'element concerne
 * @param {string|null} [options.inviteToken] pour un profil prive
 * @param {string|null} [options.source] origine du like, pour la mesure
 * @param {() => void} [options.onRequireAuth] visiteur non connecte (§8)
 */
export function useLikeAction({ onResult, inviteToken = null, source = null, onRequireAuth } = {}) {
  const { isAuthenticated, isBlockedAccount } = useAuth();
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState(null);

  const toggleLike = useCallback(
    async (row) => {
      if (!row?.user_id) return;

      // §8 : un visiteur non connecte ne peut pas interagir. On l'invite a
      // creer un compte plutot que de laisser l'appel echouer silencieusement.
      if (!isAuthenticated) {
        onRequireAuth?.();
        return;
      }
      if (isBlockedAccount) {
        showToast("Votre compte ne peut pas effectuer cette action.", "error");
        return;
      }
      if (busyId) return;

      const wasLiked = row.liked_by_me === true;
      setBusyId(row.user_id);

      // Mise a jour optimiste : uniquement l'etat du bouton, pas le compteur.
      onResult(row.user_id, { liked_by_me: !wasLiked, pending: true });

      try {
        const result = wasLiked
          ? await likeService.unlike(row.user_id)
          : await likeService.like(row.user_id, { inviteToken, source });

        // Le compteur affiche vient de la base, pas d'un calcul local.
        onResult(row.user_id, {
          liked_by_me: result.liked,
          likes_count: result.target_likes_total,
          likes_total: result.target_likes_total,
          likes_24h: result.target_likes_24h,
          pending: false,
        });

        analyticsService.trackEvent(wasLiked ? EVENTS.LIKE_REMOVED : EVENTS.LIKE_GIVEN, {
          source: source || undefined,
        });
        if (!wasLiked && source === "shared_profile") {
          analyticsService.trackEvent(EVENTS.LIKE_FROM_SHARED_PROFILE);
        }
      } catch (error) {
        // Retour a l'etat reel + message honnete.
        onResult(row.user_id, { liked_by_me: wasLiked, pending: false });
        showToast(mapError(error), "error");
      } finally {
        setBusyId(null);
      }
    },
    [isAuthenticated, isBlockedAccount, busyId, onResult, inviteToken, source, onRequireAuth, showToast],
  );

  return { toggleLike, busyId };
}
