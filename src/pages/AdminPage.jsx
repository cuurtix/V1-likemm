/* =============================================================================
   LIKEMM — Panneau de modération (§22 / §23 / §25 / §29 / §32 / §45 / §50)
   =============================================================================
   IMPORTANT : cette page n'accorde AUCUN droit. Chaque action appelle une
   fonction RPC qui verifie le role dans la base. Un utilisateur qui forcerait
   l'affichage de cette page ne verrait que des erreurs « Action reservee a
   l'equipe de moderation » : le controle est cote serveur, jamais ici (§44).

   Chaque action exige une raison ecrite et est journalisee dans admin_actions.
   ========================================================================== */

import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Shield, Flag, Gavel, AlertTriangle, ScrollText, BarChart3, Search, RefreshCw,
} from "lucide-react";
import { PageShell, PageHero, SegmentedControl, StatBlock } from "../components/molecules.jsx";
import { Spinner, EmptyState, ErrorState, Callout } from "../components/atoms.jsx";
import {
  ModalShell, TextInput, TextArea, Select, PrimaryButton, SecondaryButton, FormError,
} from "../components/forms.jsx";
import { moderationService, SANCTION_TYPES, hasRole } from "../services/moderationService.js";
import { REPORT_CATEGORIES } from "../services/reportService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatDateTime, formatRelative, formatCount } from "../lib/format.js";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";

const TABS = [
  ["overview", "Aperçu"],
  ["reports", "Signalements"],
  ["appeals", "Contestations"],
  ["fraud", "Anti-fraude"],
  ["sanctions", "Sanctions"],
  ["log", "Journal"],
];

const categoryLabel = (value) =>
  REPORT_CATEGORIES.find((c) => c.value === value)?.label || value;

export default function AdminPage() {
  const { role } = useAuth();
  const [tab, setTab] = useState("overview");

  useEffect(() => { setPageMeta({ title: "Modération", path: "/admin", noindex: true }); }, []);

  const tabs = TABS.filter(([key]) =>
    ["overview", "log"].includes(key) ? hasRole(role, "admin") : true,
  );

  return (
    <PageShell
      wide
      hero={
        <PageHero
          eyebrow={`Rôle : ${role}`}
          title="Modération"
          subtitle="Toutes les actions sont journalisées et exigent une justification écrite."
        />
      }
    >
      <div className="overflow-x-auto -mx-1 px-1 pb-2 mb-6">
        <SegmentedControl value={tab} onChange={setTab} options={tabs} />
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "appeals" && <AppealsTab />}
      {tab === "fraud" && <FraudTab />}
      {tab === "sanctions" && <SanctionsTab />}
      {tab === "log" && <LogTab />}
    </PageShell>
  );
}

/* --------------------------------------------------------------------------
   Petit utilitaire de chargement
   -------------------------------------------------------------------------- */
function useLoader(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState({ data: null, loading: false, error: mapError(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

function Panel({ children, className = "" }) {
  return (
    <div
      className={`rounded-[18px] overflow-hidden ${className}`}
      style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
    >
      {children}
    </div>
  );
}

function Row({ children, last = false }) {
  return (
    <div
      className="px-4 py-3.5"
      style={{ borderBottom: last ? "none" : "1px solid var(--hairline)" }}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Aperçu — §12 des ameliorations et §50
   -------------------------------------------------------------------------- */
function OverviewTab() {
  const { data, loading, error, reload } = useLoader(() => moderationService.stats(30));
  const { showToast } = useToast();
  const [username, setUsername] = useState("");
  const [detail, setDetail] = useState(null);
  const [searching, setSearching] = useState(false);

  const lookup = async () => {
    if (!username.trim()) return;
    setSearching(true);
    try {
      setDetail(await moderationService.userDetail(username.trim()));
    } catch (e) {
      showToast(mapError(e), "error");
      setDetail(null);
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={22} /></div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const retention = data.retention || {};

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
            Chiffres du service
          </h2>
          <button
            type="button"
            onClick={reload}
            className="text-[13px] font-medium inline-flex items-center gap-1.5"
            style={{ color: "var(--accent)" }}
          >
            <RefreshCw size={13} strokeWidth={2.2} />
            Actualiser
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatBlock label="Comptes" value={formatCount(data.users_total)} sublabel={`${formatCount(data.users_listed)} classés`} />
          <StatBlock label="Inscriptions 30 j" value={formatCount(data.signups_window)} sublabel={`${formatCount(data.signups_today)} aujourd'hui`} />
          <StatBlock label="Likes" value={formatCount(data.likes_total)} sublabel={`${formatCount(data.likes_24h)} sur 24 h`} />
          <StatBlock label="Actifs 30 j" value={formatCount(data.active_users_window)} sublabel={`${formatCount(data.daily_active_users)} sur 24 h`} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
          <StatBlock
            label="Rétention D1"
            value={retention.d1?.rate != null ? `${retention.d1.rate} %` : "—"}
            sublabel={retention.d1?.cohort_size ? `${retention.d1.cohort_size} comptes` : "Cohorte vide"}
          />
          <StatBlock
            label="Rétention D7"
            value={retention.d7?.rate != null ? `${retention.d7.rate} %` : "—"}
            sublabel={retention.d7?.cohort_size ? `${retention.d7.cohort_size} comptes` : "Cohorte vide"}
          />
          <StatBlock
            label="Rétention D30"
            value={retention.d30?.rate != null ? `${retention.d30.rate} %` : "—"}
            sublabel={retention.d30?.cohort_size ? `${retention.d30.cohort_size} comptes` : "Cohorte vide"}
          />
          <StatBlock
            label="Taux d'activation"
            value={data.activation_rate != null ? `${data.activation_rate} %` : "—"}
            sublabel="Voir la note ci-dessous"
          />
        </div>

        {/* Honnetete de la mesure : on precise d'ou viennent les chiffres. */}
        <Callout tone="neutral" title="Lecture des chiffres">
          Les comptes, les likes, les inscriptions et la rétention proviennent directement des
          tables, sans dépendre du consentement à la mesure d'audience : ils sont exacts.
          {data.activation_note && <> {data.activation_note}</>}
        </Callout>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
          <StatBlock label="Signalements ouverts" value={formatCount(data.reports_pending)} />
          <StatBlock label="Contestations" value={formatCount(data.appeals_pending)} />
          <StatBlock label="Signaux de fraude" value={formatCount(data.fraud_signals_open)} />
          <StatBlock label="Demandes RGPD" value={formatCount(data.privacy_requests_pending)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
          <StatBlock label="Suspendus" value={formatCount(data.users_suspended)} />
          <StatBlock label="Bannis" value={formatCount(data.users_banned)} />
          <StatBlock label="Profils privés" value={formatCount(data.users_private)} />
          <StatBlock label="Inscrits via partage" value={formatCount(data.signups_from_share)} />
        </div>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold mb-3" style={{ color: "var(--text)" }}>
          Consulter un compte
        </h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <TextInput
              prefix="@"
              value={username}
              onChange={setUsername}
              placeholder="username"
              label="Nom d'utilisateur"
            />
          </div>
          <button
            type="button"
            onClick={lookup}
            className="h-12 px-5 rounded-full text-[14px] font-semibold inline-flex items-center gap-2 shrink-0"
            style={{ background: "var(--text)", color: "var(--bg)" }}
          >
            {searching ? <Spinner size={14} color="var(--bg)" /> : <Search size={15} strokeWidth={2.2} />}
            Voir
          </button>
        </div>

        {detail && <UserDetailCard detail={detail} onChanged={() => lookup()} />}
      </section>
    </div>
  );
}

function UserDetailCard({ detail, onChanged }) {
  const { role } = useAuth();
  const [action, setAction] = useState(null);

  return (
    <Panel className="mt-4">
      <Row>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
              @{detail.username}
            </p>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
              Statut : {detail.status} · Rôle : {detail.role} · Tranche d'âge :{" "}
              {detail.age_band || "non renseignée"}
            </p>
          </div>
          <Link to={`/@${detail.username}`} className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
            Voir le profil
          </Link>
        </div>
      </Row>

      <Row>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
          {[
            ["Likes reçus", formatCount(detail.likes_received)],
            ["Likes donnés", formatCount(detail.likes_given)],
            ["Reçus sur 24 h", formatCount(detail.likes_received_24h)],
            ["Rang", detail.rank_general != null ? `#${detail.rank_general}` : "—"],
            ["Signalements reçus", detail.reports_against],
            ["Signalements déposés", detail.reports_filed],
            ["Signaux de fraude ouverts", detail.open_fraud_signals],
            ["Changements de pseudo", detail.username_changes],
          ].map(([label, value]) => (
            <div key={label}>
              <p style={{ color: "var(--text-muted)" }}>{label}</p>
              <p className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>{value}</p>
            </div>
          ))}
        </div>
      </Row>

      {detail.sanctions?.length > 0 && (
        <Row>
          <p className="text-[13px] font-semibold mb-2" style={{ color: "var(--text)" }}>Sanctions</p>
          <div className="space-y-1.5">
            {detail.sanctions.map((s) => (
              <p key={s.id} className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                {s.type} · {s.reason}
                {s.revoked_at ? " · levée" : s.ends_at ? ` · jusqu'au ${formatDateTime(s.ends_at)}` : ""}
              </p>
            ))}
          </div>
        </Row>
      )}

      <Row last>
        <div className="flex flex-wrap gap-2">
          <ModButton onClick={() => setAction("sanction")}>Sanctionner</ModButton>
          <ModButton onClick={() => setAction("hide")}>
            {detail.hidden_by_moderation ? "Rendre visible" : "Masquer le profil"}
          </ModButton>
          <ModButton onClick={() => setAction("avatar")}>Supprimer la photo</ModButton>
          <ModButton onClick={() => setAction("bio")}>Vider la bio et les liens</ModButton>
          <ModButton onClick={() => setAction("likes")}>Retirer des likes frauduleux</ModButton>
          {hasRole(role, "owner") && <ModButton onClick={() => setAction("role")}>Changer le rôle</ModButton>}
        </div>
      </Row>

      {action && (
        <ModerationActionModal
          action={action}
          detail={detail}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); onChanged(); }}
        />
      )}
    </Panel>
  );
}

function ModButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 px-3.5 rounded-full text-[13px] font-medium"
      style={{ background: "var(--bg-elev-2)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Modale d'action — une raison ecrite est TOUJOURS exigee (§45)
   -------------------------------------------------------------------------- */
function ModerationActionModal({ action, detail, onClose, onDone }) {
  const { showToast } = useToast();
  const { role } = useAuth();

  const [reason, setReason] = useState("");
  const [rule, setRule] = useState("");
  const [type, setType] = useState("warning");
  const [days, setDays] = useState("7");
  const [direction, setDirection] = useState("received");
  const [hours, setHours] = useState("24");
  const [newRole, setNewRole] = useState("moderator");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const titles = {
    sanction: `Sanctionner @${detail.username}`,
    hide: detail.hidden_by_moderation ? `Rendre visible @${detail.username}` : `Masquer @${detail.username}`,
    avatar: `Supprimer la photo de @${detail.username}`,
    bio: `Vider la bio de @${detail.username}`,
    likes: `Retirer des likes de @${detail.username}`,
    role: `Rôle de @${detail.username}`,
  };

  const submit = async () => {
    setError(null);
    if (reason.trim().length < 3) return setError("Une raison écrite est obligatoire.");

    setBusy(true);
    try {
      switch (action) {
        case "sanction":
          await moderationService.sanction({
            username: detail.username,
            type,
            reason,
            ruleViolated: rule || null,
            durationDays: ["suspension", "limit"].includes(type) ? Number(days) : null,
          });
          break;
        case "hide":
          await moderationService.setProfileHidden(detail.username, !detail.hidden_by_moderation, reason);
          break;
        case "avatar":
          await moderationService.removeImage(detail.username, "avatar", reason);
          break;
        case "bio":
          await moderationService.clearBio(detail.username, reason);
          break;
        case "likes":
          await moderationService.removeFraudulentLikes({
            username: detail.username, direction, sinceHours: Number(hours), reason,
          });
          break;
        case "role":
          await moderationService.setRole(detail.username, newRole, reason);
          break;
        default:
          break;
      }
      showToast("Action effectuée et journalisée");
      onDone();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  const sanctionOptions = SANCTION_TYPES
    .filter((t) => !t.adminOnly || hasRole(role, "admin"))
    .map((t) => ({ value: t.value, label: t.label }));

  return (
    <ModalShell title={titles[action]} onClose={onClose}>
      <div className="space-y-4">
        {action === "sanction" && (
          <>
            <Select label="Type de mesure" value={type} onChange={setType} options={sanctionOptions} />
            {["suspension", "limit"].includes(type) && (
              <TextInput label="Durée (jours)" value={days} onChange={setDays} inputMode="numeric" />
            )}
            <TextInput
              label="Règle concernée (facultatif)"
              value={rule}
              onChange={setRule}
              placeholder="Ex. Règles communautaires 3.1"
            />
          </>
        )}

        {action === "likes" && (
          <>
            <Select
              label="Likes concernés"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "received", label: "Likes reçus" },
                { value: "given", label: "Likes donnés" },
                { value: "both", label: "Les deux" },
              ]}
            />
            <TextInput label="Période (heures en arrière)" value={hours} onChange={setHours} inputMode="numeric" />
            <Callout tone="warn">
              Les likes supprimés le sont définitivement et les classements sont recalculés.
            </Callout>
          </>
        )}

        {action === "role" && (
          <Select
            label="Nouveau rôle"
            value={newRole}
            onChange={setNewRole}
            options={[
              { value: "user", label: "Utilisateur" },
              { value: "moderator", label: "Modérateur" },
              { value: "admin", label: "Administrateur" },
            ]}
          />
        )}

        <TextArea
          label="Raison (obligatoire)"
          value={reason}
          onChange={setReason}
          rows={3}
          maxLength={2000}
          placeholder="Expliquez la décision. Cette justification est conservée."
        />

        <FormError>{error}</FormError>
        <PrimaryButton onClick={submit} loading={busy} danger={action === "sanction"}>
          Confirmer
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Signalements
   -------------------------------------------------------------------------- */
function ReportsTab() {
  const { showToast } = useToast();
  const [status, setStatus] = useState("pending");
  const { data, loading, error, reload } = useLoader(
    () => moderationService.listReports(status === "all" ? null : status, 50, 0),
    [status],
  );
  const [resolving, setResolving] = useState(null);

  return (
    <div>
      <div className="mb-5 overflow-x-auto pb-2">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          options={[["pending", "En attente"], ["reviewing", "En cours"], ["resolved", "Traités"], ["all", "Tous"]]}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={20} /></div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState icon={Flag} title="Aucun signalement" subtitle="Rien à examiner pour le moment." />
      ) : (
        <Panel>
          {data.map((r, i) => (
            <Row key={r.id} last={i === data.length - 1}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    @{r.target_username}
                    <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                      {" "}· {categoryLabel(r.category)}
                    </span>
                  </p>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    {r.description || "Aucune précision fournie."}
                  </p>
                  <p className="text-[12px] mt-1.5" style={{ color: "var(--text-dim)" }}>
                    Signalé par @{r.reporter_username || "compte supprimé"} · {formatRelative(r.created_at)} ·
                    {" "}{r.target_reports_count} signalement{r.target_reports_count > 1 ? "s" : ""} au total sur ce compte
                    {" "}· statut du compte : {r.target_status}
                  </p>
                  {r.resolution_note && (
                    <p className="text-[12px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                      Décision : {r.resolution_note}
                    </p>
                  )}
                </div>
                {["pending", "reviewing"].includes(r.status) && (
                  <button
                    type="button"
                    onClick={() => setResolving(r)}
                    className="h-9 px-3.5 rounded-full text-[13px] font-medium shrink-0"
                    style={{ background: "var(--bg-elev-2)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
                  >
                    Traiter
                  </button>
                )}
              </div>
            </Row>
          ))}
        </Panel>
      )}

      {resolving && (
        <ResolveReportModal
          report={resolving}
          onClose={() => setResolving(null)}
          onDone={() => { setResolving(null); reload(); showToast("Signalement traité"); }}
        />
      )}
    </div>
  );
}

function ResolveReportModal({ report, onClose, onDone }) {
  const [status, setStatus] = useState("resolved");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (note.trim().length < 3) return setError("Une justification est obligatoire.");
    setBusy(true);
    try {
      await moderationService.resolveReport(report.id, status, note);
      onDone();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Traiter le signalement" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Cible : <strong style={{ color: "var(--text)" }}>@{report.target_username}</strong> ·{" "}
          {categoryLabel(report.category)}
        </p>
        <Select
          label="Décision"
          value={status}
          onChange={setStatus}
          options={[
            { value: "reviewing", label: "Mettre en cours d'examen" },
            { value: "resolved", label: "Traité — mesure prise ou situation réglée" },
            { value: "rejected", label: "Rejeté — aucun manquement constaté" },
          ]}
        />
        <TextArea
          label="Justification (obligatoire)"
          value={note}
          onChange={setNote}
          rows={3}
          maxLength={2000}
        />
        <FormError>{error}</FormError>
        <PrimaryButton onClick={submit} loading={busy}>Enregistrer la décision</PrimaryButton>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Contestations
   -------------------------------------------------------------------------- */
function AppealsTab() {
  const { showToast } = useToast();
  const [status, setStatus] = useState("pending");
  const { data, loading, error, reload } = useLoader(
    () => moderationService.listAppeals(status === "all" ? null : status, 50, 0),
    [status],
  );
  const [deciding, setDeciding] = useState(null);

  return (
    <div>
      <div className="mb-5 overflow-x-auto pb-2">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          options={[["pending", "En attente"], ["reviewing", "En cours"], ["all", "Toutes"]]}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={20} /></div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState icon={Gavel} title="Aucune contestation" subtitle="Rien à examiner pour le moment." />
      ) : (
        <Panel>
          {data.map((a, i) => (
            <Row key={a.id} last={i === data.length - 1}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    @{a.username}
                    <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                      {" "}· conteste : {a.sanction_type}
                    </span>
                  </p>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>{a.message}</p>
                  <p className="text-[12px] mt-1.5" style={{ color: "var(--text-dim)" }}>
                    Sanction : {a.sanction_reason}
                    {a.sanction_rule ? ` (${a.sanction_rule})` : ""} · {formatRelative(a.created_at)}
                    {a.sanction_revoked ? " · sanction déjà levée" : ""}
                  </p>
                  {a.decision && (
                    <p className="text-[12px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                      Décision : {a.decision}
                    </p>
                  )}
                </div>
                {["pending", "reviewing"].includes(a.status) && (
                  <button
                    type="button"
                    onClick={() => setDeciding(a)}
                    className="h-9 px-3.5 rounded-full text-[13px] font-medium shrink-0"
                    style={{ background: "var(--bg-elev-2)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
                  >
                    Décider
                  </button>
                )}
              </div>
            </Row>
          ))}
        </Panel>
      )}

      {deciding && (
        <DecideAppealModal
          appeal={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); reload(); showToast("Décision enregistrée"); }}
        />
      )}
    </div>
  );
}

function DecideAppealModal({ appeal, onClose, onDone }) {
  const [status, setStatus] = useState("accepted");
  const [decision, setDecision] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (decision.trim().length < 3) return setError("Une décision écrite est obligatoire.");
    setBusy(true);
    try {
      await moderationService.decideAppeal(appeal.id, status, decision);
      onDone();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`Contestation de @${appeal.username}`} onClose={onClose}>
      <div className="space-y-4">
        <Select
          label="Décision"
          value={status}
          onChange={setStatus}
          options={[
            { value: "reviewing", label: "Mettre en cours d'examen" },
            { value: "accepted", label: "Accepter — la sanction sera levée" },
            { value: "rejected", label: "Rejeter — la sanction est maintenue" },
          ]}
        />
        <TextArea
          label="Motivation communiquée à l'utilisateur"
          value={decision}
          onChange={setDecision}
          rows={4}
          maxLength={2000}
        />
        <FormError>{error}</FormError>
        <PrimaryButton onClick={submit} loading={busy}>Enregistrer</PrimaryButton>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Anti-fraude — §29 : des signaux, jamais des verdicts automatiques
   -------------------------------------------------------------------------- */
function FraudTab() {
  const { showToast } = useToast();
  const [onlyOpen, setOnlyOpen] = useState("open");
  const { data, loading, error, reload } = useLoader(
    () => moderationService.listFraudSignals(onlyOpen === "open", 50, 0),
    [onlyOpen],
  );

  const review = async (signal, outcome) => {
    try {
      await moderationService.reviewFraudSignal(signal.id, outcome);
      showToast(outcome === "confirmed" ? "Signal confirmé" : "Signal écarté");
      reload();
    } catch (e) {
      showToast(mapError(e), "error");
    }
  };

  return (
    <div>
      <div className="mb-5 overflow-x-auto pb-2">
        <SegmentedControl
          value={onlyOpen}
          onChange={setOnlyOpen}
          options={[["open", "Non examinés"], ["all", "Tous"]]}
        />
      </div>

      <Callout tone="warn" title="Un signal n'est pas une preuve">
        Un signal isolé ne justifie aucune sanction. L'adresse IP peut être partagée entre plusieurs
        personnes. Croisez toujours plusieurs éléments avant de décider.
      </Callout>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={20} /></div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Aucun signal"
          subtitle="Aucun comportement suspect n'a été détecté. Rien n'est affiché sans détection réelle."
        />
      ) : (
        <Panel>
          {data.map((s, i) => (
            <Row key={s.id} last={i === data.length - 1}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    {s.username ? `@${s.username}` : "Signal global (aucun compte désigné)"}
                    <span className="font-normal" style={{ color: "var(--text-muted)" }}> · {s.signal_type}</span>
                  </p>
                  <p className="text-[13px] mt-1 font-mono" style={{ color: "var(--text-secondary)" }}>
                    {JSON.stringify(s.details)}
                  </p>
                  <p className="text-[12px] mt-1.5" style={{ color: "var(--text-dim)" }}>
                    Gravité {s.severity}/5 · {formatRelative(s.detected_at)} ·{" "}
                    {s.other_signals} autre{s.other_signals > 1 ? "s" : ""} signal
                    {s.other_signals > 1 ? "s" : ""} sur ce compte
                    {s.review_outcome ? ` · examiné : ${s.review_outcome}` : ""}
                  </p>
                </div>
                {!s.review_outcome && (
                  <div className="flex gap-2 shrink-0">
                    <ModButton onClick={() => review(s, "dismissed")}>Écarter</ModButton>
                    <ModButton onClick={() => review(s, "confirmed")}>Confirmer</ModButton>
                  </div>
                )}
              </div>
            </Row>
          ))}
        </Panel>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Sanctions
   -------------------------------------------------------------------------- */
function SanctionsTab() {
  const { showToast } = useToast();
  const [activeOnly, setActiveOnly] = useState("active");
  const { data, loading, error, reload } = useLoader(
    () => moderationService.listSanctions(activeOnly === "active", 50, 0),
    [activeOnly],
  );
  const [lifting, setLifting] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <div className="mb-5 overflow-x-auto pb-2">
        <SegmentedControl
          value={activeOnly}
          onChange={setActiveOnly}
          options={[["active", "En cours"], ["all", "Toutes"]]}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={20} /></div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState icon={Shield} title="Aucune sanction" subtitle="Aucune mesure n'est en cours." />
      ) : (
        <Panel>
          {data.map((s, i) => (
            <Row key={s.id} last={i === data.length - 1}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    @{s.username}
                    <span className="font-normal" style={{ color: "var(--text-muted)" }}> · {s.type}</span>
                  </p>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>{s.reason}</p>
                  <p className="text-[12px] mt-1.5" style={{ color: "var(--text-dim)" }}>
                    {s.rule_violated ? `${s.rule_violated} · ` : ""}
                    Par @{s.issued_by_username || "—"} · depuis {formatDateTime(s.starts_at)}
                    {s.ends_at ? ` · jusqu'au ${formatDateTime(s.ends_at)}` : " · sans date de fin"}
                    {s.revoked_at ? ` · levée le ${formatDateTime(s.revoked_at)}` : ""}
                    {s.appeal_status ? ` · contestation : ${s.appeal_status}` : ""}
                  </p>
                </div>
                {!s.revoked_at && (
                  <button
                    type="button"
                    onClick={() => { setLifting(s); setReason(""); }}
                    className="h-9 px-3.5 rounded-full text-[13px] font-medium shrink-0"
                    style={{ background: "var(--bg-elev-2)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
                  >
                    Lever
                  </button>
                )}
              </div>
            </Row>
          ))}
        </Panel>
      )}

      {lifting && (
        <ModalShell title={`Lever la sanction de @${lifting.username}`} onClose={() => setLifting(null)}>
          <div className="space-y-4">
            <TextArea
              label="Raison (obligatoire)"
              value={reason}
              onChange={setReason}
              rows={3}
              maxLength={2000}
            />
            <PrimaryButton
              loading={busy}
              onClick={async () => {
                if (reason.trim().length < 3) return;
                setBusy(true);
                try {
                  await moderationService.liftSanction(lifting.id, reason);
                  showToast("Sanction levée");
                  setLifting(null);
                  reload();
                } catch (e) {
                  showToast(mapError(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Lever la sanction
            </PrimaryButton>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Journal administratif (§23)
   -------------------------------------------------------------------------- */
function LogTab() {
  const { data, loading, error, reload } = useLoader(() => moderationService.listAdminActions(80, 0));

  if (loading) return <div className="flex justify-center py-16"><Spinner size={20} /></div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data.length) {
    return <EmptyState icon={ScrollText} title="Journal vide" subtitle="Aucune action administrative n'a encore été effectuée." />;
  }

  return (
    <Panel>
      {data.map((a, i) => (
        <Row key={a.id} last={i === data.length - 1}>
          <p className="text-[14px]" style={{ color: "var(--text)" }}>
            <strong>@{a.admin_username || "—"}</strong> · {a.action}
            {a.target_username ? ` · sur @${a.target_username}` : ""}
          </p>
          {a.reason && (
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>{a.reason}</p>
          )}
          <p className="text-[12px] mt-1" style={{ color: "var(--text-dim)" }}>
            {formatDateTime(a.created_at)}
          </p>
        </Row>
      ))}
    </Panel>
  );
}
