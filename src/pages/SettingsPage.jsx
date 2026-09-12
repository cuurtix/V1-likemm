/* =============================================================================
   LIKEMM — Paramètres (§20 / §21 / §32 / §42 / §46)
   =============================================================================
   Sections : Compte · Profil · Confidentialité · Notifications · Données ·
   Apparence. Chaque interrupteur ecrit reellement en base : rien n'est
   purement decoratif (§21 : « Cette option doit etre reelle et enregistree en
   base »).

   §46 : la suppression de compte n'est ni cachee ni rendue difficile. Elle est
   accessible en deux clics depuis cette page.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AtSign, Mail, Lock, Shield, Bell, Heart, TrendingUp, Trash2, LogOut, Sun, Moon,
  Database, Cookie, Link2, Eye, EyeOff, Ban, Copy, Info, FileText,
} from "lucide-react";
import { PageShell, PageHero } from "../components/molecules.jsx";
import { Spinner, Callout, EmptyState, ErrorState, UserAvatar } from "../components/atoms.jsx";
import {
  SettingsGroup, SettingRow, Switch, ModalShell, TextInput, PasswordInput,
  PrimaryButton, SecondaryButton, FormError, PasswordStrengthBar,
} from "../components/forms.jsx";
import { ConfirmDialog } from "../components/dialogs.jsx";
import { profileService } from "../services/profileService.js";
import { authService } from "../services/authService.js";
import { blockService } from "../services/blockService.js";
import { shareService } from "../services/shareService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useConsent } from "../context/ConsentContext.jsx";
import { normalizeUsername, usernameFormatError, isEmailValid, passwordStrength, passwordError } from "../lib/validation.js";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";
import { formatDate } from "../lib/format.js";
import { CONTACT_EMAIL } from "../lib/config.js";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { profile, profileError, user, patchProfile, refreshProfile, signOut, isMinor } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const { openPanel } = useConsent();

  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(null);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => { setPageMeta({ title: "Paramètres", path: "/settings", noindex: true }); }, []);

  // Le profil n'a pas pu etre charge (fonction get_me absente, base
  // injoignable, session expiree...). On AFFICHE la raison : une page qui
  // tourne indefiniment ne dit rien a l'utilisateur et ne dit rien non plus
  // au developpeur.
  if (profileError) {
    return (
      <PageShell>
        <ErrorState message={mapError(profileError)} onRetry={refreshProfile} />
      </PageShell>
    );
  }

  if (!profile) {
    return <PageShell><div className="flex justify-center py-32"><Spinner size={22} /></div></PageShell>;
  }

  /** Ecrit reellement en base, puis met a jour l'interface sur le resultat. */
  const toggleProfileFlag = async (field, value) => {
    setSaving(field);
    try {
      await profileService.updateProfile({ [field]: value });
      patchProfile({ [field]: value });
    } catch (e) {
      showToast(mapError(e), "error");
    } finally {
      setSaving(null);
    }
  };

  const toggleNotification = async (field, value) => {
    setSaving(field);
    try {
      await profileService.updateNotificationPreferences({ [field]: value });
      patchProfile({ [field]: value });
    } catch (e) {
      showToast(mapError(e), "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <PageShell hero={<PageHero title="Paramètres" subtitle="Votre compte, votre profil et vos données." />}>
      <div className="max-w-lg">
        {/* ---------------------------------------------------------------- */}
        <SettingsGroup title="Compte" icon={AtSign}>
          <SettingRow
            icon={AtSign}
            label="Nom d'utilisateur"
            sublabel={`@${profile.username}`}
            onClick={() => setModal("username")}
          />
          <SettingRow
            icon={Mail}
            label="Adresse email"
            sublabel={user?.email || "—"}
            onClick={() => setModal("email")}
          />
          <SettingRow
            icon={Lock}
            label="Mot de passe"
            sublabel="Modifier votre mot de passe"
            onClick={() => setModal("password")}
            last
          />
        </SettingsGroup>

        {/* ---------------------------------------------------------------- */}
        <SettingsGroup
          title="Confidentialité"
          icon={Shield}
          description={
            isMinor
              ? "Votre compte bénéficie de protections renforcées : profil privé par défaut et publicité ciblée désactivée."
              : undefined
          }
        >
          <SettingRow
            icon={profile.is_private ? EyeOff : Eye}
            label="Profil privé"
            sublabel={
              profile.is_private
                ? "Visible uniquement par vous et via un lien d'invitation"
                : "Visible par tous, apparaît au classement public"
            }
            chevron={false}
            right={
              saving === "is_private" ? <Spinner size={16} /> : (
                <Switch
                  value={profile.is_private}
                  onChange={(v) => toggleProfileFlag("is_private", v)}
                  label="Profil privé"
                />
              )
            }
          />
          <SettingRow
            icon={Heart}
            label="Masquer mes likes"
            sublabel="Les autres ne voient pas que c'est vous qui les avez likés. Le like compte quand même."
            chevron={false}
            right={
              saving === "hide_likes" ? <Spinner size={16} /> : (
                <Switch
                  value={profile.hide_likes}
                  onChange={(v) => toggleProfileFlag("hide_likes", v)}
                  label="Masquer mes likes"
                />
              )
            }
          />
          <SettingRow
            icon={Link2}
            label="Liens d'accès privés"
            sublabel="Créer ou révoquer les liens vers votre profil privé"
            onClick={() => setModal("links")}
          />
          <SettingRow
            icon={Ban}
            label="Comptes bloqués"
            sublabel="Gérer la liste des personnes bloquées"
            onClick={() => setModal("blocks")}
            last
          />
        </SettingsGroup>

        {/* ---------------------------------------------------------------- */}
        <SettingsGroup title="Notifications" icon={Bell}>
          <SettingRow
            icon={Heart}
            label="Nouveaux likes"
            sublabel="Être prévenu quand quelqu'un vous like"
            chevron={false}
            right={
              saving === "notify_likes" ? <Spinner size={16} /> : (
                <Switch
                  value={profile.notify_likes !== false}
                  onChange={(v) => toggleNotification("notify_likes", v)}
                  label="Notifications de likes"
                />
              )
            }
          />
          <SettingRow
            icon={TrendingUp}
            label="Changements de classement"
            sublabel="Progression, dépassement, paliers franchis"
            chevron={false}
            right={
              saving === "notify_rank" ? <Spinner size={16} /> : (
                <Switch
                  value={profile.notify_rank !== false}
                  onChange={(v) => toggleNotification("notify_rank", v)}
                  label="Notifications de classement"
                />
              )
            }
          />
          <SettingRow
            icon={Shield}
            label="Emails de sécurité"
            sublabel="Connexion inhabituelle, changement de mot de passe"
            chevron={false}
            right={
              saving === "notify_email_security" ? <Spinner size={16} /> : (
                <Switch
                  value={profile.notify_email_security !== false}
                  onChange={(v) => toggleNotification("notify_email_security", v)}
                  label="Emails de sécurité"
                />
              )
            }
          />
          <SettingRow
            icon={Mail}
            label="Emails d'actualités"
            sublabel="Nouveautés et conseils. Désactivé par défaut."
            chevron={false}
            last
            right={
              saving === "notify_email_marketing" ? <Spinner size={16} /> : (
                <Switch
                  value={profile.notify_email_marketing === true}
                  onChange={(v) => toggleNotification("notify_email_marketing", v)}
                  label="Emails d'actualités"
                />
              )
            }
          />
        </SettingsGroup>

        {/* ---------------------------------------------------------------- */}
        <SettingsGroup title="Mes données" icon={Database}>
          <SettingRow
            icon={Database}
            label="Mes données et mes droits"
            sublabel="Télécharger mes données, exercer mes droits"
            onClick={() => navigate("/data-rights")}
          />
          <SettingRow
            icon={Cookie}
            label="Préférences cookies"
            sublabel="Mesure d'audience, personnalisation, publicité"
            onClick={openPanel}
          />
          <SettingRow
            icon={FileText}
            label="Documents juridiques"
            sublabel="CGU, confidentialité, règles communautaires"
            onClick={() => navigate("/legal")}
            last
          />
        </SettingsGroup>

        {/* ---------------------------------------------------------------- */}
        <SettingsGroup title="Apparence" icon={theme === "dark" ? Moon : Sun}>
          <SettingRow
            icon={theme === "dark" ? Moon : Sun}
            label="Thème"
            sublabel={theme === "dark" ? "Sombre" : "Clair"}
            chevron={false}
            last
            right={
              <div
                className="flex gap-0.5 rounded-full p-0.5"
                style={{ background: "var(--bg-elev-2)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
              >
                {[["light", "Clair"], ["dark", "Sombre"]].map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setTheme(k); }}
                    className="px-3 py-1 rounded-full text-[12px] font-semibold"
                    style={{
                      background: theme === k ? "var(--bg-elev-1)" : "transparent",
                      color: theme === k ? "var(--text)" : "var(--text-muted)",
                      boxShadow: theme === k ? "0 1px 3px rgba(0,0,0,0.10), inset 0 0 0 1px var(--hairline)" : "none",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            }
          />
        </SettingsGroup>

        {/* ---------------------------------------------------------------- */}
        <SettingsGroup title="Aide" icon={Info}>
          <SettingRow icon={Info} label="Signaler un problème" onClick={() => navigate("/report")} />
          <SettingRow icon={Shield} label="Contester une décision de modération" onClick={() => navigate("/appeal")} />
          <SettingRow icon={Mail} label="Contact" sublabel={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} last />
        </SettingsGroup>

        <SettingsGroup>
          <SettingRow icon={LogOut} label="Se déconnecter" onClick={() => setLogoutOpen(true)} danger />
          <SettingRow
            icon={Trash2}
            label="Supprimer mon compte"
            sublabel="Suppression définitive de votre profil et de vos données"
            onClick={() => navigate("/account-deletion")}
            danger
            last
          />
        </SettingsGroup>

        <p className="text-center text-[12px] pt-2 pb-8" style={{ color: "var(--text-dim)" }}>
          Compte créé le {formatDate(profile.created_at)}
        </p>
      </div>

      {modal === "username" && (
        <ChangeUsernameModal
          current={profile.username}
          lastChange={profile.username_changed_at}
          onClose={() => setModal(null)}
          onSaved={(u) => { patchProfile({ username: u }); refreshProfile(); }}
        />
      )}
      {modal === "email" && (
        <ChangeEmailModal current={user?.email} onClose={() => setModal(null)} />
      )}
      {modal === "password" && <ChangePasswordModal onClose={() => setModal(null)} />}
      {modal === "links" && <PrivateLinksModal username={profile.username} onClose={() => setModal(null)} />}
      {modal === "blocks" && <BlockedAccountsModal onClose={() => setModal(null)} />}

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={async () => { await signOut(); navigate("/login", { replace: true }); }}
        title="Se déconnecter"
        message="Vous devrez vous reconnecter pour accéder à votre compte."
        confirmLabel="Se déconnecter"
      />
    </PageShell>
  );
}

/* --------------------------------------------------------------------------
   Changement de nom d'utilisateur (§5 / §6)
   -------------------------------------------------------------------------- */
function ChangeUsernameModal({ current, lastChange, onClose, onSaved }) {
  const { showToast } = useToast();
  const [value, setValue] = useState(current);
  const [availability, setAvailability] = useState({ state: "idle", reason: null });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (value === current) { setAvailability({ state: "idle", reason: null }); return undefined; }
    const problem = usernameFormatError(value);
    if (problem) { setAvailability({ state: "invalid", reason: problem }); return undefined; }
    setAvailability({ state: "checking", reason: null });
    const timer = setTimeout(async () => {
      try {
        const result = await profileService.checkUsername(value);
        setAvailability(result.available ? { state: "available", reason: null } : { state: "taken", reason: result.reason });
      } catch {
        setAvailability({ state: "idle", reason: null });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [value, current]);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await profileService.updateUsername(value);
      onSaved(result.username);
      showToast("Nom d'utilisateur mis à jour");
      onClose();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Nom d'utilisateur" onClose={onClose}>
      <div className="space-y-5">
        <TextInput
          label="Nouveau nom d'utilisateur"
          prefix="@"
          value={value}
          onChange={(v) => { setValue(normalizeUsername(v)); setError(null); }}
          placeholder="username"
          maxLength={20}
          autoFocus
          error={["invalid", "taken"].includes(availability.state) ? availability.reason : null}
          hint={availability.state === "available" ? "✓ Disponible" : "Votre identifiant public et l'adresse de votre profil."}
        />

        <Callout tone="neutral">
          Changer de nom d'utilisateur <strong>modifie l'adresse de votre profil</strong> : les liens
          déjà partagés ne fonctionneront plus. Deux changements sont possibles par période de
          30 jours.
          {lastChange && <> Dernier changement : {formatDate(lastChange)}.</>}
        </Callout>

        <FormError>{error}</FormError>
        <PrimaryButton onClick={save} loading={saving} disabled={availability.state !== "available"}>
          Enregistrer
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Changement d'email (§4)
   -------------------------------------------------------------------------- */
function ChangeEmailModal({ current, onClose }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  const save = async () => {
    setError(null);
    if (!isEmailValid(value)) return setError("Entrez une adresse email valide.");
    if (value.trim().toLowerCase() === String(current || "").toLowerCase()) {
      return setError("C'est déjà votre adresse actuelle.");
    }
    setSaving(true);
    try {
      await authService.updateEmail(value);
      setSent(true);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Adresse email" onClose={onClose}>
      {sent ? (
        // §26 : on ne dit pas « email modifie » : il ne l'est pas encore.
        <Callout tone="info" title="Confirmation requise">
          Un lien de confirmation a été envoyé à <strong>{value}</strong>. Votre adresse ne sera
          modifiée qu'une fois ce lien ouvert.
        </Callout>
      ) : (
        <div className="space-y-5">
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Adresse actuelle : <strong style={{ color: "var(--text)" }}>{current}</strong>
          </p>
          <TextInput
            label="Nouvelle adresse email"
            value={value}
            onChange={(v) => { setValue(v); setError(null); }}
            placeholder="vous@exemple.com"
            type="email"
            autoFocus
          />
          <FormError>{error}</FormError>
          <PrimaryButton onClick={save} loading={saving}>Envoyer le lien de confirmation</PrimaryButton>
        </div>
      )}
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Changement de mot de passe
   -------------------------------------------------------------------------- */
function ChangePasswordModal({ onClose }) {
  const { showToast } = useToast();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const strength = passwordStrength(next);

  const submit = async () => {
    setError(null);
    const problem = passwordError(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("Les mots de passe ne correspondent pas.");

    setSaving(true);
    try {
      await authService.updatePassword(next);
      showToast("Mot de passe mis à jour");
      onClose();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Mot de passe" onClose={onClose}>
      <div className="space-y-5">
        <PasswordInput
          label="Nouveau mot de passe" value={next}
          onChange={(v) => { setNext(v); setError(null); }}
          placeholder="8 caractères minimum" autoComplete="new-password" autoFocus
        />
        {next && <PasswordStrengthBar strength={strength} />}
        <PasswordInput
          label="Confirmer" value={confirm}
          onChange={(v) => { setConfirm(v); setError(null); }}
          placeholder="Retapez le mot de passe" autoComplete="new-password"
          error={confirm && next !== confirm ? "Ne correspond pas." : null}
        />
        <FormError>{error}</FormError>
        <PrimaryButton onClick={submit} loading={saving}>Mettre à jour</PrimaryButton>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Liens d'acces prive (§32)
   -------------------------------------------------------------------------- */
function PrivateLinksModal({ username, onClose }) {
  const { showToast } = useToast();
  const [links, setLinks] = useState(null);
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setLinks(await profileService.listPrivateLinks());
    } catch (e) {
      setError(mapError(e));
      setLinks([]);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await profileService.createPrivateLink(null);
      setFreshToken(result.token);
      await load();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setCreating(false);
    }
  };

  const revokeAll = async () => {
    try {
      await profileService.revokePrivateLinks(null);
      setFreshToken(null);
      await load();
      showToast("Tous les liens privés ont été révoqués");
    } catch (e) {
      setError(mapError(e));
    }
  };

  const freshUrl = freshToken ? shareService.privateProfileUrl(username, freshToken) : null;

  return (
    <ModalShell title="Liens d'accès privés" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Un lien privé permet à une personne d'accéder à votre profil même s'il est privé. Chaque
          lien est un jeton aléatoire, révocable à tout moment.
        </p>

        {freshUrl && (
          <div
            className="rounded-[14px] p-4"
            style={{ background: "var(--accent-soft)", boxShadow: "inset 0 0 0 1px var(--accent-ring)" }}
          >
            <p className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              Copiez ce lien maintenant
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
              Il ne sera plus affiché : seule son empreinte est conservée.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={freshUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 bg-transparent outline-none text-[12px]"
                style={{ color: "var(--text)" }}
                aria-label="Lien privé"
              />
              <button
                type="button"
                onClick={async () => {
                  const ok = await shareService.copyLink(freshUrl, { context: "private_link" });
                  showToast(ok ? "Lien copié" : "La copie a échoué.", ok ? "success" : "error");
                }}
                className="shrink-0 px-3 h-8 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5"
                style={{ background: "var(--text)", color: "var(--bg)" }}
              >
                <Copy size={12} strokeWidth={2.4} />
                Copier
              </button>
            </div>
          </div>
        )}

        {links === null ? (
          <div className="flex justify-center py-6"><Spinner size={18} /></div>
        ) : links.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Aucun lien privé actif.
          </p>
        ) : (
          <div
            className="rounded-[14px] overflow-hidden"
            style={{ background: "var(--bg-elev-2)" }}
          >
            {links.map((l, i) => (
              <div
                key={l.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
                style={{ borderBottom: i === links.length - 1 ? "none" : "1px solid var(--hairline)" }}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                    Lien créé le {formatDate(l.created_at)}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-dim)" }}>
                    {l.use_count} ouverture{l.use_count > 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await profileService.revokePrivateLinks(l.id);
                    await load();
                    showToast("Lien révoqué");
                  }}
                  className="text-[12px] font-semibold shrink-0"
                  style={{ color: "var(--danger)" }}
                >
                  Révoquer
                </button>
              </div>
            ))}
          </div>
        )}

        <FormError>{error}</FormError>

        <div className="space-y-2">
          <PrimaryButton onClick={create} loading={creating}>Créer un nouveau lien</PrimaryButton>
          {links?.length > 0 && (
            <SecondaryButton onClick={revokeAll}>Révoquer tous mes liens privés</SecondaryButton>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------------------------
   Comptes bloques (§22)
   -------------------------------------------------------------------------- */
function BlockedAccountsModal({ onClose }) {
  const { showToast } = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setItems(await blockService.listBlocked());
    } catch (e) {
      setError(mapError(e));
      setItems([]);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <ModalShell title="Comptes bloqués" onClose={onClose}>
      {items === null ? (
        <div className="flex justify-center py-8"><Spinner size={18} /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Ban} title="Aucun compte bloqué" subtitle="Vous n'avez bloqué personne." />
      ) : (
        <div className="space-y-2">
          {items.map((b) => (
            <div
              key={b.user_id}
              className="flex items-center gap-3 rounded-[14px] px-3 py-2.5"
              style={{ background: "var(--bg-elev-2)" }}
            >
              <UserAvatar user={b} size={36} />
              <p className="flex-1 min-w-0 text-[14px] font-medium truncate" style={{ color: "var(--text)" }}>
                @{b.username}
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await blockService.unblock(b.username);
                    await load();
                    showToast("Compte débloqué");
                  } catch (e) {
                    setError(mapError(e));
                  }
                }}
                className="text-[12px] font-semibold shrink-0"
                style={{ color: "var(--accent)" }}
              >
                Débloquer
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="mt-4"><FormError>{error}</FormError></div>}
    </ModalShell>
  );
}
