/* =============================================================================
   LIKEMM — /account-deletion : suppression du compte (§13 / §34 / §46)
   =============================================================================
   §13 : « avec confirmation en plusieurs etapes pour eviter les suppressions
   accidentelles ». §46 : la suppression ne doit pas etre volontairement cachee
   ni rendue difficile. D'ou : trois etapes claires, aucune friction inutile,
   et la liste exacte de ce qui est supprime et de ce qui peut subsister.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Download, AlertTriangle } from "lucide-react";
import { PageShell, PageHero } from "../../components/molecules.jsx";
import { Callout, EmptyState } from "../../components/atoms.jsx";
import { TextInput, PrimaryButton, SecondaryButton, FormError, Checkbox } from "../../components/forms.jsx";
import { privacyService } from "../../services/privacyService.js";
import { analyticsService, EVENTS } from "../../services/analyticsService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { mapError } from "../../lib/errors.js";
import { setPageMeta } from "../../lib/seo.js";
import { CONTACT_EMAIL } from "../../lib/config.js";

export default function AccountDeletionPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile, user } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [understood, setUnderstood] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setPageMeta({
      title: "Supprimer mon compte",
      description: "Ce qui est supprimé, ce qui peut être conservé, et pourquoi.",
      path: "/account-deletion",
      noindex: true,
    });
  }, []);

  const exportFirst = async () => {
    setExporting(true);
    try {
      const payload = await privacyService.exportMyData();
      privacyService.downloadExport(payload, profile?.username);
      showToast("Export téléchargé");
    } catch (e) {
      showToast(mapError(e), "error");
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async () => {
    setError(null);
    if (confirmation.trim().toUpperCase() !== "SUPPRIMER") {
      return setError("Tapez exactement SUPPRIMER pour confirmer.");
    }
    setDeleting(true);
    try {
      analyticsService.trackEvent(EVENTS.ACCOUNT_DELETED);
      await privacyService.deleteMyAccount({ confirmation: "SUPPRIMER", userId: user?.id });
      navigate("/", { replace: true });
      showToast("Votre compte a été supprimé.");
    } catch (e) {
      setError(mapError(e));
      setDeleting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <PageShell hero={<PageHero title="Supprimer mon compte" />}>
        <EmptyState
          icon={Trash2}
          title="Connectez-vous pour supprimer votre compte"
          subtitle="Nous devons pouvoir vérifier qu'il s'agit bien de votre compte."
        />
        <Callout tone="neutral">
          Si vous ne parvenez pas à vous connecter, écrivez à{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> depuis l'adresse email associée à
          votre compte.
        </Callout>
      </PageShell>
    );
  }

  return (
    <PageShell
      hero={
        <PageHero
          title="Supprimer mon compte"
          subtitle="Cette action est définitive. Voici exactement ce qu'elle entraîne."
        />
      }
    >
      <div className="max-w-lg space-y-6">
        <div className="flex items-center gap-1.5" aria-label={`Étape ${step} sur 3`}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i <= step ? "var(--danger)" : "var(--bg-elev-3)" }}
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <section>
              <h2 className="text-[18px] font-semibold mb-3" style={{ color: "var(--text)" }}>
                Ce qui sera supprimé
              </h2>
              <ul className="lm-prose">
                <li>votre profil et votre nom d'utilisateur ;</li>
                <li>votre photo de profil et votre image de couverture ;</li>
                <li>votre bio et vos liens externes ;</li>
                <li>vos données personnelles, dont votre date de naissance ;</li>
                <li>les likes que vous avez donnés — les compteurs des personnes concernées sont recalculés ;</li>
                <li>les likes que vous avez reçus ;</li>
                <li>vos notifications et votre historique de classement ;</li>
                <li>vos consentements et vos préférences ;</li>
                <li>votre compte d'authentification et vos sessions.</li>
              </ul>
              <p className="lm-prose">
                Votre profil disparaît des classements et de la recherche. L'adresse{" "}
                <code>likemm.site/@{profile?.username}</code> ne renvoie plus aucun contenu.
              </p>
            </section>

            <Callout tone="warn" title="Ce qui peut être conservé, et pourquoi">
              Une référence <strong>pseudonymisée</strong> et non réversible de votre compte est
              conservée pour la sécurité et la lutte contre la fraude — par exemple pour détecter
              qu'un compte banni se recrée. Elle ne contient aucune donnée personnelle et ne permet
              pas de remonter à vous.
              <br />
              <br />
              Les décisions de modération déjà prises restent enregistrées, mais votre identifiant y
              est effacé : on conserve le fait qu'une décision a été prise, pas votre identité.
              <br />
              <br />
              Le détail figure dans la{" "}
              <Link to="/privacy" style={{ color: "var(--accent)" }}>politique de confidentialité</Link>.
            </Callout>

            <section>
              <h2 className="text-[18px] font-semibold mb-2" style={{ color: "var(--text)" }}>
                Avant de partir
              </h2>
              <p className="text-[14px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
                Vous pouvez télécharger vos données. Après la suppression, ce ne sera plus possible.
              </p>
              <SecondaryButton onClick={exportFirst} disabled={exporting}>
                <Download size={15} strokeWidth={2.2} />
                {exporting ? "Préparation…" : "Télécharger mes données"}
              </SecondaryButton>
            </section>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <SecondaryButton onClick={() => navigate(-1)}>Annuler</SecondaryButton>
              <PrimaryButton danger onClick={() => setStep(2)}>Continuer</PrimaryButton>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Callout tone="danger" title="Suppression définitive">
              Cette action est <strong>irréversible</strong>. Votre compte ne pourra pas être
              restauré, et votre nom d'utilisateur redeviendra disponible pour quelqu'un d'autre.
            </Callout>

            {profile?.likes_total > 0 && (
              <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Vous avez actuellement <strong>{profile.likes_total}</strong> like
                {profile.likes_total > 1 ? "s" : ""} reçu{profile.likes_total > 1 ? "s" : ""}. Ils
                seront supprimés.
              </p>
            )}

            <Checkbox checked={understood} onChange={setUnderstood}>
              J'ai compris que la suppression est définitive et que mes données seront effacées.
            </Checkbox>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <SecondaryButton onClick={() => setStep(1)}>Retour</SecondaryButton>
              <PrimaryButton danger onClick={() => setStep(3)} disabled={!understood}>
                Continuer
              </PrimaryButton>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div
              className="rounded-[16px] p-4 flex items-start gap-3"
              style={{ background: "var(--danger-soft)", boxShadow: "inset 0 0 0 1px rgba(255,69,58,0.30)" }}
            >
              <AlertTriangle size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
              <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Dernière étape. Tapez <strong style={{ color: "var(--danger)" }}>SUPPRIMER</strong>{" "}
                pour confirmer la suppression du compte <strong>@{profile?.username}</strong>.
              </p>
            </div>

            <TextInput
              label="Confirmation"
              value={confirmation}
              onChange={(v) => { setConfirmation(v); setError(null); }}
              placeholder="SUPPRIMER"
              autoFocus
            />

            <FormError>{error}</FormError>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <SecondaryButton onClick={() => setStep(2)}>Retour</SecondaryButton>
              <PrimaryButton
                danger
                onClick={doDelete}
                loading={deleting}
                disabled={confirmation.trim().toUpperCase() !== "SUPPRIMER"}
              >
                <Trash2 size={15} strokeWidth={2.2} />
                Supprimer définitivement
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
