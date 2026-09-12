/* =============================================================================
   LIKEMM — lignes, cartes, navigation, pied de page
   =============================================================================
   Portage a l'identique du prototype. Les composants recoivent desormais de
   vraies lignes venues de la base ; aucun d'entre eux ne fabrique de donnee.
   ========================================================================== */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Trophy, Search, Bell, User as UserIcon, Check, ChevronRight, X,
  Heart, TrendingUp, Sparkles, Moon, Sun, Shield, Lock, Award, ArrowDown,
} from "lucide-react";
import { UserAvatar, RankBadge, RankDelta, LikeButton, Wordmark } from "./atoms.jsx";
import { formatCount, formatRelative } from "../lib/format.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { CONTACT_EMAIL, APP_VERSION } from "../lib/config.js";

/* --------------------------------------------------------------------------
   Mise en page
   -------------------------------------------------------------------------- */
export function PageShell({ children, hero = null, wide = false }) {
  return (
    <div className={`pb-32 sm:pb-20 pt-4 sm:pt-24 ${wide ? "max-w-5xl" : "max-w-3xl sm:max-w-4xl"} mx-auto px-5 sm:px-8`}>
      {hero}
      {children}
    </div>
  );
}

export function PageHero({ eyebrow, title, subtitle, action = null }) {
  return (
    <header className="mb-8 sm:mb-10">
      {eyebrow && (
        <p
          className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-2"
          style={{ color: "var(--accent)" }}
        >
          {eyebrow}
        </p>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1
          className="text-[34px] sm:text-[44px] font-semibold leading-[1.05]"
          style={{ color: "var(--text)", letterSpacing: "-0.028em" }}
        >
          {title}
        </h1>
        {action}
      </div>
      {subtitle && (
        <p
          className="text-[15px] sm:text-[17px] mt-3 max-w-lg"
          style={{ color: "var(--text-muted)", lineHeight: 1.5 }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}

export function SegmentedControl({ value, onChange, options }) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-full p-1"
      style={{ background: "var(--bg-elev-2)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      role="tablist"
    >
      {options.map(([key, label]) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className="px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors"
            style={{
              background: active ? "var(--bg-elev-1)" : "transparent",
              color: active ? "var(--text)" : "var(--text-muted)",
              boxShadow: active
                ? "0 1px 3px rgba(0,0,0,0.10), inset 0 0 0 1px var(--hairline)"
                : "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function StatBlock({ label, value, sublabel = null }) {
  return (
    <div
      className="rounded-2xl py-4 px-4"
      style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="text-[22px] font-semibold mt-1 tabular-nums leading-none"
        style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
      >
        {value}
      </p>
      {sublabel && <p className="text-[11px] mt-1.5" style={{ color: "var(--text-dim)" }}>{sublabel}</p>}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Classement
   -------------------------------------------------------------------------- */
export function LeaderboardRow({ row, onLike, busy = false, canLike = true, index = 0 }) {
  const navigate = useNavigate();
  const isMe = row.is_me;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/@${row.username}`)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/@${row.username}`); } }}
      className="lm-cardIn w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl cursor-pointer"
      style={{
        background: isMe ? "var(--accent-soft)" : "var(--bg-elev-1)",
        boxShadow: isMe
          ? "inset 0 0 0 1px var(--accent-ring), 0 2px 8px rgba(0,113,227,0.06)"
          : "inset 0 0 0 1px var(--hairline)",
        animationDelay: `${Math.min(index, 12) * 22}ms`,
      }}
      onMouseEnter={(e) => {
        if (!isMe) {
          e.currentTarget.style.background = "var(--bg-elev-2)";
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06), inset 0 0 0 1px var(--hairline)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isMe) {
          e.currentTarget.style.background = "var(--bg-elev-1)";
          e.currentTarget.style.transform = "";
          e.currentTarget.style.boxShadow = "inset 0 0 0 1px var(--hairline)";
        }
      }}
    >
      <RankBadge rank={row.rank} />
      <UserAvatar user={row} size={44} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold truncate" style={{ color: "var(--text)" }}>
          @{row.username}
          {isMe && <span className="ml-1 font-normal" style={{ color: "var(--accent)" }}>· vous</span>}
        </p>
        <p className="text-[13px] tabular-nums mt-0.5" style={{ color: "var(--text-muted)" }}>
          {formatCount(row.likes_count)} like{row.likes_count > 1 ? "s" : ""}
        </p>
      </div>
      {isMe ? (
        <ChevronRight size={16} style={{ color: "var(--text-dim)" }} />
      ) : (
        <LikeButton
          variant="icon"
          liked={row.liked_by_me}
          busy={busy}
          disabled={!canLike}
          onToggle={() => onLike(row)}
          label={canLike ? undefined : "Connectez-vous pour liker"}
        />
      )}
    </div>
  );
}

/** Podium. Ne s'affiche qu'a partir de 3 profils reellement classes. */
export function TopThree({ rows }) {
  const navigate = useNavigate();
  if (!rows || rows.length < 3) return null;
  const order = [rows[1], rows[0], rows[2]];

  return (
    <div className="relative flex items-end justify-center gap-6 sm:gap-8 pt-8 pb-6 max-w-md mx-auto">
      {order.map((u, i) => {
        const isFirst = u.rank === 1;
        return (
          <div
            key={u.user_id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/@${u.username}`)}
            onKeyDown={(e) => { if (e.key === "Enter") navigate(`/@${u.username}`); }}
            className={`lm-cardIn flex flex-col items-center cursor-pointer group ${isFirst ? "-mt-6" : ""}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="relative">
              {isFirst && (
                <div
                  className="absolute -inset-3 rounded-full blur-xl opacity-70 pointer-events-none"
                  style={{ background: "radial-gradient(circle, rgba(240,180,41,0.45), transparent 65%)" }}
                />
              )}
              <div className="relative">
                <UserAvatar user={u} size={isFirst ? 88 : 68} ring />
              </div>
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2">
                <RankBadge rank={u.rank} size={isFirst ? "md" : "sm"} />
              </div>
            </div>
            <p
              className="mt-4 text-[14px] font-semibold truncate max-w-[110px] group-hover:opacity-80"
              style={{ color: "var(--text)" }}
            >
              @{u.username}
            </p>
            <p className="text-[12px] tabular-nums mt-0.5" style={{ color: "var(--text-muted)" }}>
              {formatCount(u.likes_count)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Carte de resultat de recherche. */
export function UserCard({ row, onLike, busy = false, canLike = true, index = 0 }) {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/@${row.username}`)}
      onKeyDown={(e) => { if (e.key === "Enter") navigate(`/@${row.username}`); }}
      className="lm-cardIn w-full flex items-center gap-3.5 p-3.5 rounded-2xl cursor-pointer"
      style={{
        background: "var(--bg-elev-1)",
        boxShadow: "inset 0 0 0 1px var(--hairline)",
        animationDelay: `${Math.min(index, 12) * 22}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-elev-2)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-elev-1)";
        e.currentTarget.style.transform = "";
      }}
    >
      <UserAvatar user={row} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[15px] font-semibold truncate" style={{ color: "var(--text)" }}>
            @{row.username}
          </p>
          {row.rank != null && (
            <span
              className="text-[11px] font-semibold ml-1 px-1.5 py-0.5 rounded-md tabular-nums shrink-0"
              style={{ background: "var(--bg-elev-2)", color: "var(--text-muted)" }}
            >
              #{row.rank}
            </span>
          )}
        </div>
        <p className="text-[13px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
          {row.bio || `${formatCount(row.likes_count)} like${row.likes_count > 1 ? "s" : ""}`}
        </p>
      </div>
      {onLike && (
        <LikeButton
          variant="icon"
          liked={row.liked_by_me}
          busy={busy}
          disabled={!canLike}
          onToggle={() => onLike(row)}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Notifications
   -------------------------------------------------------------------------- */
const NOTIFICATION_ICON = {
  like_received: <Heart size={16} strokeWidth={2.2} style={{ color: "var(--text)" }} />,
  rank_up: <TrendingUp size={16} strokeWidth={2.4} style={{ color: "var(--success)" }} />,
  overtaken: <ArrowDown size={16} strokeWidth={2.4} style={{ color: "var(--text-muted)" }} />,
  milestone_top: <Award size={16} strokeWidth={2.2} style={{ color: "var(--gold)" }} />,
};

/** Libelle construit a partir du contenu REEL de la notification. */
function notificationText(n) {
  const p = n.payload || {};
  switch (n.type) {
    case "like_received":
      return n.actor_hidden ? "Quelqu'un vous a liké" : "vous a liké";
    case "rank_up":
      return `Vous êtes passé de #${p.old_rank} à #${p.new_rank}`;
    case "overtaken":
      return `Vous êtes passé de #${p.old_rank} à #${p.new_rank}`;
    case "milestone_top":
      return `Vous êtes entré dans le Top ${p.milestone}`;
    default:
      return "";
  }
}

export function NotificationItem({ n, onOpenProfile }) {
  const unread = !n.read_at;
  const hasActor = Boolean(n.actor_username);
  const clickable = hasActor;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpenProfile(n.actor_username) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter") onOpenProfile(n.actor_username); } : undefined}
      className={`lm-cardIn w-full flex items-start gap-3 px-4 py-3.5 rounded-2xl ${clickable ? "cursor-pointer" : ""}`}
      style={{
        background: unread ? "var(--accent-soft)" : "var(--bg-elev-1)",
        boxShadow: `inset 0 0 0 1px ${unread ? "var(--accent-ring)" : "var(--hairline)"}`,
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
        style={{
          background: hasActor ? "transparent" : "var(--bg-elev-2)",
          boxShadow: hasActor ? "none" : "inset 0 0 0 1px var(--hairline)",
        }}
      >
        {hasActor ? (
          <UserAvatar user={{ username: n.actor_username, avatar_url: n.actor_avatar_url }} size={40} />
        ) : (
          NOTIFICATION_ICON[n.type] || <Sparkles size={16} style={{ color: "var(--accent)" }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] leading-snug" style={{ color: "var(--text)" }}>
          {hasActor && <span className="font-semibold">@{n.actor_username} </span>}
          {notificationText(n)}
        </p>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
          {formatRelative(n.created_at)}
        </p>
      </div>
      {unread && (
        <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: "var(--accent)" }} aria-label="Non lu" />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Recherche
   -------------------------------------------------------------------------- */
export function SearchBar({ value, onChange, placeholder, loading = false }) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className="flex items-center gap-2.5 px-4 h-12 rounded-2xl"
      style={{
        background: "var(--bg-elev-1)",
        boxShadow: focused
          ? "0 0 0 3px var(--accent-ring), inset 0 0 0 1px var(--accent)"
          : "inset 0 0 0 1px var(--hairline)",
      }}
    >
      <Search size={17} strokeWidth={2.2} style={{ color: "var(--text-muted)" }} className="shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        type="search"
        aria-label="Rechercher un utilisateur"
        className="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
        style={{ color: "var(--text)" }}
      />
      {loading && (
        <span className="lm-spin w-4 h-4 rounded-full shrink-0"
              style={{ border: "2px solid var(--text-dim)", borderTopColor: "transparent" }} />
      )}
      {value && !loading && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--bg-elev-3)", color: "var(--text-muted)" }}
          aria-label="Effacer la recherche"
        >
          <X size={11} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Navigation
   -------------------------------------------------------------------------- */
export const TABS = [
  { key: "leaderboard", to: "/", label: "Classement", icon: Trophy },
  { key: "explorer", to: "/explorer", label: "Explorer", icon: Search },
  { key: "notifications", to: "/notifications", label: "Notifications", icon: Bell },
  { key: "profile", to: "/profile", label: "Profil", icon: UserIcon },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
      title={isDark ? "Mode clair" : "Mode sombre"}
      className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90 shrink-0"
      style={{
        background: "var(--bg-elev-1)",
        color: "var(--text-secondary)",
        boxShadow: "inset 0 0 0 1px var(--hairline)",
      }}
    >
      {isDark ? <Sun size={15} strokeWidth={2.2} /> : <Moon size={15} strokeWidth={2.2} />}
    </button>
  );
}

export function Nav({ current, unread = 0, isModerator = false }) {
  const badge = (key) =>
    key === "notifications" && unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;

  return (
    <>
      {/* MOBILE — dock flottant */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-3 pt-2 pointer-events-none" aria-label="Navigation principale">
        <div
          className="max-w-md mx-auto flex items-center justify-around rounded-[26px] px-2 py-2 pointer-events-auto"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(28px) saturate(1.8)",
            WebkitBackdropFilter: "blur(28px) saturate(1.8)",
            boxShadow: "var(--shadow-lg), inset 0 0 0 1px var(--glass-border)",
          }}
        >
          {TABS.map((t) => {
            const active = current === t.key;
            const Icon = t.icon;
            const b = badge(t.key);
            return (
              <Link
                key={t.key}
                to={t.to}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-colors"
              >
                {active && (
                  <span
                    className="absolute inset-0 rounded-2xl"
                    style={{ background: "var(--bg-elev-2)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
                  />
                )}
                <span className="relative">
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} style={{ color: active ? "var(--text)" : "var(--text-muted)" }} />
                  {b && (
                    <span
                      className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                      style={{ background: "var(--danger)", color: "#fff", boxShadow: "0 0 0 2px var(--bg-elev-1)" }}
                    >
                      {b}
                    </span>
                  )}
                </span>
                <span className="relative text-[10px] font-medium" style={{ color: active ? "var(--text)" : "var(--text-muted)" }}>
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* DESKTOP — barre haute */}
      <nav
        className="hidden sm:flex fixed top-0 inset-x-0 z-30 justify-center"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(20px) saturate(1.8)",
          WebkitBackdropFilter: "blur(20px) saturate(1.8)",
          borderBottom: "1px solid var(--glass-border)",
        }}
        aria-label="Navigation principale"
      >
        <div className="w-full max-w-6xl flex items-center justify-between px-8 py-3">
          <Link to="/" aria-label="Accueil Likemm"><Wordmark size="md" /></Link>
          <div className="flex items-center gap-1">
            {TABS.map((t) => {
              const active = current === t.key;
              const Icon = t.icon;
              const b = badge(t.key);
              return (
                <Link
                  key={t.key}
                  to={t.to}
                  aria-current={active ? "page" : undefined}
                  className="relative flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-colors"
                  style={{
                    background: active ? "var(--bg-elev-2)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    boxShadow: active ? "inset 0 0 0 1px var(--hairline)" : "none",
                  }}
                >
                  <Icon size={15} strokeWidth={2} />
                  {t.label}
                  {b && (
                    <span
                      className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                      style={{ background: "var(--danger)", color: "#fff" }}
                    >
                      {b}
                    </span>
                  )}
                </Link>
              );
            })}
            {isModerator && (
              <Link
                to="/admin"
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                <Shield size={15} strokeWidth={2} />
                Modération
              </Link>
            )}
          </div>
          <ThemeToggle />
        </div>
      </nav>
    </>
  );
}

/* --------------------------------------------------------------------------
   Pied de page (§41 / §47)
   -------------------------------------------------------------------------- */
const FOOTER_PRODUCT = [
  ["/", "Classement"],
  ["/explorer", "Explorer"],
  ["/profile", "Mon profil"],
  ["/notifications", "Notifications"],
];

const FOOTER_LEGAL = [
  ["/mentions-legales", "Mentions légales"],
  ["/terms", "CGU"],
  ["/privacy", "Confidentialité"],
  ["/cookies", "Cookies"],
  ["/community-guidelines", "Règles communautaires"],
  ["/moderation", "Modération"],
];

const FOOTER_ACCOUNT = [
  ["/report", "Signaler un problème"],
  ["/appeal", "Contester une décision"],
  ["/data-rights", "Mes données"],
  ["/account-deletion", "Supprimer mon compte"],
  ["/contact", "Contact"],
];

export function Footer({ onOpenCookiePanel }) {
  return (
    <footer
      className="mt-16 pt-10 pb-28 sm:pb-12 px-5 sm:px-8"
      style={{ borderTop: "1px solid var(--hairline)", background: "var(--bg)" }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div className="col-span-2 sm:col-span-1">
            <Wordmark size="sm" />
            <p className="text-[13px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Le classement de popularité, calculé sur des likes réels.
            </p>
          </div>

          <FooterColumn title="Produit" links={FOOTER_PRODUCT} />
          <FooterColumn title="Informations légales" links={FOOTER_LEGAL} />
          <FooterColumn title="Aide et droits" links={FOOTER_ACCOUNT} />
        </div>

        <div
          className="mt-10 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <p className="text-[12px]" style={{ color: "var(--text-dim)" }}>
            Likemm {APP_VERSION} · Contact :{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>{CONTACT_EMAIL}</a>
          </p>
          <button
            type="button"
            onClick={onOpenCookiePanel}
            className="text-[12px] font-medium inline-flex items-center gap-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            <Lock size={12} strokeWidth={2} />
            Préférences cookies
          </button>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.10em] mb-3" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      <ul className="space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="text-[13px] hover:underline" style={{ color: "var(--text-secondary)" }}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Badge de verification visuelle — reserve a un usage futur, jamais decoratif. */
export function VerifiedBadge({ size = 16 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: "var(--accent)", color: "#fff" }}
      aria-label="Compte vérifié"
    >
      <Check size={size * 0.6} strokeWidth={3.5} />
    </span>
  );
}
