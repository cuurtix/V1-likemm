/* =============================================================================
   LIKEMM — consentService (§17 / §18 / §37 / §38 / §46)
   =============================================================================
   Un vrai systeme de consentement, pas une banniere decorative :

     * quatre categories : necessaires, analytics, personnalisation, publicite ;
     * les categories facultatives sont REFUSEES par defaut ;
     * « Refuser tout » est exactement aussi accessible que « Accepter tout »
       (§46 : pas de dark pattern) ;
     * aucun script non necessaire n'est charge avant le consentement — c'est
       `applyConsent` qui les charge, et rien d'autre ne les injecte ;
     * le choix est enregistre en base pour les comptes connectes, avec la
       version des documents et un journal de preuve (§17) ;
     * le choix reste modifiable a tout moment depuis les parametres.

   Pour un visiteur non connecte, le choix vit dans localStorage — il n'y a pas
   de compte auquel le rattacher. Il est synchronise en base a la connexion.
   ========================================================================== */

import { rpc } from "../lib/supabase.js";
import { POLICY_VERSION, GA_MEASUREMENT_ID, META_PIXEL_ID, TIKTOK_PIXEL_ID } from "../lib/config.js";

const STORAGE_KEY = "likemm.consent";

export const CONSENT_CATEGORIES = [
  {
    key: "necessary",
    label: "Strictement necessaires",
    description:
      "Connexion, securite, preferences d'affichage. Sans eux, le site ne peut pas fonctionner.",
    alwaysOn: true,
  },
  {
    key: "analytics",
    label: "Mesure d'audience",
    description:
      "Comprendre comment Likemm est utilise : pages consultees, recherches, partages. " +
      "Les chiffres structurels (inscriptions, likes) sont calcules sans cela.",
    alwaysOn: false,
  },
  {
    key: "personalization",
    label: "Personnalisation",
    description: "Adapter certains contenus et suggestions a votre utilisation.",
    alwaysOn: false,
  },
  {
    key: "advertising",
    label: "Publicite",
    description:
      "Mesurer l'efficacite des campagnes publicitaires. Desactive pour les comptes mineurs.",
    alwaysOn: false,
  },
];

export const DEFAULT_CONSENT = {
  necessary: true,
  analytics: false,
  personalization: false,
  advertising: false,
  decided: false,
  policy_version: null,
  updated_at: null,
};

function readLocal() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONSENT };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONSENT,
      ...parsed,
      necessary: true,
      // Un changement de version des documents remet le choix en question (§39).
      decided: parsed.decided === true && parsed.policy_version === POLICY_VERSION,
    };
  } catch {
    return { ...DEFAULT_CONSENT };
  }
}

function writeLocal(consent) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    /* stockage indisponible : le choix vaut alors pour la session en cours */
  }
}

// --- Chargement conditionnel des scripts tiers ------------------------------
// §37 : « Ne pas simplement afficher une banniere sans reellement controler les
// scripts. » Aucun de ces scripts n'est dans index.html : ils n'existent que
// s'ils sont charges ici, apres consentement.
const loaded = new Set();

function injectScript(id, src, onLoad) {
  if (loaded.has(id) || document.getElementById(id)) return;
  const el = document.createElement("script");
  el.id = id;
  el.async = true;
  el.src = src;
  if (onLoad) el.onload = onLoad;
  document.head.appendChild(el);
  loaded.add(id);
}

function loadAnalyticsScripts() {
  if (!GA_MEASUREMENT_ID) return; // rien de configure : rien n'est charge
  injectScript(
    "ga-script",
    `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
    () => {
      window.dataLayer = window.dataLayer || [];
      function gtag() { window.dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag("js", new Date());
      gtag("config", GA_MEASUREMENT_ID, {
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
    },
  );
}

function loadAdvertisingScripts({ isMinor }) {
  // §18 / §43 : aucun pixel publicitaire pour un compte mineur, meme si le
  // consentement avait ete accorde par erreur.
  if (isMinor) return;
  if (META_PIXEL_ID) injectScript("meta-pixel", `https://connect.facebook.net/en_US/fbevents.js`);
  if (TIKTOK_PIXEL_ID) injectScript("tiktok-pixel", `https://analytics.tiktok.com/i18n/pixel/events.js`);
}

/**
 * Applique concretement un etat de consentement : charge ou non les scripts.
 * Le retrait d'un consentement ne peut pas "decharger" un script deja present
 * dans la page : l'application recharge alors la page pour repartir propre.
 */
export function applyConsent(consent, { isMinor = false, reload = false } = {}) {
  if (consent.analytics) loadAnalyticsScripts();
  if (consent.advertising) loadAdvertisingScripts({ isMinor });

  if (reload && (loaded.size > 0) && (!consent.analytics || !consent.advertising)) {
    // Retrait apres chargement : seul un rechargement garantit l'arret reel.
    window.location.reload();
  }
}

export const consentService = {
  get() {
    return readLocal();
  },

  hasDecided() {
    return readLocal().decided === true;
  },

  isGranted(category) {
    const c = readLocal();
    return category === "necessary" ? true : c[category] === true;
  },

  /**
   * Enregistre un choix. Pour un compte connecte, le choix part aussi en base
   * (table `consents` + journal `consent_log`). Un echec reseau ne fait pas
   * perdre le choix local, et n'est pas presente comme un succes complet.
   */
  async save(choices, { authenticated = false, isMinor = false } = {}) {
    const consent = {
      necessary: true,
      analytics: choices.analytics === true,
      personalization: choices.personalization === true,
      // §18 : un compte mineur ne peut pas accorder le consentement publicitaire.
      advertising: isMinor ? false : choices.advertising === true,
      decided: true,
      policy_version: POLICY_VERSION,
      updated_at: new Date().toISOString(),
    };
    writeLocal(consent);

    let synced = true;
    if (authenticated) {
      try {
        await Promise.all([
          rpc("set_consent", {
            p_consent_type: "analytics",
            p_granted: consent.analytics,
            p_policy_version: POLICY_VERSION,
          }),
          rpc("set_consent", {
            p_consent_type: "personalization",
            p_granted: consent.personalization,
            p_policy_version: POLICY_VERSION,
          }),
          rpc("set_consent", {
            p_consent_type: "advertising",
            p_granted: consent.advertising,
            p_policy_version: POLICY_VERSION,
          }),
        ]);
      } catch {
        synced = false;
      }
    }

    applyConsent(consent, { isMinor });
    return { consent, synced };
  },

  acceptAll(options) {
    return this.save({ analytics: true, personalization: true, advertising: true }, options);
  },

  rejectAll(options) {
    return this.save({ analytics: false, personalization: false, advertising: false }, options);
  },

  /** §14 : retrait explicite d'un consentement, trace comme tel. */
  async withdraw(category) {
    const current = readLocal();
    writeLocal({ ...current, [category]: false, updated_at: new Date().toISOString() });
    return rpc("withdraw_consent", {
      p_consent_type: category,
      p_policy_version: POLICY_VERSION,
    });
  },

  /** §39 : acceptation d'une version de document. */
  async acceptLegal(document) {
    return rpc("accept_legal", { p_document: document, p_policy_version: POLICY_VERSION });
  },

  /**
   * Aligne le stockage local sur ce que la base connait, a la connexion.
   * La base fait autorite : c'est elle qui porte la preuve.
   */
  syncFromServer(serverConsents) {
    if (!serverConsents) return readLocal();
    const status = (key) => serverConsents?.[key]?.status === "granted";
    const consent = {
      necessary: true,
      analytics: status("analytics"),
      personalization: status("personalization"),
      advertising: status("advertising"),
      decided: Object.keys(serverConsents).length > 0,
      policy_version: serverConsents?.analytics?.policy_version || POLICY_VERSION,
      updated_at: new Date().toISOString(),
    };
    // Un consentement enregistre sous une ancienne version doit etre redemande.
    if (consent.policy_version !== POLICY_VERSION) consent.decided = false;
    writeLocal(consent);
    return consent;
  },
};
