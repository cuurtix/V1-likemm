/* =============================================================================
   LIKEMM — /appeal : contester une décision de modération (§24 / §33 / §45)
   =============================================================================
   §33 : « Ne pas faire semblant qu'un appel a été envoyé si aucune donnée n'est
   réellement enregistrée. » La page ne montre le formulaire que si une sanction
   réelle et contestable existe ; sinon elle le dit clairement.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gavel, ShieldCheck } from "lucide-react";
import { PageShell, PageHero } from "../../components/molecules.jsx";
import { Callout, EmptyState, Spinner, ErrorState } from "../../components/atoms.jsx";
import { TextArea, PrimaryButton, FormError } from "../../components/forms.jsx";
import { reportService } from "../../services/reportService.js";
import { analyticsService, EVENTS } from "../../services/analyticsService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { formatDateTime } from "../../lib/format.js";
import { mapError } from "../../lib/errors.js";
import { setPageMeta } from "../../lib/seo.js";
import { CONTACT_EMAIL } from "../../lib/config.js";

const STATUS_LABEL = {
  pending: "En attente d'examen",
  reviewing: "En cours d'examen",
  accepted: "Acceptée — sanction levée",
  rejected: "Rejetée — sanction maintenue",
};

export default function AppealPage() {
  const { isAuthenticated } = useAuth();
  const [sanctions, setSanctions] = useState(null);
  const [appeals, setAppeals] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    setPageMeta({
      title: "Contester une décision",
      description: "Demander le réexamen d'une mesure de modération.",
      path: "/appeal",
      noindex: true,
    });
  }, []);

  const load = async () => {
    setError(null);
    try {
      const [s, a] = await Promise.all([
        reportService.getMySanctions(),
        reportService.getMyAppeals(),
      ]);
      setSanctions(s);
      setAppeals(a);
    } catch (e) {
      setError(mapError(e));
      setSanctions([]);
    }
  };

  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated]);

  const submit = async () => {
    setFormError(null);
    if (message.trim().length < 10) {
      return setFormError("Expliquez votre demande en quelques phrases (10 caractères minimum).");
    }
    setSending(true);
    try {
      await reportService.createAppeal({ sanctionId: selected.id, message });
      analyticsService.trackEvent(EVENTS.APPEAL_CREATED);
      setSelected(null);
      setMessage("");
      await load();
    } catch (e) {
      setFormError(mapError(e));
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <PageShell hero={<PageHero title="Contester une décision" />}>
        <EmptyState
          icon={Gavel}
          title="Connectez-vous pour contester"
          subtitle="Une contestation porte sur une mesure appliquée à votre compte : vous devez y être connecté."
        />
        <Callout tone="neutral">
          Si vous ne parvenez pas à vous connecter, écrivez à{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> depuis l'adresse email associée à
          votre compte.
        </Callout>
      </PageShell>
    );
  }

  if (sanctions === null) {
    return <PageShell><div className="flex justify-center py-32"><Spinner size={22} /></div></PageShell>;
  }

  if (error) {
    return <PageShell><ErrorState message={error} onRetry={load} /></PageShell>;
  }

  const appealBySanction = Object.fromEntries(appeals.map((a) => [a.sanction_id, a]));
  const contestable = sanctions.filter((s) => s.appealable && !s.revoked_at && !appealBySanction[s.id]);

  return (
    <PageShell
      hero={
        <PageHero
          title="Contester une décision"
          subtitle="Demander le réexamen d'une mesure appliquée à votre compte."
        />
      }
    >
      <div className="max-w-lg space-y-8">
        {sanctions.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Aucune mesure sur votre compte"
            subtitle="Aucune décision de modération ne vous concerne. Il n'y a donc rien à contester."
          />
        ) : (
          <>
            <section>
              <h2 className="text-[18px] font-semibold mb-3" style={{ color: "var(--text)" }}>
                Mesures vous concernant
              </h2>
              <div className="space-y-3">
                {sanctions.map((s) => {
                  const appeal = appealBySanction[s.id];
                  return (
                    <div
                      key={s.id}
                      className="rounded-[16px] p-4"
                      style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
                    >
                      <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                        {{
                          warning: "Avertissement",
                          limit: "Limitation temporaire",
                          suspension: "Suspension",
                          ban: "Bannissement",
                        }[s.type] || s.type}
                        {s.revoked_at && (
                          <span className="font-normal" style={{ color: "var(--success)" }}> · levée</span>
                        )}
                      </p>
                      <p className="text-[14px] mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {s.reason}
                      </p>
                      <p className="text-[12px] mt-2" style={{ color: "var(--text-dim)" }}>
                        {s.rule_violated ? `${s.rule_violated} · ` : ""}
                        Depuis le {formatDateTime(s.starts_at)}
                        {s.ends_at ? ` · jusqu'au ${formatDateTime(s.ends_at)}` : " · sans date de fin"}
                      </p>

                      {appeal ? (
                        <div
                          className="mt-3 rounded-[12px] px-3 py-2.5"
                          style={{ background: "var(--bg-elev-2)" }}
                        >
                          <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                            Contestation : {STATUS_LABEL[appeal.status] || appeal.status}
                          </p>
                          {appeal.decision && (
                            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
                              {appeal.decision}
                            </p>
                          )}
                        </div>
                      ) : s.appealable && !s.revoked_at ? (
                        <button
                          type="button"
                          onClick={() => { setSelected(s); setFormError(null); }}
                          className="mt-3 h-9 px-3.5 rounded-full text-[13px] font-semibold"
                          style={{ background: "var(--text)", color: "var(--bg)" }}
                        >
                          Contester cette décision
                        </button>
                      ) : (
                        <p className="text-[12px] mt-3" style={{ color: "var(--text-dim)" }}>
                          {s.revoked_at ? "Cette mesure a été levée." : "Cette décision n'est pas contestable."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {selected && (
              <section
                className="rounded-[18px] p-5"
                style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--accent-ring)" }}
              >
                <h2 className="text-[17px] font-semibold mb-1" style={{ color: "var(--text)" }}>
                  Votre contestation
                </h2>
                <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
                  Expliquez pourquoi vous estimez que cette décision doit être réexaminée.
                </p>
                <TextArea
                  value={message}
                  onChange={setMessage}
                  rows={6}
                  maxLength={4000}
                  placeholder="Décrivez votre situation et les éléments qui vous semblent utiles à l'examen."
                />
                <div className="mt-4">
                  <FormError>{formError}</FormError>
                </div>
                <div className="mt-4 flex gap-2">
                  <PrimaryButton onClick={submit} loading={sending}>Envoyer</PrimaryButton>
                </div>
                <p className="text-[12px] mt-3" style={{ color: "var(--text-dim)" }}>
                  Une seule contestation est possible par mesure. La décision vous sera communiquée
                  avec sa motivation.
                </p>
              </section>
            )}

            {contestable.length === 0 && sanctions.length > 0 && !selected && (
              <Callout tone="neutral">
                Toutes les mesures vous concernant ont déjà été contestées, levées, ou ne sont pas
                contestables.
              </Callout>
            )}
          </>
        )}

        <Callout tone="info">
          Le fonctionnement de la modération, les mesures possibles et la traçabilité des décisions
          sont décrits dans{" "}
          <Link to="/moderation" style={{ color: "var(--accent)" }}>Modération et recours</Link>.
          Aucun délai de réponse absolu n'est promis : chaque décision est motivée par écrit.
        </Callout>
      </div>
    </PageShell>
  );
}
