/* =============================================================================
   LIKEMM — client Supabase unique
   =============================================================================
   Un seul client pour toute l'application. Aucun composant n'importe
   `@supabase/supabase-js` directement : tout passe par les services de
   src/services, qui passent par ce fichier (§3 : « Ne pas mettre tous les
   appels Supabase directement dans les composants UI »).
   ========================================================================== */

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, CONFIG_ERROR, APP_NAME, APP_VERSION } from "./config.js";

// En l'absence de configuration, on cree un client inerte plutot que de faire
// planter le chargement du module : main.jsx affiche un message explicite.
export const supabase = createClient(
  SUPABASE_URL || "https://non-configure.supabase.co",
  SUPABASE_ANON_KEY || "non-configure",
  {
    auth: {
    // La session doit survivre a un rafraichissement, a la fermeture du
    // navigateur et a la navigation entre pages (§4 : « Session »).
    persistSession: true,
    autoRefreshToken: true,
    // Necessaire pour les retours OAuth (Google / Apple), la confirmation
    // d'email et la reinitialisation de mot de passe, qui reviennent avec un
    // fragment dans l'URL.
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "likemm.auth",
  },
  global: {
    headers: { "x-client-info": `${APP_NAME.toLowerCase()}/${APP_VERSION}` },
  },
    db: { schema: "public" },
  },
);

if (CONFIG_ERROR && import.meta.env.DEV) {
  console.warn(`[likemm] ${CONFIG_ERROR}`);
}

/**
 * Appelle une fonction RPC et renvoie directement les donnees.
 * Les erreurs remontent telles quelles : c'est `mapError` (lib/errors.js) qui
 * les traduit en message affichable, au plus pres de l'endroit ou l'utilisateur
 * a agi.
 */
export async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}
