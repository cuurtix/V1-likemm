/* =============================================================================
   LIKEMM — /contact (§48)
   =============================================================================
   « Ne pas inventer d'autres coordonnées. » Une seule adresse est publiée :
   celle du service. Aucun numéro de téléphone, aucune adresse postale n'est
   affichée tant qu'ils n'ont pas été renseignés par l'éditeur.
   ========================================================================== */

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Mail, Flag, Gavel, Database, Scale } from "lucide-react";
import { PageShell, PageHero } from "../../components/molecules.jsx";
import { Callout } from "../../components/atoms.jsx";
import { setPageMeta } from "../../lib/seo.js";
import { CONTACT_EMAIL } from "../../lib/config.js";

const ROUTES = [
  { to: "/report", icon: Flag, title: "Signaler un profil ou un contenu", desc: "Passez par le formulaire de signalement : il est traité par la modération." },
  { to: "/appeal", icon: Gavel, title: "Contester une décision de modération", desc: "La contestation est rattachée à la mesure concernée." },
  { to: "/data-rights", icon: Database, title: "Exercer vos droits sur vos données", desc: "Export immédiat, rectification, effacement, opposition." },
  { to: "/mentions-legales", icon: Scale, title: "Informations sur l'éditeur", desc: "Éditeur, hébergeur, prestataires techniques." },
];

export default function ContactPage() {
  useEffect(() => {
    setPageMeta({
      title: "Contact",
      description: "Comment joindre l'équipe Likemm.",
      path: "/contact",
    });
  }, []);

  return (
    <PageShell hero={<PageHero title="Contact" subtitle="Comment nous joindre, et par quel canal." />}>
      <div className="max-w-lg space-y-8">
        <section
          className="rounded-[18px] p-5"
          style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
        >
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)" }}
          >
            <Mail size={18} strokeWidth={2} />
          </span>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Adresse de contact
          </p>
          <p className="text-[16px] mt-1">
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>{CONTACT_EMAIL}</a>
          </p>
          <p className="text-[13px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            C'est la seule adresse de contact du service. Aucun autre moyen de contact n'est publié
            tant qu'il n'a pas été mis en place.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-semibold mb-3" style={{ color: "var(--text)" }}>
            Utilisez plutôt ces pages
          </h2>
          <p className="text-[14px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
            Pour ces demandes, les formulaires dédiés sont plus rapides : votre demande est
            enregistrée, suivie, et vous pouvez en consulter l'état.
          </p>
          <div className="space-y-2">
            {ROUTES.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="flex items-start gap-3 rounded-[16px] p-4"
                style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)" }}
                >
                  <r.icon size={16} strokeWidth={2} />
                </span>
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{r.title}</p>
                  <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {r.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <Callout tone="danger" title="Urgence">
          Si une personne est en danger immédiat, contactez les services d'urgence de votre pays.
          Un message adressé à Likemm ne remplace pas une intervention des autorités.
        </Callout>

        <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>
          Aucun délai de réponse n'est garanti. Les demandes relatives aux données personnelles et
          les contestations de modération sont traitées en priorité.
        </p>
      </div>
    </PageShell>
  );
}
