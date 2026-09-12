/* =============================================================================
   LIKEMM — session et profil de l'utilisateur connecte (§4)
   =============================================================================
   Source unique de verite pour : la session Supabase, le profil complet
   (get_me), le role, les sanctions en cours et le nombre de notifications non
   lues. Les composants lisent ici et n'appellent jamais Supabase directement.

   Cas geres explicitement, parce qu'ils arrivent vraiment :
     * session restauree apres rafraichissement ou reouverture du navigateur ;
     * session expiree en cours d'utilisation ;
     * compte suspendu ou banni pendant la session ;
     * compte cree via Google/Apple, sans username ni age (setup incomplet) ;
     * profil introuvable (compte supprime depuis un autre appareil).
   ========================================================================== */

import {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef,
} from "react";
import { authService } from "../services/authService.js";
import { profileService } from "../services/profileService.js";
import { consentService, applyConsent } from "../services/consentService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { isAuthError } from "../lib/errors.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession) {
      setProfile(null);
      setProfileError(null);
      return null;
    }
    try {
      const me = await profileService.getMe();
      if (!mounted.current) return null;
      setProfile(me);
      setProfileError(null);
      // Le consentement enregistre en base fait autorite sur le choix local :
      // c'est lui qui porte la preuve (§17). On realigne, puis on (re)charge
      // uniquement les scripts reellement autorises pour cette session.
      if (me) {
        const local = me.consents
          ? consentService.syncFromServer(me.consents)
          : consentService.get();
        applyConsent(local, { isMinor: me.is_minor === true });
      }
      return me;
    } catch (error) {
      if (!mounted.current) return null;
      if (isAuthError(error)) {
        setSession(null);
        setProfile(null);
        return null;
      }
      // Le profil n'a pas pu etre charge : on le dit, on n'invente rien.
      setProfileError(error);
      setProfile(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const current = await authService.getSession();
        if (!active) return;
        setSession(current);
        await loadProfile(current);
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = authService.onAuthStateChange(async (event, newSession) => {
      if (!active) return;
      setSession(newSession);

      if (event === "SIGNED_OUT") {
        setProfile(null);
        setProfileError(null);
        return;
      }
      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"].includes(event)) {
        await loadProfile(newSession);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    const current = await authService.getSession().catch(() => null);
    setSession(current);
    return loadProfile(current);
  }, [loadProfile]);

  /** Mise a jour locale immediate apres une modification confirmee par la base. */
  const patchProfile = useCallback((patch) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const signOut = useCallback(async () => {
    analyticsService.trackEvent(EVENTS.LOGOUT);
    await authService.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => {
    const status = profile?.status || null;
    const activeSanction = (profile?.active_sanctions || []).find(
      (s) => s.type === "suspension" || s.type === "ban",
    );

    return {
      loading,
      session,
      user: session?.user || null,
      profile,
      profileError,
      role: profile?.role || "user",
      isAuthenticated: Boolean(session),
      // Compte cree via Google/Apple : il manque le username et l'age.
      needsSetup: Boolean(session) && profile !== null && profile.setup_complete === false,
      // §23 : l'onboarding produit n'a pas encore ete parcouru.
      needsOnboarding: Boolean(profile?.setup_complete) && profile?.profile_completed === false,
      isSuspended: status === "suspended",
      isBanned: status === "banned",
      isBlockedAccount: status === "suspended" || status === "banned",
      activeSanction: activeSanction || null,
      isMinor: profile?.is_minor === true,
      unreadCount: profile?.unread_notifications || 0,
      refreshProfile,
      patchProfile,
      signOut,
    };
  }, [loading, session, profile, profileError, refreshProfile, patchProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit etre utilise a l'interieur de <AuthProvider>");
  return ctx;
}
