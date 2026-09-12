/* =============================================================================
   LIKEMM — /report : signaler un profil (§21 / §31 / §44)
   ========================================================================== */

import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Flag } from "lucide-react";
import { PageShell, PageHero } from "../../components/molecules.jsx";
import { Callout, EmptyState } from "../../components/atoms.jsx";
import { TextInput, Select, TextArea, PrimaryButton, FormError } from "../../components/forms.jsx";
import { reportService, REPORT_CATEGORIES } from "../../services/reportService.js";
import { analyticsService, EVENTS } from "../../services/analyticsService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { normalizeUsername } from "../../lib/validation.js";
import { mapError } from "../../lib/errors.js";
import { setPageMeta } from "../../lib/seo.js";
import { CONTACT_EMAIL } from "../../lib/config.js";

export default function ReportPage() {
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const [username, setUsername] = useState(normalizeUsername(params.get("user") || ""));
  const [category, setCategory] = useState("behavior");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setPageMeta({
      title: "Signaler un problème",
      description: "Signaler un profil, un contenu ou un comportement sur Likemm.",
      path: "/report",
    });
  }, []);

  const submit = async () => {
    setError(null);
    if (!username) return setError("Indiquez le nom d'utilisateur concerné.");
    setSending(true);
    try {
      await reportService.createReport({ targetUsername: username, category, description });
      analyticsService.trackEvent(EVENTS.REPORT_CREATED, { category });
      setSent(true);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <PageShell hero={<PageHero title="Signaler un problème" />}>
        <EmptyState
          icon={Flag}
          title="Connectez-vous pour signaler"
          subtitle="Le signalement est rattaché à votre compte afin de pouvoir vous répondre et de limiter les signalements abusifs."
        />
        <Callout tone="neutral">
          Pour signaler un contenu sans compte, notamment un contenu manifestement illégal, écrivez à{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> en précisant le profil concerné et
          la nature du problème.
        </Callout>
      </PageShell>
    );
  }

  if (sent) {
    return (
      <PageShell hero={<PageHero title="Signalement envoyé" />}>
        <Callout tone="info" title="Votre signalement a bien été enregistré">
          Un modérateur va l'examiner et prendre une décision motivée. Vous pouvez suivre l'état de
          vos signalements depuis vos <Link to="/settings">paramètres</Link>. La personne signalée
          n'est pas informée de votre identité.
        </Callout>
        <p className="text-[14px] mt-6" style={{ color: "var(--text-muted)" }}>
          Aucun délai de traitement n'est promis : il dépend du volume et de la complexité des
          signalements reçus.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell
      hero={
        <PageHero
          title="Signaler un problème"
          subtitle="Un profil, une photo, un nom d'utilisateur, une bio ou un comportement."
        />
      }
    >
      <div className="max-w-lg space-y-5">
        <TextInput
          label="Nom d'utilisateur concerné"
          prefix="@"
          value={username}
          onChange={(v) => { setUsername(normalizeUsername(v)); setError(null); }}
          placeholder="username"
          maxLength={20}
        />
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
          rows={5}
          maxLength={1000}
          placeholder="Décrivez ce qui pose problème."
          hint="Ne communiquez que les informations nécessaires à l'examen du signalement."
        />

        <Callout tone="danger" title="Urgence ou danger immédiat">
          Si une personne est en danger immédiat, contactez les services d'urgence de votre pays. Un
          signalement sur Likemm ne remplace pas une intervention des autorités.
        </Callout>

        <FormError>{error}</FormError>
        <PrimaryButton onClick={submit} loading={sending}>
          <Flag size={15} strokeWidth={2.2} />
          Envoyer le signalement
        </PrimaryButton>

        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Le fonctionnement de la modération est décrit dans{" "}
          <Link to="/moderation" style={{ color: "var(--accent)" }}>Modération et recours</Link>.
        </p>
      </div>
    </PageShell>
  );
}
