/* =============================================================================
   LIKEMM — champs, boutons, modales, lignes de reglages
   =============================================================================
   Portage a l'identique du prototype, avec l'accessibilite ajoutee : chaque
   champ a un vrai <label> lie, chaque erreur est annoncee, chaque bouton a un
   intitule comprehensible (§42).
   ========================================================================== */

import { useEffect, useId, useState } from "react";
import { X, Eye, EyeOff, AlertCircle, ChevronRight } from "lucide-react";
import { Spinner } from "./atoms.jsx";

export function TextInput({
  label, value, onChange, placeholder, type = "text", hint = null, error = null,
  right = null, autoFocus = false, autoComplete, name, disabled = false,
  inputMode, maxLength, prefix = null, onBlur,
}) {
  const [focused, setFocused] = useState(false);
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {label}
        </label>
      )}
      <div
        className="mt-1.5 flex items-center rounded-[14px] px-4 h-12"
        style={{
          background: "var(--bg-elev-1)",
          opacity: disabled ? 0.6 : 1,
          boxShadow: error
            ? "0 0 0 3px rgba(255,69,58,0.20), inset 0 0 0 1px var(--danger)"
            : focused
              ? "0 0 0 3px var(--accent-ring), inset 0 0 0 1px var(--accent)"
              : "inset 0 0 0 1px var(--border)",
        }}
      >
        {prefix && (
          <span className="text-[15px] mr-0.5 select-none" style={{ color: "var(--text-muted)" }}>
            {prefix}
          </span>
        )}
        <input
          id={id}
          name={name}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          disabled={disabled}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          placeholder={placeholder}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          style={{ color: "var(--text)" }}
        />
        {right}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12px] mt-1.5 flex items-center gap-1" style={{ color: "var(--danger)" }}>
          <AlertCircle size={12} strokeWidth={2.4} />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <TextInput
      {...props}
      type={show ? "text" : "password"}
      right={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="p-1 -mr-1"
          style={{ color: "var(--text-muted)" }}
          aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        >
          {show ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
        </button>
      }
    />
  );
}

export function TextArea({ label, value, onChange, placeholder, rows = 4, maxLength, hint, error }) {
  const id = useId();
  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {label}
        </label>
      )}
      <textarea
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={error ? "true" : undefined}
        className="w-full mt-1.5 rounded-[14px] px-4 py-3 text-[15px] outline-none resize-none"
        style={{
          background: "var(--bg-elev-1)",
          boxShadow: error
            ? "inset 0 0 0 1px var(--danger)"
            : "inset 0 0 0 1px var(--border)",
          color: "var(--text)",
        }}
      />
      <div className="flex items-center justify-between text-[12px] mt-1.5">
        <span style={{ color: error ? "var(--danger)" : "var(--text-muted)" }}>{error || hint}</span>
        {maxLength && (
          <span className="tabular-nums shrink-0 ml-3" style={{ color: "var(--text-dim)" }}>
            {(value || "").length} / {maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

export function Select({ label, value, onChange, options, hint, error }) {
  const id = useId();
  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {label}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1.5 h-12 rounded-[14px] px-3 text-[15px] outline-none appearance-none"
        style={{
          background: "var(--bg-elev-1)",
          boxShadow: "inset 0 0 0 1px var(--border)",
          color: "var(--text)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {(hint || error) && (
        <p className="text-[12px] mt-1.5" style={{ color: error ? "var(--danger)" : "var(--text-muted)" }}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function PrimaryButton({
  children, onClick, disabled, type = "button", danger = false, full = true, loading = false,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${full ? "w-full" : "px-6"} h-12 rounded-full font-semibold text-[15px] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2`}
      style={{
        background: danger ? "var(--danger)" : "var(--text)",
        color: danger ? "#fff" : "var(--bg)",
        boxShadow: disabled || loading
          ? "none"
          : danger
            ? "0 8px 20px rgba(215,0,21,0.20)"
            : "0 8px 20px rgba(0,0,0,0.14)",
      }}
    >
      {loading && <Spinner size={15} />}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, full = true, type = "button", disabled = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${full ? "w-full" : "px-6"} h-12 rounded-full font-semibold text-[15px] active:scale-[0.98] transition-all disabled:opacity-40`}
      style={{
        background: "var(--bg-elev-1)",
        color: "var(--text)",
        boxShadow: "inset 0 0 0 1px var(--border)",
      }}
    >
      {children}
    </button>
  );
}

export function Switch({ value, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!value); }}
      disabled={disabled}
      className="relative rounded-full transition-colors duration-200 shrink-0 disabled:opacity-50"
      style={{
        width: 44, height: 26,
        background: value ? "var(--success)" : "var(--bg-elev-3)",
        boxShadow: value ? "none" : "inset 0 0 0 1px var(--hairline)",
      }}
      aria-checked={value}
      role="switch"
      aria-label={label}
    >
      <span
        className="absolute top-[2px] rounded-full"
        style={{
          width: 22, height: 22, left: 2, background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.15)",
          transform: value ? "translateX(18px)" : "translateX(0)",
          transition: "transform 0.24s var(--ease-out)",
        }}
      />
    </button>
  );
}

export function Checkbox({ checked, onChange, children, id: providedId }) {
  const generated = useId();
  const id = providedId || generated;
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
        style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
      />
      <label htmlFor={id} className="text-[13px] leading-relaxed cursor-pointer" style={{ color: "var(--text-muted)" }}>
        {children}
      </label>
    </div>
  );
}

export function SettingsGroup({ title, icon: Icon, children, description = null }) {
  return (
    <section className="mb-8">
      {title && (
        <div className="flex items-center gap-2 mb-2.5 px-1">
          {Icon && <Icon size={13} strokeWidth={2.2} style={{ color: "var(--text-muted)" }} />}
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.10em]" style={{ color: "var(--text-muted)" }}>
            {title}
          </h2>
        </div>
      )}
      <div
        className="rounded-[18px] overflow-hidden"
        style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      >
        {children}
      </div>
      {description && (
        <p className="text-[12px] mt-2 px-1 leading-relaxed" style={{ color: "var(--text-dim)" }}>
          {description}
        </p>
      )}
    </section>
  );
}

export function SettingRow({
  icon: Icon, iconBg, label, sublabel, onClick, href, danger = false,
  chevron = true, right = null, last = false, disabled = false,
}) {
  const content = (
    <>
      {Icon && (
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: danger ? "var(--danger-soft)" : iconBg || "var(--bg-elev-2)",
            color: danger ? "var(--danger)" : "var(--text-secondary)",
          }}
        >
          <Icon size={16} strokeWidth={2} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium truncate" style={{ color: danger ? "var(--danger)" : "var(--text)" }}>
          {label}
        </p>
        {sublabel && (
          <p className="text-[13px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{sublabel}</p>
        )}
      </div>
      {right}
      {chevron && !right && (onClick || href) && (
        <ChevronRight size={16} strokeWidth={2.2} style={{ color: "var(--text-dim)" }} />
      )}
    </>
  );

  const style = {
    borderBottom: last ? "none" : "1px solid var(--hairline)",
    color: danger ? "var(--danger)" : "var(--text)",
    opacity: disabled ? 0.5 : 1,
  };
  const cls = "w-full flex items-center gap-3 px-4 py-3.5 text-left";
  const hover = {
    onMouseEnter: (e) => { if (!disabled) e.currentTarget.style.background = "var(--bg-elev-2)"; },
    onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; },
  };

  if (href) return <a href={href} className={cls} style={style} {...hover}>{content}</a>;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls} style={style} {...hover}>
        {content}
      </button>
    );
  }
  return <div className={cls} style={style}>{content}</div>;
}

export function ModalShell({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div
        onClick={onClose}
        className="absolute inset-0 lm-fadeIn"
        style={{
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        }}
      />
      <div
        className={`relative w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} sm:rounded-[24px] rounded-t-[24px] overflow-hidden max-h-[88vh] overflow-y-auto lm-slideUp`}
        style={{
          background: "var(--bg-elev-1)",
          boxShadow: "var(--shadow-xl), inset 0 0 0 1px var(--hairline)",
        }}
      >
        <div className="sm:hidden pt-2 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--bg-elev-3)" }} />
        </div>
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-4 z-10"
          style={{ background: "var(--bg-elev-1)", borderBottom: "1px solid var(--hairline)" }}
        >
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)" }}
            aria-label="Fermer"
          >
            <X size={14} strokeWidth={2.6} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Encadre d'erreur de formulaire, annonce aux lecteurs d'ecran. */
export function FormError({ children }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-[14px] px-3.5 py-3"
      style={{ background: "var(--danger-soft)", boxShadow: "inset 0 0 0 1px rgba(255,69,58,0.30)" }}
    >
      <AlertCircle size={14} strokeWidth={2.4} className="mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
      <p className="text-[13px]" style={{ color: "var(--danger)" }}>{children}</p>
    </div>
  );
}

export function PasswordStrengthBar({ strength }) {
  const color = ["var(--danger)", "var(--danger)", "var(--warning)", "var(--success)", "var(--success)"][strength.score];
  return (
    <div>
      <div className="flex gap-1 h-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 rounded-full"
            style={{
              background: i < strength.score ? color : "var(--bg-elev-3)",
              transition: "background 0.24s",
            }}
          />
        ))}
      </div>
      <p className="text-[12px] mt-2" style={{ color }}>Force : {strength.label}</p>
    </div>
  );
}
