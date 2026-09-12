/* =============================================================================
   LIKEMM — Inscription, connexion, mot de passe, finalisation de compte (§4/§5)
   =============================================================================
   Le design du prototype est conserve : ecran plein, wordmark centre,
   formulaire minimaliste. Ce qui change, c'est que tout est reel — la
   verification du username interroge la base, l'age est controle en base, et
   aucune reussite n'est affichee sans reponse du serveur.
   ========================================================================== */

import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Mail, ArrowLeft } from "lucide-react";
import { Wordmark, Callout, Spinner } from "../components/atoms.jsx";
import {
  TextInput, PasswordInput, PrimaryButton, SecondaryButton, FormError,
  PasswordStrengthBar, Checkbox,
} from "../components/forms.jsx";
import { authService } from "../services/authService.js";
import { profileService } from "../services/profileService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  normalizeUsername, usernameFormatError, isEmailValid, passwordStrength,
  passwordError, birthDateError, isMinor,
} from "../lib/validation.js";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";
import { cameFromShare, getAcquisition } from "../lib/acquisition.js";
import { MIN_AGE, CONTACT_EMAIL } from "../lib/config.js";

/* --------------------------------------------------------------------------
   Habillage commun
   -------------------------------------------------------------------------- */
function AuthShell({ children, subtitle, back = null }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 60%)", filter: "blur(60px)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, rgba(120,120,128,0.18), transparent 60%)", filter: "blur(60px)" }}
        />
      </div>

      <div className="w-full max-w-[380px] relative">
        {back && (
          <Link
            to={back}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-6"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft size={14} strokeWidth={2.2} />
            Retour
          </Link>
        )}
        <div className="flex flex-col items-center mb-9">
          <Link to="/" aria-label="Accueil Likemm"><Wordmark size="lg" /></Link>
          <p className="text-[15px] mt-3 text-center" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        </div>
        {children}
      </div>

      <p className="relative text-[12px] mt-10 text-center max-w-[380px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        <Link to="/terms" style={{ color: "var(--text-muted)" }}>CGU</Link>
        {" · "}
        <Link to="/privacy" style={{ color: "var(--text-muted)" }}>Confidentialité</Link>
        {" · "}
        <Link to="/cookies" style={{ color: "var(--text-muted)" }}>Cookies</Link>
        {" · "}
        <Link to="/mentions-legales" style={{ color: "var(--text-muted)" }}>Mentions légales</Link>
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Connexion
   -------------------------------------------------------------------------- */
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPageMeta({ title: "Connexion", path: "/login", noindex: true }); }, []);
  useEffect(() => { if (isAuthenticated) navigate(next, { replace: true }); }, [isAuthenticated, navigate, next]);
  useEffect(() => {
    if (params.get("verified")) showToast("Adresse email confirmée. Vous pouvez vous connecter.");
  }, [params, showToast]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!isEmailValid(email)) return setError("Entrez une adresse email valide.");
    if (!password) return setError("Entrez votre mot de passe.");

    setLoading(true);
    try {
      await authService.signIn({ email, password });
      analyticsService.trackEvent(EVENTS.LOGIN);
      navigate(next, { replace: true });
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Connectez-vous pour continuer.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextInput
          label="Email" value={email} onChange={(v) => { setEmail(v); setError(null); }}
          placeholder="vous@exemple.com" type="email" autoComplete="email" name="email" autoFocus
        />
        <PasswordInput
          label="Mot de passe" value={password} onChange={(v) => { setPassword(v); setError(null); }}
          placeholder="Votre mot de passe" autoComplete="current-password" name="password"
        />
        <FormError>{error}</FormError>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-[13px] font-medium" style={{ color: "var(--accent)" }}>
            Mot de passe oublié ?
          </Link>
        </div>
        <div className="pt-2">
          <PrimaryButton type="submit" loading={loading}>Se connecter</PrimaryButton>
        </div>
      </form>

      <OAuthButtons mode="login" />

      <p className="text-center text-[13px] mt-7" style={{ color: "var(--text-muted)" }}>
        Pas encore de compte ?{" "}
        <Link to={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold" style={{ color: "var(--accent)" }}>
          Créer un compte
        </Link>
      </p>
    </AuthShell>
  );
}

/* --------------------------------------------------------------------------
   Inscription
   -------------------------------------------------------------------------- */
export function SignupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const next = params.get("next") || "/";
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Disponibilite du username : verifiee EN BASE, pas seulement en JavaScript.
  const [availability, setAvailability] = useState({ state: "idle", reason: null });
  const checkId = useRef(0);

  useEffect(() => { setPageMeta({ title: "Créer un compte", path: "/signup", noindex: true }); }, []);
  useEffect(() => { if (isAuthenticated && !sent) navigate(next, { replace: true }); }, [isAuthenticated, navigate, next, sent]);

  useEffect(() => {
    const formatProblem = usernameFormatError(username);
    if (!username) { setAvailability({ state: "idle", reason: null }); return undefined; }
    if (formatProblem) { setAvailability({ state: "invalid", reason: formatProblem }); return undefined; }

    setAvailability({ state: "checking", reason: null });
    const id = ++checkId.current;
    const timer = setTimeout(async () => {
      try {
        const result = await profileService.checkUsername(username);
        if (id !== checkId.current) return;
        setAvailability(
          result.available
            ? { state: "available", reason: null }
            : { state: "taken", reason: result.reason },
        );
      } catch {
        if (id === checkId.current) setAvailability({ state: "idle", reason: null });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [username]);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const minor = isMinor(birthDate);

  const step1Valid =
    availability.state === "available" &&
    isEmailValid(email) &&
    !passwordError(password) &&
    !birthDateError(birthDate) &&
    accepted;

  const submit = async () => {
    setError(null);

    const problems = [
      availability.state !== "available" && (availability.reason || "Choisissez un nom d'utilisateur disponible."),
      !isEmailValid(email) && "Entrez une adresse email valide.",
      passwordError(password),
      birthDateError(birthDate),
      !accepted && "Vous devez accepter les CGU et la politique de confidentialité.",
    ].filter(Boolean);

    if (problems.length) return setError(problems[0]);

    setLoading(true);
    try {
      const result = await authService.signUp({ email, password, username, birthDate });
      analyticsService.trackEvent(EVENTS.USER_SIGNED_UP, {
        channel: getAcquisition().channel,
      });
      if (cameFromShare()) analyticsService.trackEvent(EVENTS.SIGNUP_FROM_SHARE);

      if (result.needsEmailConfirmation) {
        setSent(true);
        setStep(2);
      } else {
        navigate("/onboarding", { replace: true });
      }
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  if (step === 2 && sent) {
    return (
      <AuthShell subtitle="Une dernière étape.">
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Mail size={22} strokeWidth={2} />
          </div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Confirmez votre adresse email
          </h1>
          <p className="text-[14px] mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Nous avons envoyé un lien de confirmation à <strong>{email}</strong>. Ouvrez-le pour
            activer votre compte.
          </p>
          <p className="text-[13px] mt-4" style={{ color: "var(--text-dim)" }}>
            Pensez à vérifier vos courriers indésirables.
          </p>
          <div className="mt-7 space-y-2">
            <SecondaryButton
              onClick={async () => {
                try {
                  await authService.resendVerificationEmail(email);
                  setError(null);
                } catch (e) {
                  setError(mapError(e));
                }
              }}
            >
              Renvoyer l'email
            </SecondaryButton>
            <FormError>{error}</FormError>
            <Link to="/login" className="block text-[13px] font-medium pt-2" style={{ color: "var(--accent)" }}>
              Aller à la connexion
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Créez votre profil, partagez-le, grimpez le classement.">
      <div className="space-y-4">
        <TextInput
          label="Nom d'utilisateur"
          prefix="@"
          value={username}
          onChange={(v) => { setUsername(normalizeUsername(v)); setError(null); }}
          placeholder="username"
          autoComplete="username"
          name="username"
          maxLength={20}
          autoFocus
          error={["invalid", "taken"].includes(availability.state) ? availability.reason : null}
          hint={
            availability.state === "checking"
              ? "Vérification…"
              : availability.state === "available"
                ? "✓ Disponible"
                : "Votre identifiant public : likemm.site/@" + (username || "username")
          }
          right={availability.state === "checking" ? <Spinner size={14} /> : availability.state === "available" ? <Check size={15} strokeWidth={3} style={{ color: "var(--success)" }} /> : null}
        />

        <TextInput
          label="Email"
          value={email}
          onChange={(v) => { setEmail(v); setError(null); }}
          placeholder="vous@exemple.com"
          type="email"
          autoComplete="email"
          name="email"
          error={email && !isEmailValid(email) ? "Format invalide." : null}
        />

        <div>
          <PasswordInput
            label="Mot de passe"
            value={password}
            onChange={(v) => { setPassword(v); setError(null); }}
            placeholder="8 caractères minimum"
            autoComplete="new-password"
            name="new-password"
          />
          {password && <div className="mt-2"><PasswordStrengthBar strength={strength} /></div>}
        </div>

        <TextInput
          label="Date de naissance"
          value={birthDate}
          onChange={(v) => { setBirthDate(v); setError(null); }}
          type="date"
          name="bday"
          autoComplete="bday"
          error={birthDate ? birthDateError(birthDate) : null}
          hint={`Likemm est accessible à partir de ${MIN_AGE} ans. Votre date de naissance n'est jamais affichée publiquement.`}
        />

        {/* §19 / §43 : information claire et adaptée pour les comptes mineurs. */}
        {minor === true && (
          <Callout tone="info" title="Compte de moins de 18 ans">
            Ton profil sera <strong>privé par défaut</strong> : personne ne pourra le voir sans le
            lien que tu envoies toi-même. La publicité ciblée est désactivée pour ton compte.
            {isMinor(birthDate) && birthDateError(birthDate) === null && (
              <> Si tu as moins de 15 ans, l'accord d'un parent est nécessaire ; on te le
              demandera juste après.</>
            )}
          </Callout>
        )}

        <Checkbox checked={accepted} onChange={setAccepted}>
          J'accepte les{" "}
          <Link to="/terms" target="_blank" style={{ color: "var(--accent)" }}>conditions d'utilisation</Link>{" "}
          et j'ai pris connaissance de la{" "}
          <Link to="/privacy" target="_blank" style={{ color: "var(--accent)" }}>politique de confidentialité</Link>.
        </Checkbox>

        <FormError>{error}</FormError>

        <div className="pt-2">
          <PrimaryButton onClick={submit} loading={loading} disabled={!step1Valid}>
            Créer mon compte
          </PrimaryButton>
        </div>
      </div>

      <OAuthButtons mode="signup" />

      <p className="text-center text-[13px] mt-7" style={{ color: "var(--text-muted)" }}>
        Déjà un compte ?{" "}
        <Link to="/login" className="font-semibold" style={{ color: "var(--accent)" }}>Se connecter</Link>
      </p>
    </AuthShell>
  );
}

/* --------------------------------------------------------------------------
   Connexion Google / Apple
   -------------------------------------------------------------------------- */
/**
 * §4 : « Google, Apple lorsque les providers sont configures. »
 * Les boutons sont affiches, et si le fournisseur n'est pas configure dans le
 * projet Supabase, l'erreur reelle est montree. On ne simule jamais une
 * connexion qui n'existe pas.
 */
function OAuthButtons({ mode }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const start = async (provider) => {
    setError(null);
    setBusy(provider);
    try {
      await authService.signInWithProvider(provider);
      // La page est redirigee par Supabase : rien a faire de plus ici.
    } catch (e) {
      setError(
        mapError(
          e,
          `La connexion ${provider === "google" ? "Google" : "Apple"} n'est pas disponible pour le moment.`,
        ),
      );
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 my-7">
        <div className="flex-1 h-px" style={{ background: "var(--hairline)" }} />
        <span className="text-[11px] uppercase tracking-[0.10em]" style={{ color: "var(--text-dim)" }}>ou</span>
        <div className="flex-1 h-px" style={{ background: "var(--hairline)" }} />
      </div>

      <div className="space-y-2">
        {[
          ["google", "Google"],
          ["apple", "Apple"],
        ].map(([provider, label]) => (
          <button
            key={provider}
            type="button"
            onClick={() => start(provider)}
            disabled={busy !== null}
            className="w-full h-12 rounded-full font-semibold text-[15px] active:scale-[0.98] transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
            style={{ background: "var(--bg-elev-1)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          >
            {busy === provider && <Spinner size={15} />}
            {mode === "signup" ? `S'inscrire avec ${label}` : `Continuer avec ${label}`}
          </button>
        ))}
      </div>

      {error && <div className="mt-3"><FormError>{error}</FormError></div>}
    </>
  );
}

/* --------------------------------------------------------------------------
   Mot de passe oublie / reinitialisation
   -------------------------------------------------------------------------- */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPageMeta({ title: "Mot de passe oublié", path: "/forgot-password", noindex: true }); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!isEmailValid(email)) return setError("Entrez une adresse email valide.");
    setLoading(true);
    try {
      await authService.sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Réinitialiser votre mot de passe." back="/login">
      {sent ? (
        <Callout tone="info" title="Email envoyé">
          Si un compte existe avec l'adresse <strong>{email}</strong>, un lien de réinitialisation
          vient d'y être envoyé. Le lien est valable une durée limitée.
        </Callout>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <TextInput
            label="Email" value={email} onChange={(v) => { setEmail(v); setError(null); }}
            placeholder="vous@exemple.com" type="email" autoComplete="email" autoFocus
          />
          <FormError>{error}</FormError>
          <PrimaryButton type="submit" loading={loading}>Envoyer le lien</PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPageMeta({ title: "Nouveau mot de passe", path: "/reset-password", noindex: true }); }, []);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const problem = passwordError(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas.");

    setLoading(true);
    try {
      await authService.updatePassword(password);
      showToast("Mot de passe mis à jour");
      navigate("/", { replace: true });
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Choisissez un nouveau mot de passe.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <PasswordInput
          label="Nouveau mot de passe" value={password}
          onChange={(v) => { setPassword(v); setError(null); }}
          placeholder="8 caractères minimum" autoComplete="new-password" autoFocus
        />
        {password && <PasswordStrengthBar strength={strength} />}
        <PasswordInput
          label="Confirmer" value={confirm} onChange={(v) => { setConfirm(v); setError(null); }}
          placeholder="Retapez le mot de passe" autoComplete="new-password"
          error={confirm && password !== confirm ? "Ne correspond pas." : null}
        />
        <FormError>{error}</FormError>
        <PrimaryButton type="submit" loading={loading}>Enregistrer</PrimaryButton>
      </form>
    </AuthShell>
  );
}

/* --------------------------------------------------------------------------
   Finalisation d'un compte Google / Apple (§5)
   -------------------------------------------------------------------------- */
export function CompleteSignupPage() {
  const navigate = useNavigate();
  const { refreshProfile, profile } = useAuth();

  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [availability, setAvailability] = useState({ state: "idle", reason: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const checkId = useRef(0);

  useEffect(() => { setPageMeta({ title: "Finaliser mon compte", path: "/complete-signup", noindex: true }); }, []);

  useEffect(() => {
    const formatProblem = usernameFormatError(username);
    if (!username) { setAvailability({ state: "idle", reason: null }); return undefined; }
    if (formatProblem) { setAvailability({ state: "invalid", reason: formatProblem }); return undefined; }
    setAvailability({ state: "checking", reason: null });
    const id = ++checkId.current;
    const timer = setTimeout(async () => {
      try {
        const result = await profileService.checkUsername(username);
        if (id !== checkId.current) return;
        setAvailability(result.available ? { state: "available", reason: null } : { state: "taken", reason: result.reason });
      } catch {
        if (id === checkId.current) setAvailability({ state: "idle", reason: null });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [username]);

  const submit = async () => {
    setError(null);
    if (availability.state !== "available") return setError(availability.reason || "Choisissez un nom d'utilisateur disponible.");
    const ageProblem = birthDateError(birthDate);
    if (ageProblem) return setError(ageProblem);
    if (!accepted) return setError("Vous devez accepter les CGU et la politique de confidentialité.");

    setLoading(true);
    try {
      await authService.completeSignup({ username, birthDate });
      await refreshProfile();
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Plus qu'une étape pour activer votre compte.">
      <div className="space-y-4">
        <Callout tone="neutral">
          Votre connexion est établie{profile?.username ? "" : ""}. Il manque un nom d'utilisateur et
          votre date de naissance : ces deux informations sont nécessaires avant de pouvoir utiliser
          Likemm.
        </Callout>

        <TextInput
          label="Nom d'utilisateur"
          prefix="@"
          value={username}
          onChange={(v) => { setUsername(normalizeUsername(v)); setError(null); }}
          placeholder="username"
          maxLength={20}
          autoFocus
          error={["invalid", "taken"].includes(availability.state) ? availability.reason : null}
          hint={availability.state === "available" ? "✓ Disponible" : "Votre identifiant public."}
          right={availability.state === "checking" ? <Spinner size={14} /> : null}
        />

        <TextInput
          label="Date de naissance"
          value={birthDate}
          onChange={(v) => { setBirthDate(v); setError(null); }}
          type="date"
          error={birthDate ? birthDateError(birthDate) : null}
          hint={`Likemm est accessible à partir de ${MIN_AGE} ans.`}
        />

        <Checkbox checked={accepted} onChange={setAccepted}>
          J'accepte les{" "}
          <Link to="/terms" target="_blank" style={{ color: "var(--accent)" }}>CGU</Link> et la{" "}
          <Link to="/privacy" target="_blank" style={{ color: "var(--accent)" }}>politique de confidentialité</Link>.
        </Checkbox>

        <FormError>{error}</FormError>
        <PrimaryButton onClick={submit} loading={loading}>Activer mon compte</PrimaryButton>
      </div>
    </AuthShell>
  );
}

/* --------------------------------------------------------------------------
   Compte suspendu / banni (§45 : information claire et voie de recours)
   -------------------------------------------------------------------------- */
export function AccountBlockedPage() {
  const { activeSanction, isBanned, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { setPageMeta({ title: "Compte restreint", noindex: true }); }, []);

  return (
    <AuthShell subtitle={isBanned ? "Votre compte est banni." : "Votre compte est suspendu."}>
      <div className="space-y-5">
        <Callout tone="danger" title="Décision de modération">
          {activeSanction ? (
            <>
              <p className="mb-2"><strong>Motif :</strong> {activeSanction.reason}</p>
              {activeSanction.rule_violated && (
                <p className="mb-2"><strong>Règle concernée :</strong> {activeSanction.rule_violated}</p>
              )}
              {activeSanction.ends_at && (
                <p className="mb-2">
                  <strong>Fin de la mesure :</strong>{" "}
                  {new Date(activeSanction.ends_at).toLocaleString("fr-FR")}
                </p>
              )}
              {!activeSanction.ends_at && <p className="mb-2">Cette mesure n'a pas de date de fin.</p>}
            </>
          ) : (
            <p>Une mesure de modération s'applique à votre compte.</p>
          )}
        </Callout>

        <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Vous pouvez contester cette décision. Votre demande sera examinée par l'équipe de
          modération et vous recevrez une réponse motivée.
        </p>

        <PrimaryButton onClick={() => navigate("/appeal")}>Contester cette décision</PrimaryButton>
        <SecondaryButton onClick={() => navigate("/data-rights")}>Exercer mes droits sur mes données</SecondaryButton>
        <button
          type="button"
          onClick={() => signOut()}
          className="w-full py-3 text-[13px] font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Se déconnecter
        </button>

        <p className="text-[12px] text-center" style={{ color: "var(--text-dim)" }}>
          Contact : <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </AuthShell>
  );
}
