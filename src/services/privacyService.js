/* =============================================================================
   LIKEMM — privacyService (§13 / §14 / §31 / §34 / §35)
   =============================================================================
   Exercice des droits, export des donnees et suppression du compte.
   Aucun delai de traitement n'est promis ici : il depend du fondement juridique
   et de la nature de la demande (§14 : « Ne jamais promettre un droit ou un
   delai absolu si celui-ci depend du fondement juridique du traitement »).
   ========================================================================== */

import { supabase, rpc } from "../lib/supabase.js";
import { storageService } from "./storageService.js";

export const PRIVACY_REQUEST_TYPES = [
  { value: "access", label: "Acceder a mes donnees" },
  { value: "rectification", label: "Corriger une donnee inexacte" },
  { value: "erasure", label: "Effacer mes donnees" },
  { value: "restriction", label: "Limiter le traitement" },
  { value: "objection", label: "M'opposer a un traitement" },
  { value: "portability", label: "Recuperer mes donnees dans un format lisible" },
  { value: "consent_withdrawal", label: "Retirer un consentement" },
];

export const privacyService = {
  async createRequest({ type, message }) {
    return rpc("create_privacy_request", { p_type: type, p_message: message || null });
  },

  async getMyRequests() {
    const { data, error } = await supabase
      .from("privacy_requests")
      .select("id, type, status, message, created_at, handled_at, response_note")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /** §31 / §35 : export JSON complet des donnees de l'utilisateur. */
  async exportMyData() {
    return rpc("export_my_data");
  },

  /** Declenche le telechargement du fichier JSON dans le navigateur. */
  downloadExport(payload, username) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `likemm-mes-donnees-${username || "compte"}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * Suppression reelle du compte (§34). Les images sont retirees du stockage
   * avant l'appel : la fonction SQL fait de meme en filet de securite, puis
   * supprime le compte et toutes ses donnees en cascade.
   */
  async deleteMyAccount({ confirmation, userId }) {
    if (userId) await storageService.removeAllImages(userId);
    const result = await rpc("delete_my_account", { p_confirmation: confirmation });
    // La session locale n'a plus d'objet : on la ferme immediatement.
    await supabase.auth.signOut().catch(() => {});
    return result;
  },
};
