/* =============================================================================
   LIKEMM — feuilles de partage, signalement, consentement
   ========================================================================== */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Copy, Share2, Link2, Check, Flag, Cookie, ExternalLink } from "lucide-react";
import { ModalShell, PrimaryButton, SecondaryButton, Select, TextArea, FormError, Switch } from "./forms.jsx";
import { Callout } from "./atoms.jsx";
import { shareService } from "../services/shareService.js";
import { reportService, REPORT_CATEGORIES } from "../services/reportService.js";
import { CONSENT_CATEGORIES } from "../services/consentService.js";
import { useConsent } from "../context/ConsentContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { mapError } from "../lib/errors.js";

/* --------------------------------------------------------------------------
   Partage (§16 / §27 / §49)
   -------------------------------------------------------------------------- */
export function ShareSheet({ open, onClose, username, url, message, context = "profile" }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const intents = shareService.webIntents({ text: message, url });

  const handleNative = async () => {
    const result = await shareService.shareNative({
      title: `Likemm · @${username}`,
      text: message,
      url,
      context,
    });
    if (result === "shared") {
      showToast("Partagé");
      onClose();
    } else if (result === "unavailable") {
      showToast("Le partage natif n'est pas disponible sur cet appareil.", "info");
    }
    // 'cancelled' : la personne a ferme la feuille. Aucun message, aucun
    // enregistrement de partage : ce n'en etait pas un.
  };

  const handleCopy = async () => {
    const ok = await shareService.copyLink(url, { context });
    if (ok) {
      setCopied(true);
      showToast("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast("La copie a échoué. Sélectionnez le lien pour le copier.", "error");
    }
  };

  return (
    <ModalShell title="Partager" onClose={onClose}>
      <div className="space-y-4">
        <div
          className="rounded-[14px] px-4 py-3 text-[14px] leading-relaxed"
          style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)" }}
        >
          {message}
        </div>

        <div
          className="flex items-center gap-2 rounded-[14px] px-3 h-12"
          style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--border)" }}
        >
          <Link2 size={15} style={{ color: "var(--text-muted)" }} className="shrink-0" />
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
            style={{ color: "var(--text)" }}
            aria-label="Lien du profil"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 px-3 h-8 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5"
            style={{ background: "var(--text)", color: "var(--bg)" }}
          >
            {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} strokeWidth={2.4} />}
            {copied ? "Copié" : "Copier"}
          </button>
        </div>

        {shareService.canShareNatively() && (
          <PrimaryButton onClick={handleNative}>
            <Share2 size={16} strokeWidth={2.2} />
            Partager depuis mon téléphone
          </PrimaryButton>
        )}

        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: "var(--text-muted)" }}>
            Ouvrir sur
          </p>
          <div className="grid grid-cols-2 gap-2">
            {intents.map((intent) => (
              <button
                key={intent.key}
                type="button"
                onClick={() => shareService.openIntent(intent, { context })}
                className="h-11 rounded-[14px] text-[14px] font-medium inline-flex items-center justify-center gap-2"
                style={{
                  background: "var(--bg-elev-1)",
                  color: "var(--text)",
                  boxShadow: "inset 0 0 0 1px var(--border)",
                }}
              >
                {intent.label}
                <ExternalLink size={12} style={{ color: "var(--text-dim)" }} />
              </button>
            ))}
          </div>
        </div>

        {/* §16 : on ne promet pas une integration qui n'existe pas. */}
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          TikTok, Instagram et Snapchat ne permettent pas de publier depuis un site web.
          {shareService.canShareNatively()
            ? " Utilisez « Partager depuis mon téléphone » : ces applications y apparaissent si elles sont installées."
            : " Copiez le lien puis collez-le dans l'application."}
        </p>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Signalement (§21 / §31)
   -------------------------------------------------------------------------- */
export function ReportDialog({ open, onClose, username }) {
  const { showToast } = useToast();
  const [category, setCategory] = useState("behavior");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory("behavior");
      setDescription("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    setSending(true);
    try {
      await reportService.createReport({ targetUsername: username, category, description });
      showToast("Signalement envoyé. L'équipe de modération va l'examiner.");
      onClose();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell title={`Signaler @${username}`} onClose={onClose}>
      <div className="space-y-5">
        <Select
          label="Motif"
          value={category}
          onChange={setCategory}
          options={REPORT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
        />
        <TextArea
          label="Précisions (facultatif)"
          value={description}
          onChange={setDescription}
          maxLength={1000}
          rows={4}
          placeholder="Décrivez ce qui pose problème."
          hint="Ne communiquez que les informations nécessaires à l'examen du signalement."
        />
        <FormError>{error}</FormError>
        <Callout tone="neutral">
          Votre signalement est transmis à l'équipe de modération avec votre identifiant, afin de
          pouvoir vous répondre et de limiter les signalements abusifs. La personne signalée n'en est
          pas informée.
        </Callout>
        <PrimaryButton onClick={submit} loading={sending}>
          <Flag size={15} strokeWidth={2.2} />
          Envoyer le signalement
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Consentement cookies (§17 / §37 / §46)
   -------------------------------------------------------------------------- */

/**
 * Banniere de consentement.
 * §46 : « Le bouton Refuser ne doit pas etre volontairement cache ou rendu
 * beaucoup plus difficile que Accepter. » Les deux boutons ont donc exactement
 * la meme taille, la meme position et le meme poids visuel.
 */
export function CookieBanner() {
  const { needsDecision, acceptAll, rejectAll, openPanel } = useConsent();
  const [busy, setBusy] = useState(false);

  if (!needsDecision) return null;

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[55] px-3 pb-3 sm:pb-5 pointer-events-none"
      role="dialog"
      aria-label="Préférences de confidentialité"
    >
      <div
        className="max-w-2xl mx-auto rounded-[22px] p-5 pointer-events-auto lm-slideUp"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(28px) saturate(1.8)",
          WebkitBackdropFilter: "blur(28px) saturate(1.8)",
          boxShadow: "var(--shadow-xl), inset 0 0 0 1px var(--glass-border)",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)" }}
          >
            <Cookie size={17} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              Cookies et traceurs
            </p>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Les cookies strictement nécessaires au fonctionnement du site sont toujours actifs.
              Pour la mesure d'audience, la personnalisation et la publicité, rien n'est activé sans
              votre accord.{" "}
              <Link to="/cookies" style={{ color: "var(--accent)" }}>En savoir plus</Link>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
          {/* Refuser et Accepter : meme taille, meme style, meme importance. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(rejectAll)}
            className="h-11 rounded-full text-[14px] font-semibold disabled:opacity-50"
            style={{ background: "var(--bg-elev-1)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          >
            Tout refuser
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={openPanel}
            className="h-11 rounded-full text-[14px] font-semibold disabled:opacity-50"
            style={{ background: "var(--bg-elev-1)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          >
            Personnaliser
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(acceptAll)}
            className="h-11 rounded-full text-[14px] font-semibold disabled:opacity-50"
            style={{ background: "var(--bg-elev-1)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          >
            Tout accepter
          </button>
        </div>
      </div>
    </div>
  );
}

export function CookiePanel() {
  const { panelOpen, closePanel, consent, save } = useConsent();
  const [choices, setChoices] = useState({
    analytics: consent.analytics,
    personalization: consent.personalization,
    advertising: consent.advertising,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (panelOpen) {
      setChoices({
        analytics: consent.analytics,
        personalization: consent.personalization,
        advertising: consent.advertising,
      });
    }
  }, [panelOpen, consent]);

  if (!panelOpen) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await save(choices);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Préférences de confidentialité" onClose={closePanel}>
      <div className="space-y-4">
        {CONSENT_CATEGORIES.map((cat) => (
          <div
            key={cat.key}
            className="flex items-start gap-3 rounded-[14px] p-4"
            style={{ background: "var(--bg-elev-2)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{cat.label}</p>
              <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {cat.description}
              </p>
            </div>
            {cat.alwaysOn ? (
              <span className="text-[12px] font-semibold shrink-0 mt-1" style={{ color: "var(--text-dim)" }}>
                Toujours actif
              </span>
            ) : (
              <Switch
                value={choices[cat.key]}
                onChange={(v) => setChoices((c) => ({ ...c, [cat.key]: v }))}
                label={cat.label}
              />
            )}
          </div>
        ))}

        <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Vous pouvez modifier ces choix à tout moment depuis le pied de page ou vos paramètres.
          Pour les comptes de moins de 18 ans, la publicité reste désactivée.
        </p>

        <div className="flex gap-2">
          <SecondaryButton onClick={closePanel}>Annuler</SecondaryButton>
          <PrimaryButton onClick={submit} loading={busy}>Enregistrer</PrimaryButton>
        </div>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Confirmation generique
   -------------------------------------------------------------------------- */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirmer", danger = false }) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
        <div className="flex gap-2">
          <SecondaryButton onClick={onClose}>Annuler</SecondaryButton>
          <PrimaryButton onClick={run} danger={danger} loading={busy}>{confirmLabel}</PrimaryButton>
        </div>
      </div>
    </ModalShell>
  );
}
