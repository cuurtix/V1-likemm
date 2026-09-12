/* =============================================================================
   LIKEMM — Règles communautaires (§20 / §25 / §26 / §30 / §40)
   ========================================================================== */

import { Link } from "react-router-dom";
import { LegalLayout, Section } from "./LegalLayout.jsx";
import { Callout } from "../../components/atoms.jsx";
import { MIN_AGE } from "../../lib/config.js";

const SUMMARY = [
  ["esprit", "L'esprit de Likemm"],
  ["interdits", "Contenus et comportements interdits"],
  ["mineurs", "Protection des mineurs"],
  ["manipulation", "Manipulation du classement"],
  ["likes", "Les likes sont réels"],
  ["consequences", "Ce qui se passe en cas de manquement"],
  ["signaler", "Signaler un problème"],
];

export default function CommunityGuidelinesPage() {
  return (
    <LegalLayout
      title="Règles communautaires"
      subtitle="Ce qui est interdit sur Likemm, et pourquoi."
      path="/community-guidelines"
      summary={SUMMARY}
    >
      <Section id="esprit" title="1. L'esprit de Likemm">
        <p>
          Likemm mesure une popularité réelle. Tout ce qui fausse cette mesure — faux comptes, likes
          achetés, automatisation — vide le produit de son sens. Tout ce qui rend l'espace hostile —
          harcèlement, haine, atteinte à la vie privée — n'y a pas sa place non plus.
        </p>
        <p>Ces règles s'appliquent à tout ce qui est visible : nom d'utilisateur, photo de profil, image de couverture, bio, liens externes, et comportement envers les autres.</p>
      </Section>

      <Section id="interdits" title="2. Contenus et comportements interdits">
        <p>Sont interdits sur Likemm :</p>
        <ul>
          <li>la nudité et la pornographie ;</li>
          <li>la violence et les contenus violents ;</li>
          <li>la haine et les contenus discriminatoires ;</li>
          <li>le harcèlement et les menaces ;</li>
          <li>tout contenu illégal ;</li>
          <li>l'usurpation d'identité, y compris via le nom d'utilisateur ou la photo ;</li>
          <li>le spam et la publicité non autorisée ;</li>
          <li>la diffusion de données personnelles d'une autre personne sans son autorisation (doxxing) ;</li>
          <li>l'incitation à des comportements dangereux ;</li>
          <li>toute autre utilisation illégale du service.</li>
        </ul>
      </Section>

      <Section id="mineurs" title="3. Protection des mineurs">
        <Callout tone="danger" title="Tolérance zéro">
          Tout contenu à caractère sexuel impliquant un mineur, et toute forme d'exploitation d'un
          mineur, entraîne la suppression immédiate du compte et, le cas échéant, un signalement aux
          autorités compétentes.
        </Callout>
        <p>
          Likemm est accessible à partir de {MIN_AGE} ans. Les comptes de moins de 18 ans bénéficient
          de protections renforcées : profil privé par défaut, publicité ciblée désactivée, outils de
          signalement directement accessibles. Il est interdit de solliciter des informations
          personnelles auprès d'un mineur ou d'adopter un comportement inapproprié à son égard.
        </p>
      </Section>

      <Section id="manipulation" title="4. Manipulation du classement">
        <p>Sont interdits :</p>
        <ul>
          <li>les robots et les scripts automatisés ;</li>
          <li>l'achat et la vente de likes ;</li>
          <li>l'échange organisé de likes et les « groupes de likes » ;</li>
          <li>la création massive de comptes ;</li>
          <li>les faux comptes destinés à faire monter un profil ;</li>
          <li>toute technique visant à fausser le classement.</li>
        </ul>
        <p>
          Le service analyse certains signaux (volume et rythme des likes, schémas d'échange
          réciproque, rafales d'inscriptions). Un signal isolé ne constitue jamais une preuve : les
          décisions sont prises par une personne, en croisant plusieurs éléments.
        </p>
      </Section>

      <Section id="likes" title="5. Les likes sont réels">
        <p>
          Le nombre de likes affiché correspond toujours à des interactions réelles. Likemm ne génère
          jamais de likes artificiels, n'en vend pas, et n'augmente jamais le compteur d'un compte
          parce qu'il paierait.
        </p>
        <p>
          Si une mise en avant payante était proposée à l'avenir, elle serait clairement identifiée
          comme promotionnelle et n'augmenterait que la visibilité — jamais le nombre de likes.
        </p>
      </Section>

      <Section id="consequences" title="6. Ce qui se passe en cas de manquement">
        <p>Selon la gravité et le contexte, les mesures suivantes peuvent être prises :</p>
        <ul>
          <li>avertissement ;</li>
          <li>suppression d'une photo, d'une bio ou de liens ;</li>
          <li>retrait des likes obtenus de manière frauduleuse ;</li>
          <li>limitation temporaire de certaines actions ;</li>
          <li>masquage du profil ;</li>
          <li>suspension temporaire du compte ;</li>
          <li>bannissement définitif.</li>
        </ul>
        <p>
          Chaque mesure est enregistrée avec son motif, la règle concernée, sa date, sa durée et son
          auteur. Vous en êtes informé et vous pouvez la <Link to="/appeal">contester</Link>. La
          procédure complète figure dans <Link to="/moderation">Modération et recours</Link>.
        </p>
      </Section>

      <Section id="signaler" title="7. Signaler un problème">
        <p>
          Un bouton « Signaler » est présent sur chaque profil. Vous pouvez aussi passer par la page{" "}
          <Link to="/report">Signaler un problème</Link>. Le formulaire ne demande que les
          informations nécessaires à l'examen, et la personne signalée n'est pas informée de votre
          identité.
        </p>
      </Section>
    </LegalLayout>
  );
}
