/* =============================================================================
   LIKEMM — habillage commun des pages juridiques (§40 des ameliorations)
   =============================================================================
   « Les pages juridiques doivent respecter le design general de Likemm. Elles
   doivent etre modernes, lisibles, mobiles, accessibles, avec une navigation
   claire. Ne pas afficher un mur de texte illisible. »

   D'ou : un sommaire ancre, des titres, des listes, des encadres, une largeur
   de lecture confortable, et une navigation entre documents en bas de page.
   ========================================================================== */

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { setPageMeta } from "../../lib/seo.js";
import { POLICY_VERSION, CONTACT_EMAIL } from "../../lib/config.js";

export const LEGAL_PAGES = [
  ["/mentions-legales", "Mentions légales"],
  ["/terms", "Conditions générales d'utilisation"],
  ["/privacy", "Politique de confidentialité"],
  ["/cookies", "Cookies et traceurs"],
  ["/community-guidelines", "Règles communautaires"],
  ["/moderation", "Modération et recours"],
  ["/data-rights", "Mes données et mes droits"],
  ["/account-deletion", "Supprimer mon compte"],
  ["/report", "Signaler un problème"],
  ["/appeal", "Contester une décision"],
  ["/contact", "Contact"],
];

export function LegalLayout({ title, subtitle, path, summary = [], children, updated = true }) {
  useEffect(() => {
    setPageMeta({ title, description: subtitle, path });
  }, [title, subtitle, path]);

  return (
    <div className="pb-32 sm:pb-20 pt-4 sm:pt-24 max-w-3xl mx-auto px-5 sm:px-8">
      <Link
        to="/legal"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-6"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={14} strokeWidth={2.2} />
        Tous les documents
      </Link>

      <header className="mb-8">
        <h1
          className="text-[32px] sm:text-[40px] font-semibold leading-[1.08]"
          style={{ color: "var(--text)", letterSpacing: "-0.028em" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[16px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
        {updated && (
          <p className="text-[12px] mt-4" style={{ color: "var(--text-dim)" }}>
            Version du document : {POLICY_VERSION}
          </p>
        )}
      </header>

      {summary.length > 0 && (
        <nav
          className="rounded-[18px] p-5 mb-10"
          style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
          aria-label="Sommaire"
        >
          <p className="text-[12px] font-semibold uppercase tracking-[0.10em] mb-3" style={{ color: "var(--text-muted)" }}>
            Sommaire
          </p>
          <ol className="space-y-1.5">
            {summary.map(([anchor, label], i) => (
              <li key={anchor}>
                <a
                  href={`#${anchor}`}
                  className="text-[14px] hover:underline"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span className="tabular-nums mr-2" style={{ color: "var(--text-dim)" }}>{i + 1}.</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="lm-prose">{children}</div>

      <div className="mt-14 pt-8" style={{ borderTop: "1px solid var(--hairline)" }}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.10em] mb-3" style={{ color: "var(--text-muted)" }}>
          Autres documents
        </p>
        <div className="flex flex-wrap gap-2">
          {LEGAL_PAGES.filter(([to]) => to !== path).map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className="h-9 px-3.5 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5"
              style={{ background: "var(--bg-elev-1)", color: "var(--text-secondary)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
            >
              <FileText size={12} strokeWidth={2} />
              {label}
            </Link>
          ))}
        </div>
        <p className="text-[13px] mt-6" style={{ color: "var(--text-muted)" }}>
          Une question sur ce document ?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}

/** Section avec ancre, pour le sommaire. */
export function Section({ id, title, children }) {
  return (
    <section>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}
