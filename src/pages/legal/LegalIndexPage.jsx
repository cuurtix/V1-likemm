/* =============================================================================
   LIKEMM — /legal : point d'entree vers tous les documents (§3 / §41)
   ========================================================================== */

import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FileText, Shield, Lock, Cookie, Users, Gavel, Flag, Database, Trash2, Mail, Scale,
} from "lucide-react";
import { PageShell, PageHero } from "../../components/molecules.jsx";
import { Callout, ToComplete } from "../../components/atoms.jsx";
import { setPageMeta } from "../../lib/seo.js";
import { CONTACT_EMAIL, POLICY_VERSION } from "../../lib/config.js";

const DOCS = [
  { to: "/mentions-legales", icon: Scale, title: "Mentions légales", desc: "Éditeur, hébergeur, prestataires techniques, propriété intellectuelle." },
  { to: "/terms", icon: FileText, title: "Conditions générales d'utilisation", desc: "Règles d'usage du service, création de compte, likes, classements, sanctions." },
  { to: "/privacy", icon: Lock, title: "Politique de confidentialité", desc: "Données traitées, finalités, bases légales, destinataires, droits, mineurs." },
  { to: "/cookies", icon: Cookie, title: "Cookies et traceurs", desc: "Catégories, finalités et gestion de votre consentement." },
  { to: "/community-guidelines", icon: Users, title: "Règles communautaires", desc: "Ce qui est interdit sur Likemm et pourquoi." },
  { to: "/moderation", icon: Shield, title: "Modération et recours", desc: "Comment les décisions sont prises, comment les contester." },
  { to: "/report", icon: Flag, title: "Signaler un problème", desc: "Signaler un profil, un contenu ou un comportement." },
  { to: "/appeal", icon: Gavel, title: "Contester une décision", desc: "Demander le réexamen d'une mesure prise sur votre compte." },
  { to: "/data-rights", icon: Database, title: "Mes données et mes droits", desc: "Accéder, corriger, exporter, effacer, s'opposer, retirer un consentement." },
  { to: "/account-deletion", icon: Trash2, title: "Supprimer mon compte", desc: "Ce qui est supprimé, ce qui peut être conservé, et pourquoi." },
  { to: "/contact", icon: Mail, title: "Contact", desc: "Nous écrire pour toute question." },
];

export default function LegalIndexPage() {
  useEffect(() => {
    setPageMeta({
      title: "Informations légales",
      description: "Mentions légales, CGU, confidentialité, cookies, règles communautaires et recours.",
      path: "/legal",
    });
  }, []);

  return (
    <PageShell
      hero={
        <PageHero
          title="Informations légales"
          subtitle="Tous les documents qui encadrent l'utilisation de Likemm."
        />
      }
    >
      <Callout tone="warn" title="Documents en cours de finalisation">
        Ces documents ont été rédigés pour couvrir le fonctionnement réel de Likemm, mais plusieurs
        informations ne peuvent être renseignées que par l'éditeur du service : elles apparaissent en
        surbrillance, par exemple <ToComplete>IDENTITÉ DE L'ÉDITEUR À COMPLÉTER</ToComplete>.
        Ils doivent être complétés et vérifiés avant la mise en production. Likemm n'affirme aucune
        certification ni conformité garantie : la conformité relève du responsable du traitement et,
        le cas échéant, d'un professionnel du droit.
      </Callout>

      <div className="grid sm:grid-cols-2 gap-3 mt-8">
        {DOCS.map((doc) => (
          <Link
            key={doc.to}
            to={doc.to}
            className="rounded-[18px] p-5 block"
            style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
          >
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
              style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)" }}
            >
              <doc.icon size={17} strokeWidth={2} />
            </span>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{doc.title}</p>
            <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {doc.desc}
            </p>
          </Link>
        ))}
      </div>

      <p className="text-[13px] mt-10" style={{ color: "var(--text-muted)" }}>
        Version des documents : {POLICY_VERSION} · Contact :{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)" }}>{CONTACT_EMAIL}</a>
      </p>
    </PageShell>
  );
}
