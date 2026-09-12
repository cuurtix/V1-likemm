/* =============================================================================
   LIKEMM — etat du consentement cookies et traceurs (§17 / §37 / §46)
   =============================================================================
   Le contexte ne fait que refleter l'etat enregistre par consentService et
   declencher l'affichage de la banniere tant qu'aucun choix n'a ete fait pour
   la version courante des documents.
   ========================================================================== */

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { consentService, applyConsent } from "../services/consentService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { useAuth } from "./AuthContext.jsx";

const ConsentContext = createContext(null);

export function ConsentProvider({ children }) {
  const { isAuthenticated, isMinor, profile } = useAuth();
  const [consent, setConsent] = useState(() => consentService.get());
  const [panelOpen, setPanelOpen] = useState(false);

  // Le choix enregistre en base peut differer du choix local (autre appareil).
  useEffect(() => {
    if (profile?.consents) {
      setConsent(consentService.syncFromServer(profile.consents));
    }
  }, [profile?.consents]);

  useEffect(() => {
    applyConsent(consent, { isMinor });
  }, [consent, isMinor]);

  const save = useCallback(
    async (choices) => {
      const { consent: saved, synced } = await consentService.save(choices, {
        authenticated: isAuthenticated,
        isMinor,
      });
      setConsent(saved);
      setPanelOpen(false);
      // L'evenement n'est envoye que si la mesure vient d'etre autorisee.
      if (saved.analytics) {
        analyticsService.trackEvent(EVENTS.CONSENT_UPDATED, { granted: true });
      }
      return { saved, synced };
    },
    [isAuthenticated, isMinor],
  );

  const value = useMemo(
    () => ({
      consent,
      // La banniere ne s'affiche que si aucun choix n'existe pour la version
      // courante des documents.
      needsDecision: consent.decided !== true,
      panelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      save,
      acceptAll: () => save({ analytics: true, personalization: true, advertising: true }),
      rejectAll: () => save({ analytics: false, personalization: false, advertising: false }),
      isGranted: (key) => (key === "necessary" ? true : consent[key] === true),
    }),
    [consent, panelOpen, save],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent doit etre utilise a l'interieur de <ConsentProvider>");
  return ctx;
}
