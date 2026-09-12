/* =============================================================================
   LIKEMM — Conditions générales d'utilisation (§5 / §9 / §10 / §11 / §13 /
   §19 / §20 / §26 / §52)
   ========================================================================== */

import { Link } from "react-router-dom";
import { LegalLayout, Section } from "./LegalLayout.jsx";
import { Callout, ToComplete } from "../../components/atoms.jsx";
import { CONTACT_EMAIL, MIN_AGE } from "../../lib/config.js";

const SUMMARY = [
  ["objet", "Objet du service"],
  ["compte", "Création du compte"],
  ["age", "Âge minimum et comptes mineurs"],
  ["profil", "Profil, visibilité et contenus"],
  ["likes", "Système de likes"],
  ["classements", "Classements"],
  ["interdits", "Comportements interdits"],
  ["moderation", "Modération et sanctions"],
  ["suppression", "Suppression du compte"],
  ["donnees", "Données personnelles"],
  ["gratuite", "Gratuité et monétisation future"],
  ["disponibilite", "Disponibilité du service"],
  ["responsabilite", "Responsabilité"],
  ["modification", "Modification des présentes conditions"],
  ["droit", "Droit applicable et litiges"],
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Conditions générales d'utilisation"
      subtitle="Les règles d'utilisation de Likemm, en langage clair."
      path="/terms"
      summary={SUMMARY}
    >
      <p>
        Ces conditions encadrent l'utilisation de Likemm. En créant un compte, vous les acceptez.
        Elles sont rédigées pour être comprises : chaque section dit ce qui s'applique réellement au
        service tel qu'il fonctionne aujourd'hui.
      </p>

      <Section id="objet" title="1. Objet du service">
        <p>
          Likemm permet de créer un profil public ou privé et de recevoir des « likes » d'autres
          utilisateurs. Le nombre de likes reçus détermine une position dans deux classements :
        </p>
        <ul>
          <li><strong>Classement général</strong> : nombre total de likes reçus depuis la création du compte.</li>
          <li><strong>Classement 24 heures</strong> : likes reçus au cours des dernières 24 heures glissantes.</li>
        </ul>
        <p>
          Likemm n'est pas un réseau social complet : il n'y a ni messagerie, ni publications, ni
          commentaires, ni fil d'actualité. Le service se concentre sur le profil, le like, le
          classement et le partage.
        </p>
      </Section>

      <Section id="compte" title="2. Création du compte">
        <p>Pour créer un compte, vous fournissez :</p>
        <ul>
          <li>une adresse email valide ;</li>
          <li>un nom d'utilisateur unique ;</li>
          <li>un mot de passe ;</li>
          <li>votre date de naissance ;</li>
          <li>éventuellement une photo de profil.</li>
        </ul>
        <p>
          La connexion est également possible via Google ou Apple lorsque ces fournisseurs sont
          configurés. Dans ce cas, un nom d'utilisateur et une date de naissance vous sont demandés
          avant l'activation du compte.
        </p>
        <h3>Nom d'utilisateur</h3>
        <p>
          Le nom d'utilisateur est unique, en minuscules, de 3 à 20 caractères, composé de lettres,
          de chiffres et du caractère « _ ». Certains noms sont réservés (administration, marque,
          routes techniques) ou refusés lorsqu'ils visent manifestement à se faire passer pour
          quelqu'un d'autre. Vous pouvez en changer, dans la limite de deux changements par période
          de 30 jours, afin d'éviter les abus. Changer de nom d'utilisateur modifie l'adresse
          publique de votre profil : les liens précédemment partagés cessent de fonctionner.
        </p>
        <h3>Exactitude des informations</h3>
        <p>
          Vous vous engagez à fournir des informations exactes et à ne pas usurper l'identité d'une
          autre personne. Vous êtes responsable de la confidentialité de votre mot de passe.
        </p>
      </Section>

      <Section id="age" title="3. Âge minimum et comptes mineurs">
        <p>
          Likemm est accessible <strong>à partir de {MIN_AGE} ans</strong>. Les inscriptions
          en dessous de cet âge sont refusées.
        </p>
        <h3>Protections applicables aux comptes de moins de 18 ans</h3>
        <ul>
          <li>le profil est <strong>privé par défaut</strong> ;</li>
          <li>la publicité ciblée et le profilage publicitaire sont désactivés ;</li>
          <li>les outils de signalement sont accessibles depuis le profil et le pied de page ;</li>
          <li>les informations de confidentialité sont présentées en langage simple.</li>
        </ul>
        <h3>Utilisateurs de moins de 15 ans</h3>
        <p>
          En France, lorsque le traitement de données repose sur le consentement, celui d'un
          utilisateur de moins de 15 ans doit être accompagné de l'autorisation d'un titulaire de
          l'autorité parentale. Likemm demande cette autorisation et en conserve une trace. Le fait
          que le service soit accessible dès {MIN_AGE} ans ne signifie pas que toutes les opérations
          peuvent être effectuées sans accord parental.
        </p>
        <Callout tone="info">
          L'âge à partir duquel un mineur peut consentir seul varie selon les pays de l'Union
          européenne (entre 13 et 16 ans). Si vous résidez hors de France, la règle applicable est
          celle de votre pays de résidence.
        </Callout>
      </Section>

      <Section id="profil" title="4. Profil, visibilité et contenus">
        <p>Un profil peut contenir une photo, une image de couverture, un nom d'utilisateur, une bio et jusqu'à cinq liens externes (TikTok, Instagram, Discord, Snapchat, etc.). Les liens doivent utiliser le protocole https.</p>
        <h3>Profil public</h3>
        <p>
          Par défaut, le profil d'un utilisateur majeur est public. Il est accessible à l'adresse
          <code>likemm.site/@votre_nom</code> et apparaît dans les classements et la recherche.
        </p>
        <h3>Profil privé</h3>
        <p>
          Vous pouvez rendre votre profil privé à tout moment. Un profil privé n'est accessible qu'à
          vous-même et aux personnes disposant d'un lien d'invitation que vous générez. Ce lien
          contient un jeton aléatoire, révocable à tout moment. Un profil privé n'apparaît ni au
          classement public, ni dans la recherche, ni dans les moteurs de recherche.
        </p>
        <h3>Contenus publiés</h3>
        <p>
          Vous restez propriétaire de vos contenus. Vous garantissez disposer des droits nécessaires
          sur les images que vous publiez et vous engagez à ne rien publier d'illicite ou contraire
          aux <Link to="/community-guidelines">règles communautaires</Link>.
        </p>
      </Section>

      <Section id="likes" title="5. Système de likes">
        <ul>
          <li>Un utilisateur peut donner <strong>au maximum un like</strong> à un autre utilisateur.</li>
          <li>Un like peut être retiré à tout moment.</li>
          <li>Il est possible de liker son propre profil, une seule fois comme pour tout autre profil.</li>
          <li>Chaque like est enregistré avec son auteur, son destinataire et sa date.</li>
          <li>L'unicité est garantie techniquement au niveau de la base de données : il est impossible d'avoir deux likes actifs vers la même personne.</li>
        </ul>
        <p>
          Un utilisateur non connecté peut consulter un profil public mais ne peut pas liker. Il doit
          créer un compte pour interagir.
        </p>
        <h3>Visibilité des likes</h3>
        <p>
          Par défaut, une personne qui reçoit un like voit qui l'a donné. L'option « Masquer mes
          likes » permet de ne pas apparaître publiquement comme auteur des likes que vous donnez.
          Le like continue d'être comptabilisé normalement dans les classements.
        </p>
      </Section>

      <Section id="classements" title="6. Classements">
        <p>
          Les deux classements sont calculés à partir des likes réellement enregistrés. Le classement
          24 heures est calculé à partir des dates réelles des likes : un like reçu il y a plus de
          24 heures n'y figure plus.
        </p>
        <p>
          En cas d'égalité, les utilisateurs ayant le même nombre de likes partagent la même position
          (par exemple #1, #2, #2, #4). L'ordre d'affichage entre égaux est stable et déterministe.
        </p>
        <p>
          Un profil privé, suspendu, banni ou masqué par la modération n'apparaît pas au classement
          public.
        </p>
      </Section>

      <Section id="interdits" title="7. Comportements interdits">
        <p>
          Les <Link to="/community-guidelines">règles communautaires</Link> détaillent l'ensemble des
          comportements interdits. Sont notamment prohibés :
        </p>
        <ul>
          <li>l'utilisation de robots, de scripts ou de toute automatisation ;</li>
          <li>l'achat, la vente ou l'échange organisé de likes ;</li>
          <li>la création massive de comptes ou les faux comptes destinés à manipuler le classement ;</li>
          <li>l'usurpation d'identité ;</li>
          <li>le harcèlement, les menaces, la haine, la divulgation de données personnelles d'autrui ;</li>
          <li>les contenus à caractère sexuel impliquant des mineurs, ainsi que toute exploitation de mineurs ;</li>
          <li>la nudité, la pornographie, la violence, les contenus illégaux ;</li>
          <li>le spam et la publicité non autorisée.</li>
        </ul>
      </Section>

      <Section id="moderation" title="8. Modération et sanctions">
        <p>
          En cas de manquement, les mesures suivantes peuvent être prises : avertissement, retrait
          d'un contenu, retrait de likes frauduleux, limitation temporaire, suspension ou
          bannissement. Chaque mesure est enregistrée avec son motif, la règle concernée, sa date,
          sa durée et son auteur.
        </p>
        <p>
          Vous êtes informé de la mesure vous concernant et vous pouvez la{" "}
          <Link to="/appeal">contester</Link>. La procédure est décrite dans la page{" "}
          <Link to="/moderation">Modération et recours</Link>.
        </p>
      </Section>

      <Section id="suppression" title="9. Suppression du compte">
        <p>
          Vous pouvez supprimer votre compte à tout moment depuis la page{" "}
          <Link to="/account-deletion">Supprimer mon compte</Link>. La suppression entraîne
          l'effacement du profil, des données personnelles associées, des likes donnés et reçus, des
          notifications, de l'historique de classement et des images envoyées. Le détail de ce qui
          peut être conservé, et pourquoi, figure dans la{" "}
          <Link to="/privacy">politique de confidentialité</Link>.
        </p>
      </Section>

      <Section id="donnees" title="10. Données personnelles">
        <p>
          Le traitement de vos données est décrit dans la{" "}
          <Link to="/privacy">politique de confidentialité</Link>. Vos droits et la manière de les
          exercer sont détaillés dans la page{" "}
          <Link to="/data-rights">Mes données et mes droits</Link>.
        </p>
      </Section>

      <Section id="gratuite" title="11. Gratuité et monétisation future">
        <p>
          Likemm est gratuit. Une monétisation pourra être introduite ultérieurement : publicité,
          abonnement ou fonctionnalités premium, mise en avant de profil.
        </p>
        <Callout tone="info" title="Règle qui ne changera pas">
          Une mise en avant payante pourra augmenter la <strong>visibilité</strong> d'un profil. Elle
          ne pourra jamais augmenter son nombre de likes ni modifier artificiellement sa position au
          classement. Likemm ne vend pas de likes.
        </Callout>
      </Section>

      <Section id="disponibilite" title="12. Disponibilité du service">
        <p>
          Le service est fourni en l'état. Des interruptions peuvent survenir pour maintenance, en
          cas d'incident technique ou du fait d'un prestataire. Aucun niveau de disponibilité n'est
          garanti.
        </p>
      </Section>

      <Section id="responsabilite" title="13. Responsabilité">
        <p>
          L'éditeur est responsable du fonctionnement du service dans les conditions prévues par la
          loi applicable. Il n'est pas l'auteur des contenus publiés par les utilisateurs et agit sur
          signalement dans les conditions décrites par la page{" "}
          <Link to="/moderation">Modération et recours</Link>.
        </p>
        <p>
          Les dispositions impératives protégeant les consommateurs et les utilisateurs, notamment
          celles applicables dans votre pays de résidence, ne peuvent pas être écartées par les
          présentes conditions.
        </p>
      </Section>

      <Section id="modification" title="14. Modification des présentes conditions">
        <p>
          Ces conditions peuvent être modifiées. Chaque version porte un numéro, et la version que
          vous avez acceptée est enregistrée avec la date de votre acceptation. En cas de
          modification substantielle, une nouvelle acceptation pourra être demandée.
        </p>
      </Section>

      <Section id="droit" title="15. Droit applicable et litiges">
        <p>
          Les présentes conditions sont soumises au droit français et, lorsqu'il s'applique, au droit
          de l'Union européenne. Les règles impératives de votre pays de résidence restent
          applicables.
        </p>
        <p>
          En cas de difficulté, écrivez d'abord à{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Les voies de recours amiables ou
          juridictionnelles applicables dépendent de votre situation et du droit qui vous est
          applicable : <ToComplete>DISPOSITIFS DE MÉDIATION À COMPLÉTER SI L'ÉDITEUR Y EST SOUMIS</ToComplete>
        </p>
      </Section>
    </LegalLayout>
  );
}
