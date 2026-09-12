/* =============================================================================
   LIKEMM — Cookies et traceurs (§17 / §37 / §46)
   ========================================================================== */

import { Link } from "react-router-dom";
import { LegalLayout, Section } from "./LegalLayout.jsx";
import { Callout } from "../../components/atoms.jsx";
import { SecondaryButton } from "../../components/forms.jsx";
import { useConsent } from "../../context/ConsentContext.jsx";
import { CONSENT_CATEGORIES } from "../../services/consentService.js";
import { CONTACT_EMAIL } from "../../lib/config.js";

const SUMMARY = [
  ["principe", "Le principe"],
  ["categories", "Catégories de cookies et traceurs"],
  ["necessaires", "Détail des cookies nécessaires"],
  ["choix", "Modifier votre choix"],
  ["preuve", "Conservation de votre choix"],
];

export default function CookiesPage() {
  const { openPanel, consent } = useConsent();

  return (
    <LegalLayout
      title="Cookies et traceurs"
      subtitle="Ce qui est déposé sur votre appareil, pourquoi, et comment refuser."
      path="/cookies"
      summary={SUMMARY}
    >
      <Section id="principe" title="1. Le principe">
        <p>
          Les cookies strictement nécessaires au fonctionnement du site sont actifs en permanence :
          sans eux, vous ne pourriez ni vous connecter, ni rester connecté.
        </p>
        <p>
          Tous les autres traceurs — mesure d'audience, personnalisation, publicité — sont{" "}
          <strong>désactivés tant que vous ne les avez pas acceptés</strong>. Il ne s'agit pas d'une
          bannière décorative : les scripts concernés ne sont tout simplement pas chargés dans la
          page avant votre accord, et aucun événement de mesure n'est envoyé.
        </p>
        <Callout tone="info" title="Refuser est aussi simple qu'accepter">
          Les boutons « Tout refuser », « Personnaliser » et « Tout accepter » ont la même taille, la
          même position et le même poids visuel. Aucun n'est caché ni mis en avant.
        </Callout>
      </Section>

      <Section id="categories" title="2. Catégories de cookies et traceurs">
        <div className="not-prose space-y-3 my-6">
          {CONSENT_CATEGORIES.map((cat) => {
            const active = cat.alwaysOn || consent[cat.key] === true;
            return (
              <div
                key={cat.key}
                className="rounded-[16px] p-4"
                style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{cat.label}</p>
                  <span
                    className="text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                    style={{
                      background: active ? "rgba(48,209,88,0.12)" : "var(--bg-elev-2)",
                      color: active ? "var(--success)" : "var(--text-muted)",
                    }}
                  >
                    {cat.alwaysOn ? "Toujours actif" : active ? "Activé" : "Désactivé"}
                  </span>
                </div>
                <p className="text-[14px] mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {cat.description}
                </p>
              </div>
            );
          })}
        </div>
        <p>
          À ce jour, aucun traceur publicitaire n'est installé sur Likemm. La catégorie existe pour
          que votre choix soit recueilli et respecté si de la publicité était introduite plus tard.
          Pour les comptes de moins de 18 ans, la publicité reste désactivée quoi qu'il arrive.
        </p>
      </Section>

      <Section id="necessaires" title="3. Détail des cookies nécessaires">
        <ul>
          <li>
            <strong>Session d'authentification</strong> — conserve votre connexion entre les pages et
            après un rafraîchissement. Déposé par le système d'authentification.
          </li>
          <li>
            <strong>Préférence de thème</strong> — mémorise votre choix clair ou sombre.
          </li>
          <li>
            <strong>Choix de consentement</strong> — mémorise votre décision, pour ne pas vous la
            redemander à chaque visite.
          </li>
          <li>
            <strong>Identifiant technique de session</strong> — identifiant aléatoire, sans donnée
            personnelle, utilisé uniquement si vous avez accepté la mesure d'audience.
          </li>
        </ul>
      </Section>

      <Section id="choix" title="4. Modifier votre choix">
        <p>
          Vous pouvez changer d'avis à tout moment, sans justification, depuis cette page, depuis le
          pied de page du site ou depuis vos <Link to="/settings">paramètres</Link>.
        </p>
        <div className="not-prose my-5 max-w-xs">
          <SecondaryButton onClick={openPanel}>Modifier mes préférences</SecondaryButton>
        </div>
        <p>
          Le retrait d'un consentement arrête réellement la collecte correspondante. Si un script
          avait déjà été chargé pendant la visite en cours, la page est rechargée pour garantir son
          arrêt effectif.
        </p>
      </Section>

      <Section id="preuve" title="5. Conservation de votre choix">
        <p>
          Votre choix est enregistré avec sa date et la version des documents en vigueur. Pour les
          comptes connectés, il est également conservé côté serveur, ce qui permet de le retrouver
          sur vos autres appareils et de prouver, si nécessaire, ce qui a été accepté et quand.
        </p>
        <p>Si les documents changent de manière substantielle, votre choix vous est redemandé.</p>
        <p>
          Question sur ce document : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </LegalLayout>
  );
}
