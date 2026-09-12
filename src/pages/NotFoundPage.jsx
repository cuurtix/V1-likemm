/* =============================================================================
   LIKEMM — 404 (§40)
   =============================================================================
   « Creer une vraie page 404 avec bouton retour vers Likemm. »
   Cette page ne s'affiche que pour une route qui n'existe pas. Un profil
   inexistant, supprime ou indisponible a son propre message, explicite, sur la
   page de profil : on ne renvoie pas un 404 generique a la place.
   ========================================================================== */

import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { PageShell } from "../components/molecules.jsx";
import { EmptyState } from "../components/atoms.jsx";
import { setPageMeta } from "../lib/seo.js";

export default function NotFoundPage() {
  const location = useLocation();

  useEffect(() => {
    setPageMeta({ title: "Page introuvable", path: location.pathname, noindex: true });
  }, [location.pathname]);

  return (
    <PageShell>
      <EmptyState
        icon={Compass}
        title="Cette page n'existe pas"
        subtitle="Le lien est peut-être incorrect, ou la page a été déplacée."
        action={
          <div className="flex flex-col sm:flex-row gap-2">
            <Link
              to="/"
              className="h-12 px-6 rounded-full font-semibold text-[15px] inline-flex items-center justify-center"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              Retour au classement
            </Link>
            <Link
              to="/explorer"
              className="h-12 px-6 rounded-full font-semibold text-[15px] inline-flex items-center justify-center"
              style={{ background: "var(--bg-elev-1)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
            >
              Rechercher un profil
            </Link>
          </div>
        }
      />
    </PageShell>
  );
}
