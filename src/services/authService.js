/* =============================================================================
   LIKEMM — authService (§4 : authentification reelle)
   ========================================================================== */

import { supabase, rpc } from "../lib/supabase.js";
import { POLICY_VERSION, AUTH_ORIGIN } from "../lib/config.js";
import { acquisitionSignupMeta } from "../lib/acquisition.js";

export const authService = {
  /** Session courante, restauree apres un rafraichissement ou une reouverture. */
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
    return () => data.subscription.unsubscribe();
  },

  /**
   * Inscription par email.
   * Le username, la date de naissance, la version des documents acceptes et la
   * provenance sont transmis en metadonnees : le trigger `handle_new_user` les
   * valide cote base et cree le profil. Un username deja pris ou un age
   * inferieur a 13 ans fait donc echouer l'inscription en BASE, pas en
   * JavaScript (§5 / §19).
   */
  async signUp({ email, password, username, birthDate }) {
    const { data, error } = await supabase.auth.signUp({
      email: String(email).trim(),
      password,
      options: {
        emailRedirectTo: `${AUTH_ORIGIN}/login?verified=1`,
        data: {
          username,
          birth_date: birthDate,
          policy_version: POLICY_VERSION,
          ...acquisitionSignupMeta(),
        },
      },
    });
    if (error) throw error;

    return {
      user: data.user,
      session: data.session,
      // Sans session immediate, Supabase attend la confirmation de l'email.
      needsEmailConfirmation: !data.session,
    };
  },

  async signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim(),
      password,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Connexion Google / Apple. Ne fonctionne que si le fournisseur est
   * reellement configure dans le projet Supabase : sinon l'appel echoue et
   * l'interface affiche l'erreur au lieu de faire semblant (§4).
   */
  async signInWithProvider(provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${AUTH_ORIGIN}/` },
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async sendPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim(), {
      redirectTo: `${AUTH_ORIGIN}/reset-password`,
    });
    if (error) throw error;
    return true;
  },

  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return true;
  },

  /**
   * Changement d'email. Supabase envoie un lien de confirmation : l'adresse
   * n'est PAS changee tant que le lien n'est pas ouvert. L'interface doit le
   * dire, et ne pas afficher un faux succes (§26).
   */
  async updateEmail(newEmail) {
    const { error } = await supabase.auth.updateUser(
      { email: String(newEmail).trim() },
      { emailRedirectTo: `${AUTH_ORIGIN}/settings` },
    );
    if (error) throw error;
    return { pendingConfirmation: true };
  },

  async resendVerificationEmail(email) {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: String(email).trim(),
      options: { emailRedirectTo: `${AUTH_ORIGIN}/login?verified=1` },
    });
    if (error) throw error;
    return true;
  },

  /** Finalisation d'un compte cree via Google/Apple (username + age). */
  async completeSignup({ username, birthDate }) {
    return rpc("complete_signup", {
      p_username: username,
      p_birth_date: birthDate,
      p_policy_version: POLICY_VERSION,
    });
  },
};
