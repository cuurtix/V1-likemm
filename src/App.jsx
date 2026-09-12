/* =============================================================================
   LIKEMM — routage, garde-fous d'accès et coquille de l'application
   =============================================================================
   Les redirections effectuées ici sont un CONFORT, pas une sécurité : chaque
   opération sensible est de toute façon refusée par la base si les conditions
   ne sont pas réunies (§44). Elles servent à éviter qu'un utilisateur se
   retrouve devant un écran inutilisable.
   ========================================================================== */

import { useEffect } from "react";
import {
  BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate,
} from "react-router-dom";

import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ConsentProvider, useConsent } from "./context/ConsentContext.jsx";

import { Nav, Footer } from "./components/molecules.jsx";
import { Spinner, ErrorState } from "./components/atoms.jsx";
import { CookieBanner, CookiePanel } from "./components/dialogs.jsx";

import LeaderboardPage from "./pages/LeaderboardPage.jsx";
import ExplorerPage from "./pages/ExplorerPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import PublicProfilePage from "./pages/PublicProfilePage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import {
  LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage,
  CompleteSignupPage, AccountBlockedPage,
} from "./pages/AuthPages.jsx";

import LegalIndexPage from "./pages/legal/LegalIndexPage.jsx";
import MentionsLegalesPage from "./pages/legal/MentionsLegalesPage.jsx";
import TermsPage from "./pages/legal/TermsPage.jsx";
import PrivacyPage from "./pages/legal/PrivacyPage.jsx";
import CookiesPage from "./pages/legal/CookiesPage.jsx";
import CommunityGuidelinesPage from "./pages/legal/CommunityGuidelinesPage.jsx";
import ModerationPage from "./pages/legal/ModerationPage.jsx";
import ReportPage from "./pages/legal/ReportPage.jsx";
import AppealPage from "./pages/legal/AppealPage.jsx";
import DataRightsPage from "./pages/legal/DataRightsPage.jsx";
import AccountDeletionPage from "./pages/legal/AccountDeletionPage.jsx";
import ContactPage from "./pages/legal/ContactPage.jsx";

import { captureAcquisition } from "./lib/acquisition.js";
import { analyticsService } from "./services/analyticsService.js";
import { hasRole } from "./services/moderationService.js";

/* --------------------------------------------------------------------------
   Utilitaires de navigation
   -------------------------------------------------------------------------- */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={24} />
    </div>
  );
}

/** Pages qu'un compte suspendu ou banni doit continuer à pouvoir ouvrir (§24). */
const ALLOWED_WHEN_BLOCKED = [
  "/appeal", "/data-rights", "/account-deletion", "/legal", "/mentions-legales",
  "/terms", "/privacy", "/cookies", "/community-guidelines", "/moderation", "/contact",
];

function RequireAuth({ children, minRole = null }) {
  const { loading, isAuthenticated, needsSetup, needsOnboarding, isBlockedAccount, role } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;

  if (!isAuthenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (needsSetup) return <Navigate to="/complete-signup" replace />;

  if (isBlockedAccount && !ALLOWED_WHEN_BLOCKED.some((p) => location.pathname.startsWith(p))) {
    return <AccountBlockedPage />;
  }
  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (minRole && !hasRole(role, minRole)) {
    return (
      <div className="pt-24 pb-32">
        <ErrorState message="Cette page est réservée à l'équipe de modération." />
      </div>
    );
  }
  return children;
}

/** Route /:handle — n'affiche un profil que pour un segment commençant par @. */
function HandleRoute() {
  const { handle } = useParams();
  if (!handle || !handle.startsWith("@") || handle.length < 2) return <NotFoundPage />;
  return <PublicProfilePage />;
}

/* --------------------------------------------------------------------------
   Coquille : navigation, contenu, pied de page, bandeau de consentement
   -------------------------------------------------------------------------- */
const TAB_BY_PATH = [
  ["/notifications", "notifications"],
  ["/explorer", "explorer"],
  ["/profile", "profile"],
  ["/settings", "profile"],
];

/** Écrans plein page, sans navigation ni pied de page. */
const BARE_ROUTES = [
  "/login", "/signup", "/forgot-password", "/reset-password",
  "/complete-signup", "/onboarding",
];

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, isAuthenticated, role, unreadCount, needsSetup } = useAuth();
  const { openPanel } = useConsent();

  // Un compte Google/Apple non finalisé est redirigé, quelle que soit la page.
  useEffect(() => {
    if (!loading && needsSetup && location.pathname !== "/complete-signup") {
      navigate("/complete-signup", { replace: true });
    }
  }, [loading, needsSetup, location.pathname, navigate]);

  const bare = BARE_ROUTES.some((p) => location.pathname === p);
  const currentTab =
    location.pathname === "/"
      ? "leaderboard"
      : TAB_BY_PATH.find(([p]) => location.pathname.startsWith(p))?.[1] || null;

  if (loading) return <FullPageLoader />;

  return (
    <div
      className="min-h-screen overflow-x-hidden relative flex flex-col"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <a href="#contenu" className="lm-skip">Aller au contenu</a>

      {!bare && isAuthenticated && (
        <Nav current={currentTab} unread={unreadCount} isModerator={hasRole(role, "moderator")} />
      )}
      {!bare && !isAuthenticated && <PublicNav />}

      <main id="contenu" className="flex-1">
        <Routes>
          <Route path="/" element={<LeaderboardPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/complete-signup" element={<CompleteSignupPage />} />

          <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth minRole="moderator"><AdminPage /></RequireAuth>} />

          {/* Documents et pages de recours — accessibles sans compte */}
          <Route path="/legal" element={<LegalIndexPage />} />
          <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
          <Route path="/moderation" element={<ModerationPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/appeal" element={<AppealPage />} />
          <Route path="/data-rights" element={<DataRightsPage />} />
          <Route path="/account-deletion" element={<AccountDeletionPage />} />

          {/* Profil public : /@username */}
          <Route path="/:handle" element={<HandleRoute />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      {!bare && <Footer onOpenCookiePanel={openPanel} />}

      <CookieBanner />
      <CookiePanel />
    </div>
  );
}

/** Barre de navigation minimale pour les visiteurs non connectés (§8). */
function PublicNav() {
  const navigate = useNavigate();
  return (
    <nav
      className="sticky top-0 z-30 flex justify-center"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(20px) saturate(1.8)",
        WebkitBackdropFilter: "blur(20px) saturate(1.8)",
        borderBottom: "1px solid var(--glass-border)",
      }}
      aria-label="Navigation"
    >
      <div className="w-full max-w-6xl flex items-center justify-between px-5 sm:px-8 py-3 gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="font-semibold text-[20px] tracking-tight shrink-0"
          style={{ color: "var(--text)", letterSpacing: "-0.035em" }}
        >
          Likemm<span style={{ color: "var(--accent)" }}>.</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="h-9 px-4 rounded-full text-[13px] font-semibold"
            style={{ background: "var(--bg-elev-1)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => navigate("/signup")}
            className="h-9 px-4 rounded-full text-[13px] font-semibold"
            style={{ background: "var(--text)", color: "var(--bg)" }}
          >
            Créer un profil
          </button>
        </div>
      </div>
    </nav>
  );
}

/* --------------------------------------------------------------------------
   Racine
   -------------------------------------------------------------------------- */
export default function App() {
  useEffect(() => {
    // §3 des améliorations : d'où vient ce visiteur ? Capté une seule fois par
    // session, à partir des seuls paramètres d'URL qu'il nous transmet.
    captureAcquisition();
    // N'enregistre un événement que si la mesure d'audience a été acceptée.
    analyticsService.trackSessionStart();
  }, []);

  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ConsentProvider>
            <ToastProvider>
              <ScrollToTop />
              <Shell />
            </ToastProvider>
          </ConsentProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
