/* =============================================================================
   LIKEMM — composants de base
   =============================================================================
   Portage a l'identique du prototype : memes formes, memes ombres, memes
   animations, memes tokens de couleur (§54 : « Ne refais pas completement
   l'UI »). Seules deux choses changent, parce qu'elles le devaient :

     * UserAvatar n'affiche plus une image aleatoire d'un service tiers quand
       l'utilisateur n'a pas de photo, mais l'avatar par defaut du projet ;
     * les etats vides disent la verite (« Aucun utilisateur pour le moment »)
       au lieu d'etre remplis de faux profils (§24).
   ========================================================================== */

import { useState, useEffect } from "react";
import {
  Heart, Check, AlertCircle, TrendingUp, TrendingDown, Minus, Info,
} from "lucide-react";
import { DEFAULT_AVATAR } from "../lib/config.js";

export function Wordmark({ size = "md" }) {
  const cls = size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-2xl";
  return (
    <span
      className={`font-semibold tracking-tight ${cls}`}
      style={{ color: "var(--text)", letterSpacing: "-0.035em" }}
    >
      Likemm<span style={{ color: "var(--accent)" }}>.</span>
    </span>
  );
}

/**
 * Avatar. Sans photo, l'image par defaut du projet est utilisee : aucune
 * photo n'est empruntee ailleurs pour faire croire que le profil en a une.
 */
export function UserAvatar({ user, size = 44, ring = false, onClick, src = null, alt = null }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? DEFAULT_AVATAR : src || user?.avatar_url || DEFAULT_AVATAR;
  const label = alt || (user?.username ? `Photo de @${user.username}` : "Photo de profil");

  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      type={onClick ? "button" : undefined}
      aria-label={onClick ? `Voir le profil de @${user?.username || ""}` : undefined}
      className={`relative shrink-0 rounded-full overflow-hidden flex items-center justify-center ${onClick ? "cursor-pointer" : ""}`}
      style={{
        width: size,
        height: size,
        background: "var(--bg-elev-2)",
        boxShadow: ring
          ? "0 0 0 2px var(--bg), 0 0 0 3px var(--border), 0 8px 24px rgba(0,0,0,0.10)"
          : "inset 0 0 0 1px var(--hairline)",
      }}
    >
      <img
        src={source}
        alt={label}
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
        draggable={false}
        loading="lazy"
      />
    </Tag>
  );
}

export function RankBadge({ rank, size = "md" }) {
  const dim = size === "sm" ? 22 : 28;
  const fs = size === "sm" ? 11 : 12;

  if (rank == null) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
        style={{
          minWidth: dim, height: dim, padding: "0 8px", fontSize: fs,
          background: "var(--bg-elev-2)", color: "var(--text-dim)",
          boxShadow: "inset 0 0 0 1px var(--hairline)",
        }}
        title="Rang non disponible"
      >
        —
      </span>
    );
  }

  if (rank <= 3) {
    const colors = {
      1: { bg: "linear-gradient(135deg,#ffd76a,#f0b429 60%,#c99514)", ring: "rgba(240,180,41,0.35)" },
      2: { bg: "linear-gradient(135deg,#e6e8ea,#c0c4c8 60%,#a1a5aa)", ring: "rgba(160,164,168,0.35)" },
      3: { bg: "linear-gradient(135deg,#e5b48b,#c8825a 60%,#a86338)", ring: "rgba(168,99,56,0.35)" },
    };
    const c = colors[rank];
    return (
      <span
        className="inline-flex items-center justify-center rounded-full font-bold shrink-0"
        style={{
          width: dim, height: dim, fontSize: fs,
          background: c.bg, color: "#fff",
          boxShadow: `0 4px 12px ${c.ring}, inset 0 1px 0 rgba(255,255,255,0.4)`,
        }}
      >
        {rank}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{
        minWidth: dim, height: dim, padding: "0 8px", fontSize: fs,
        background: "var(--bg-elev-2)", color: "var(--text-secondary)",
        boxShadow: "inset 0 0 0 1px var(--hairline)",
      }}
    >
      {rank}
    </span>
  );
}

/**
 * Variation de rang. N'affiche quelque chose QUE si une variation reelle a ete
 * mesuree entre deux instantanes enregistres (§14). `delta` null = rien a dire.
 */
export function RankDelta({ delta, showZero = false }) {
  if (delta == null) return null;
  if (!delta) {
    if (!showZero) return null;
    return (
      <span className="inline-flex items-center gap-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
        <Minus size={11} />
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-semibold rounded-md px-1.5 py-0.5"
      style={{
        color: up ? "var(--success)" : "var(--danger)",
        background: up ? "rgba(48,209,88,0.10)" : "rgba(255,69,58,0.10)",
      }}
      title={up ? `${delta} places gagnees` : `${Math.abs(delta)} places perdues`}
    >
      {up ? <TrendingUp size={11} strokeWidth={2.6} /> : <TrendingDown size={11} strokeWidth={2.6} />}
      {Math.abs(delta)}
    </span>
  );
}

/**
 * Bouton like. `busy` desactive reellement le bouton pendant l'appel : on
 * n'affiche jamais un like comme acquis avant la reponse de la base (§25/§26).
 */
export function LikeButton({
  liked, onToggle, variant = "pill", full = false, busy = false, disabled = false, label = null,
}) {
  const [bump, setBump] = useState(false);

  const handle = (e) => {
    e.stopPropagation();
    if (busy || disabled) return;
    setBump(true);
    setTimeout(() => setBump(false), 320);
    onToggle();
  };

  const heartCls = `transition-transform ${bump ? "scale-125" : "scale-100"}`;
  const heartStyle = { transitionDuration: "260ms", transitionTimingFunction: "var(--ease-spring)" };
  const aria = label || (liked ? "Retirer le like" : "Liker ce profil");

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={busy || disabled}
        aria-label={aria}
        aria-pressed={liked}
        className="flex items-center justify-center rounded-full active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          width: 36, height: 36,
          background: liked ? "var(--text)" : "transparent",
          color: liked ? "var(--bg)" : "var(--text-muted)",
          boxShadow: liked ? "0 4px 12px rgba(0,0,0,0.15)" : "inset 0 0 0 1px var(--border)",
        }}
      >
        <Heart
          size={15} strokeWidth={2.2} fill={liked ? "currentColor" : "none"}
          className={heartCls} style={heartStyle}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy || disabled}
      aria-pressed={liked}
      aria-label={aria}
      className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${full ? "w-full justify-center" : ""}`}
      style={{
        background: liked ? "var(--bg-elev-2)" : "var(--text)",
        color: liked ? "var(--text)" : "var(--bg)",
        boxShadow: liked ? "inset 0 0 0 1px var(--border)" : "0 8px 24px rgba(0,0,0,0.12)",
      }}
    >
      <Heart
        size={16} strokeWidth={2.2} fill={liked ? "currentColor" : "none"}
        className={heartCls} style={heartStyle}
      />
      {busy ? "…" : liked ? "Liké" : "Like"}
    </button>
  );
}

export function Spinner({ size = 16, color = "currentColor" }) {
  return (
    <span
      className="lm-spin inline-block rounded-full align-[-2px]"
      style={{
        width: size, height: size,
        border: `2px solid ${color}`,
        borderTopColor: "transparent",
        opacity: 0.7,
      }}
      role="status"
      aria-label="Chargement"
    />
  );
}

export function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
      style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      aria-hidden="true"
    >
      <div className="rounded-full lm-skel" style={{ width: 42, height: 42 }} />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 rounded-full lm-skel" />
        <div className="h-2.5 w-16 rounded-full lm-skel" />
      </div>
      <div className="rounded-full lm-skel" style={{ width: 36, height: 36 }} />
    </div>
  );
}

export function SkeletonTop3() {
  return (
    <div className="flex items-end justify-center gap-4 pt-6 pb-2 max-w-md mx-auto" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col items-center flex-1">
          <div className="rounded-full lm-skel" style={{ width: 64, height: 64 }} />
          <div className="h-2.5 w-14 rounded-full mt-3 lm-skel" />
          <div className="h-2 w-10 rounded-full mt-2 lm-skel" />
        </div>
      ))}
    </div>
  );
}

/**
 * Etat vide (§24 / §8 de la V1 reelle).
 * « Ne jamais remplir les espaces vides avec des faux utilisateurs. »
 */
export function EmptyState({ icon: Icon = Info, title, subtitle, action = null }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ background: "var(--bg-elev-2)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      >
        <Icon size={24} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
      </div>
      <p className="text-base font-semibold" style={{ color: "var(--text)" }}>{title}</p>
      {subtitle && (
        <p className="text-sm mt-1.5 max-w-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Message d'erreur avec possibilite de reessayer (§14 / §26). */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ background: "var(--danger-soft)" }}
      >
        <AlertCircle size={22} strokeWidth={2} style={{ color: "var(--danger)" }} />
      </div>
      <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
        {message || "Une erreur est survenue."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 px-5 h-10 rounded-full text-[14px] font-semibold"
          style={{ background: "var(--bg-elev-2)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
        >
          Reessayer
        </button>
      )}
    </div>
  );
}

/** Encadre d'information ou d'alerte, utilise dans les pages juridiques. */
export function Callout({ tone = "info", title, children }) {
  const tones = {
    info: { bg: "var(--accent-soft)", ring: "var(--accent-ring)", fg: "var(--accent)" },
    warn: { bg: "rgba(255,159,10,0.10)", ring: "rgba(255,159,10,0.35)", fg: "var(--warning)" },
    danger: { bg: "var(--danger-soft)", ring: "rgba(255,69,58,0.30)", fg: "var(--danger)" },
    neutral: { bg: "var(--bg-elev-2)", ring: "var(--hairline)", fg: "var(--text-muted)" },
  };
  const t = tones[tone] || tones.info;
  return (
    <div
      className="rounded-[16px] p-4 my-5"
      style={{ background: t.bg, boxShadow: `inset 0 0 0 1px ${t.ring}` }}
    >
      {title && (
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: t.fg }}>
          {title}
        </p>
      )}
      <div className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Marqueur des informations restant a completer avant la mise en production
 * (§52 : « Ne jamais inventer une information juridique »). Volontairement
 * tres visible : il ne doit pas passer inapercu.
 */
export function ToComplete({ children }) {
  return (
    <mark
      className="px-1.5 py-0.5 rounded font-semibold"
      style={{ background: "rgba(255,159,10,0.22)", color: "var(--warning)" }}
      title="Information a completer par l'editeur du service avant la mise en production"
    >
      [{children}]
    </mark>
  );
}

export function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, type === "error" ? 5000 : 3200);
    return () => clearTimeout(t);
  }, [onClose, type]);

  const color =
    type === "error" ? "var(--danger)" : type === "success" ? "var(--success)" : "var(--accent)";
  const Icon = type === "error" ? AlertCircle : type === "info" ? Info : Check;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-24 sm:bottom-8 px-5 py-3 rounded-full flex items-center gap-2.5 lm-slideUp max-w-[calc(100vw-32px)]"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(24px) saturate(1.8)",
        WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        boxShadow: "var(--shadow-lg), inset 0 0 0 1px var(--glass-border)",
        color: "var(--text)",
      }}
    >
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: color, color: "#fff" }}
      >
        <Icon size={13} strokeWidth={3} />
      </span>
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
