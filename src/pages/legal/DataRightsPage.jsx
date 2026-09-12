/* =============================================================================
   LIKEMM — /data-rights : exercice des droits et export (§14 / §31 / §35)
   ========================================================================== */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Database, Cookie, Trash2 } from "lucide-react";
import { PageShell, PageHero } from "../../components/molecules.jsx";
import { Callout, EmptyState, Spinner } from "../../components/atoms.jsx";
import { Select, TextArea, PrimaryButton, SecondaryButton, FormError, SettingsGroup, SettingRow } from "../../components/forms.jsx";
import { privacyService, PRIVACY_REQUEST_TYPES } from "../../services/privacyService.js";
import { analyticsService, EVENTS } from "../../services/analyticsService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useConsent } from "../../context/ConsentContext.jsx";
import { formatDateTime } from "../../lib/format.js";
import { mapError } from "../../lib/errors.js";
import { setPageMeta } from "../../lib/seo.js";
import { CONTACT_EMAIL } from "../../lib/config.js";

const REQUEST_STATUS = {
  pending: "En attente",
  in_progress: "En cours de traitement",
  completed: "Traitée",
  refused: "Refusée",
};

export default function DataRightsPage() {
  const { isAuthenticated, profile } = useAuth();
  const { showToast } = useToast();
  const { openPanel } = useConsent();

  const [exporting, setExporting] = useState(false);
  const [requests, setRequests] = useState(null);
  const [type, setType] = useState("access");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setPageMeta({
      title: "Mes données et mes droits",
      description: "Accéder, corriger, exporter, effacer vos données, ou retirer un consentement.",
      path: "/data-rights",
      noindex: true,
    });
  }, []);

  const loadRequests = async () => {
    try {
      setRequests(await privacyService.getMyRequests());
    } catch {
      setRequests([]);
    }
  };

  useEffect(() => { if (isAuthenticated) loadRequests(); }, [isAuthenticated]);

  const exportData = async () => {
    setExporting(true);
    try {
      const payload = await privacyService.exportMyData();
      privacyService.downloadExport(payload, profile?.username);
      analyticsService.trackEvent(EVENTS.DATA_EXPORT_REQUESTED);
      showToast("Export téléchargé");
      loadRequests();
    } catch (e) {
      showToast(mapError(e), "error");
    } finally {
      setExporting(false);
    }
  };

  const submitRequest = async () => {
    setError(null);
    setSending(true);
    try {
      await privacyService.createRequest({ type, message });
      setMessage("");
      showToast("Demande enregistrée");
      loadRequests();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <PageShell hero={<PageHero title="Mes données et mes droits" />}>
        <EmptyState
          icon={Database}
          title="Connectez-vous pour accéder à vos données"
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
          title="Mes données et mes droits"
          subtitle="Consulter, exporter, corriger, effacer, ou retirer un consentement."
        />
      }
    >
      <div className="max-w-lg space-y-10">
        {/* --- Export immediat (§31 / §35) --------------------------------- */}
        <section>
          <h2 className="text-[18px] font-semibold mb-2" style={{ color: "var(--text)" }}>
            Télécharger mes données
          </h2>
          <p className="text-[14px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
            Un fichier JSON contenant votre compte, votre profil, vos paramètres, vos likes donnés et
            reçus, votre historique de classement, vos notifications, vos consentements, vos
            signalements et les mesures vous concernant.
          </p>
          <PrimaryButton onClick={exportData} loading={exporting}>
            <Download size={15} strokeWidth={2.2} />
            Télécharger mes données (JSON)
          </PrimaryButton>
          <Callout tone="neutral" title="Ce que l'export ne contient pas">
            Les journaux techniques de sécurité, les signaux d'anti-fraude, les notes internes de
            modération, les données personnelles concernant d'autres utilisateurs, et tout élément
            susceptible de compromettre la sécurité du service. Le fichier le précise explicitement.
          </Callout>
        </section>

        {/* --- Actions directes ------------------------------------------- */}
        <section>
          <h2 className="text-[18px] font-semibold mb-3" style={{ color: "var(--text)" }}>
            Actions immédiates
          </h2>
          <SettingsGroup>
            <SettingRow
              icon={Cookie}
              label="Gérer mes consentements"
              sublabel="Mesure d'audience, personnalisation, publicité"
              onClick={openPanel}
            />
            <SettingRow
              icon={Trash2}
              label="Supprimer mon compte"
              sublabel="Suppression définitive de mon profil et de mes données"
              href="/account-deletion"
              danger
              last
            />
          </SettingsGroup>
        </section>

        {/* --- Demande formelle -------------------------------------------- */}
        <section>
          <h2 className="text-[18px] font-semibold mb-2" style={{ color: "var(--text)" }}>
            Adresser une demande
          </h2>
          <p className="text-[14px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
            Pour une rectification, une limitation, une opposition ou toute autre demande relative à
            vos données.
          </p>
          <div className="space-y-4">
            <Select
              label="Type de demande"
              value={type}
              onChange={setType}
              options={PRIVACY_REQUEST_TYPES}
            />
            <TextArea
              label="Précisions"
              value={message}
              onChange={setMessage}
              rows={4}
              maxLength={2000}
              placeholder="Décrivez votre demande."
            />
            <FormError>{error}</FormError>
            <PrimaryButton onClick={submitRequest} loading={sending}>Envoyer ma demande</PrimaryButton>
          </div>
          <Callout tone="info">
            L'étendue de chaque droit et le délai de réponse dépendent du fondement juridique du
            traitement et de la nature de la demande. Aucun délai absolu n'est promis : votre demande
            est enregistrée, traitée, et la réponse est motivée.
          </Callout>
        </section>

        {/* --- Historique --------------------------------------------------- */}
        <section>
          <h2 className="text-[18px] font-semibold mb-3" style={{ color: "var(--text)" }}>
            Mes demandes
          </h2>
          {requests === null ? (
            <div className="flex justify-center py-8"><Spinner size={18} /></div>
          ) : requests.length === 0 ? (
            <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
              Vous n'avez encore adressé aucune demande.
            </p>
          ) : (
            <div
              className="rounded-[18px] overflow-hidden"
              style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
            >
              {requests.map((r, i) => (
                <div
                  key={r.id}
                  className="px-4 py-3.5"
                  style={{ borderBottom: i === requests.length - 1 ? "none" : "1px solid var(--hairline)" }}
                >
                  <p className="text-[14px] font-medium" style={{ color: "var(--text)" }}>
                    {PRIVACY_REQUEST_TYPES.find((t) => t.value === r.type)?.label || r.type}
                    <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                      {" "}· {REQUEST_STATUS[r.status] || r.status}
                    </span>
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: "var(--text-dim)" }}>
                    {formatDateTime(r.created_at)}
                    {r.handled_at ? ` · traitée le ${formatDateTime(r.handled_at)}` : ""}
                  </p>
                  {r.response_note && (
                    <p className="text-[13px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
                      {r.response_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Le détail des traitements figure dans la{" "}
          <Link to="/privacy" style={{ color: "var(--accent)" }}>politique de confidentialité</Link>.
          Vous pouvez aussi écrire à{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>{CONTACT_EMAIL}</a>.
        </p>
      </div>
    </PageShell>
  );
}
