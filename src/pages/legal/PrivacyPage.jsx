/* =============================================================================
   LIKEMM — Politique de confidentialité (§14 / §15 / §35 / §37 / §43 / §52)
   =============================================================================
   Aucune durée de conservation n'est affirmée comme juridiquement obligatoire
   lorsqu'elle n'a pas été fixée : ces durées apparaissent comme des
   placeholders à compléter par le responsable du traitement (§52).
   ========================================================================== */

import { Link } from "react-router-dom";
import { LegalLayout, Section } from "./LegalLayout.jsx";
import { Callout, ToComplete } from "../../components/atoms.jsx";
import { CONTACT_EMAIL, MIN_AGE } from "../../lib/config.js";

const SUMMARY = [
  ["responsable", "Responsable du traitement"],
  ["donnees", "Données collectées"],
  ["finalites", "Finalités et bases légales"],
  ["destinataires", "Destinataires et sous-traitants"],
  ["hebergement", "Hébergement et sécurité"],
  ["transferts", "Transferts hors Union européenne"],
  ["conservation", "Durées de conservation"],
  ["droits", "Vos droits"],
  ["mineurs", "Protection des mineurs"],
  ["cookies", "Cookies et mesure d'audience"],
  ["publicite", "Publicité"],
  ["statistiques", "Statistiques agrégées"],
  ["suppression", "Suppression du compte"],
  ["modifications", "Modifications de la politique"],
  ["contact", "Contact"],
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Politique de confidentialité"
      subtitle="Quelles données sont traitées, pourquoi, par qui, et ce que vous pouvez faire."
      path="/privacy"
      summary={SUMMARY}
    >
      <Callout tone="warn" title="Document à finaliser">
        Les durées de conservation et l'identité du responsable du traitement doivent être
        renseignées par l'éditeur. Elles apparaissent en surbrillance. Aucune durée n'a été inventée
        ni présentée comme juridiquement obligatoire alors qu'elle ne l'est pas.
      </Callout>

      <Section id="responsable" title="1. Responsable du traitement">
        <p>
          Le responsable du traitement est l'éditeur du service :{" "}
          <ToComplete>IDENTITÉ DU RESPONSABLE DU TRAITEMENT À COMPLÉTER</ToComplete>, dont les
          coordonnées figurent dans les <Link to="/mentions-legales">mentions légales</Link>.
        </p>
        <p>
          Contact pour toute question relative aux données :{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          <ToComplete>DÉLÉGUÉ À LA PROTECTION DES DONNÉES : À COMPLÉTER S'IL EST DÉSIGNÉ — la désignation n'est obligatoire que dans certains cas</ToComplete>
        </p>
      </Section>

      <Section id="donnees" title="2. Données collectées">
        <h3>Données que vous fournissez</h3>
        <ul>
          <li>adresse email ;</li>
          <li>nom d'utilisateur ;</li>
          <li>mot de passe, conservé uniquement sous forme sécurisée par le système d'authentification — jamais en clair ;</li>
          <li>date de naissance ;</li>
          <li>photo de profil et image de couverture, si vous en ajoutez une ;</li>
          <li>bio et liens externes, si vous en ajoutez.</li>
        </ul>

        <h3>Données générées par votre utilisation</h3>
        <ul>
          <li>likes donnés et reçus, avec leur date ;</li>
          <li>notifications ;</li>
          <li>historique de classement (positions enregistrées) ;</li>
          <li>paramètres de compte et de confidentialité ;</li>
          <li>consentements, avec leur date et la version des documents concernée ;</li>
          <li>signalements que vous déposez, contestations, demandes relatives à vos données.</li>
        </ul>

        <h3>Données de provenance</h3>
        <p>
          Lorsque vous arrivez via un lien partagé ou une campagne, une catégorie de provenance est
          enregistrée (lien partagé, réseau social, campagne, recherche, accès direct) ainsi que les
          paramètres d'URL correspondants, par exemple <code>?ref=alex</code> ou{" "}
          <code>?utm_source=tiktok</code>. L'adresse complète de la page d'origine n'est pas
          conservée.
        </p>

        <h3>Données de sécurité et d'anti-fraude</h3>
        <p>
          Pour détecter les abus (comptes automatisés, manipulation du classement), le service peut
          traiter des éléments techniques liés à vos connexions. Lorsqu'une adresse IP est utilisée
          comme signal, elle n'est <strong>pas conservée en clair</strong> : seule une empreinte non
          réversible est enregistrée, et elle ne constitue jamais à elle seule une preuve de fraude.
        </p>
        <p>
          Le système d'authentification conserve par ailleurs ses propres journaux techniques
          (connexions, tentatives), nécessaires à la sécurité du service.
        </p>

        <h3>Ce qui n'est pas collecté</h3>
        <ul>
          <li>aucune donnée de géolocalisation précise ;</li>
          <li>aucun contact, carnet d'adresses ou contenu de vos autres applications ;</li>
          <li>aucune donnée sensible au sens du RGPD n'est demandée ;</li>
          <li>aucune adresse email ni donnée personnelle n'est insérée dans les événements de mesure d'audience : ils ne contiennent qu'un identifiant interne et des informations non personnelles, filtrées côté serveur.</li>
        </ul>
      </Section>

      <Section id="finalites" title="3. Finalités et bases légales">
        <p>Chaque traitement poursuit une finalité précise et repose sur une base légale :</p>
        <ul>
          <li>
            <strong>Fournir le service</strong> (compte, profil, likes, classements, notifications,
            recherche, partage) — exécution du contrat que constituent les conditions d'utilisation.
          </li>
          <li>
            <strong>Sécurité, prévention de la fraude et des abus</strong> — intérêt légitime du
            service et de ses utilisateurs à disposer d'un classement fiable et d'un espace sûr.
          </li>
          <li>
            <strong>Modération</strong>, traitement des signalements et des contestations —
            exécution du contrat et, le cas échéant, respect d'obligations légales.
          </li>
          <li>
            <strong>Mesure d'audience</strong> (pages consultées, recherches, partages) —{" "}
            <strong>consentement</strong>. Sans consentement, aucun événement de mesure n'est
            enregistré.
          </li>
          <li>
            <strong>Personnalisation</strong> — consentement.
          </li>
          <li>
            <strong>Publicité</strong> — consentement, et jamais pour les comptes de moins de
            18 ans.
          </li>
          <li>
            <strong>Emails d'actualités</strong> — consentement, distinct des emails nécessaires au
            fonctionnement (confirmation d'adresse, réinitialisation de mot de passe, sécurité).
          </li>
          <li>
            <strong>Respect d'obligations légales</strong> — lorsque la loi applicable l'impose.
          </li>
        </ul>
        <Callout tone="neutral" title="Une précision utile">
          Les chiffres de suivi du service (nombre de comptes, de likes, d'inscriptions, taux de
          retour) sont calculés directement à partir des données déjà nécessaires au fonctionnement.
          Ils ne dépendent donc pas de votre consentement à la mesure d'audience, puisqu'aucune
          donnée supplémentaire n'est collectée pour les produire.
        </Callout>
      </Section>

      <Section id="destinataires" title="4. Destinataires et sous-traitants">
        <p>
          Vos données ne sont ni vendues, ni louées, ni cédées. Elles sont accessibles à l'éditeur du
          service et à l'équipe de modération, dans la limite de ce qui est nécessaire à leurs
          missions, et aux prestataires techniques suivants :
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — base de données, authentification, stockage des images.
            Région du projet : <ToComplete>À COMPLÉTER</ToComplete>
          </li>
          <li>
            <strong>Hébergeur du site</strong> — <ToComplete>À COMPLÉTER</ToComplete>
          </li>
          <li>
            <strong>Google</strong> et <strong>Apple</strong> — uniquement si vous choisissez de vous
            connecter via ces fournisseurs.
          </li>
          <li>
            <strong>Google Analytics</strong> — uniquement après consentement à la mesure d'audience,
            et seulement si le service est configuré.
          </li>
          <li>
            <strong>Fournisseur d'envoi d'emails</strong> — <ToComplete>NON ENCORE CHOISI</ToComplete>
          </li>
          <li>
            <strong>Régies publicitaires</strong> — non activées à ce jour.
          </li>
        </ul>
        <p>
          Les données peuvent également être communiquées aux autorités lorsque la loi applicable
          l'exige.
        </p>
      </Section>

      <Section id="hebergement" title="5. Hébergement et sécurité">
        <p>Les mesures suivantes sont effectivement mises en œuvre :</p>
        <ul>
          <li>connexion au site en HTTPS ;</li>
          <li>mots de passe jamais stockés en clair ;</li>
          <li>règles d'accès au niveau de la base de données : chaque utilisateur ne peut lire et modifier que ses propres données ;</li>
          <li>les données personnelles (date de naissance, préférences) sont isolées des données publiques du profil ;</li>
          <li>les opérations sensibles (like, changement de nom d'utilisateur, signalement, suppression, modération) passent par des fonctions serveur qui revérifient les droits ;</li>
          <li>limitation du nombre d'actions par période, côté serveur ;</li>
          <li>aucune clé secrète n'est présente dans le code envoyé au navigateur ;</li>
          <li>journalisation de toutes les actions de modération.</li>
        </ul>
        <p>
          Aucune mesure ne rend un système invulnérable. En cas de violation de données susceptible
          d'engendrer un risque pour vos droits, les personnes concernées et les autorités
          compétentes sont informées dans les conditions prévues par la réglementation applicable.
        </p>
      </Section>

      <Section id="transferts" title="6. Transferts hors Union européenne">
        <p>
          Certains prestataires peuvent traiter des données en dehors de l'Union européenne. Le
          service étant destiné à des utilisateurs du monde entier, ces transferts sont possibles.
        </p>
        <p>
          Mécanisme juridique applicable à chaque transfert :{" "}
          <ToComplete>À COMPLÉTER PAR LE RESPONSABLE DU TRAITEMENT — par exemple : décision d'adéquation, clauses contractuelles types, ou autre garantie appropriée, à identifier prestataire par prestataire</ToComplete>
        </p>
        <Callout tone="warn">
          Cette section ne peut pas être complétée de manière générique : affirmer qu'un transfert est
          conforme sans identifier le mécanisme juridique applicable serait inexact. Elle doit être
          renseignée avant la mise en production.
        </Callout>
      </Section>

      <Section id="conservation" title="7. Durées de conservation">
        <p>
          Les données sont conservées le temps nécessaire aux finalités décrites ci-dessus. Les
          durées précises doivent être arrêtées par le responsable du traitement :
        </p>
        <ul>
          <li>Compte et profil : jusqu'à la suppression du compte par l'utilisateur.</li>
          <li>Likes et classements : jusqu'à la suppression du compte concerné.</li>
          <li>Notifications : <ToComplete>DURÉE À COMPLÉTER</ToComplete></li>
          <li>Historique de classement : <ToComplete>DURÉE À COMPLÉTER</ToComplete></li>
          <li>Événements de mesure d'audience : <ToComplete>DURÉE À COMPLÉTER — valeur technique actuellement configurée : 14 mois</ToComplete></li>
          <li>Signalements, sanctions et contestations : <ToComplete>DURÉE À COMPLÉTER</ToComplete></li>
          <li>Signaux d'anti-fraude : <ToComplete>DURÉE À COMPLÉTER</ToComplete></li>
          <li>Preuves de consentement : <ToComplete>DURÉE À COMPLÉTER</ToComplete></li>
          <li>Journaux techniques d'authentification : selon les paramètres du prestataire — <ToComplete>À VÉRIFIER ET COMPLÉTER</ToComplete></li>
        </ul>
      </Section>

      <Section id="droits" title="8. Vos droits">
        <p>Selon le droit applicable, vous disposez notamment des droits suivants :</p>
        <ul>
          <li><strong>Accès</strong> — savoir quelles données vous concernant sont traitées.</li>
          <li><strong>Rectification</strong> — faire corriger une donnée inexacte.</li>
          <li><strong>Effacement</strong> — demander la suppression de vos données.</li>
          <li><strong>Limitation</strong> du traitement, lorsque les conditions sont réunies.</li>
          <li><strong>Opposition</strong> à un traitement fondé sur l'intérêt légitime.</li>
          <li><strong>Portabilité</strong> — recevoir vos données dans un format lisible par machine.</li>
          <li><strong>Retrait du consentement</strong>, à tout moment, lorsque le traitement repose sur le consentement. Le retrait ne remet pas en cause la licéité du traitement effectué avant.</li>
        </ul>
        <p>
          Vous pouvez exercer ces droits depuis la page{" "}
          <Link to="/data-rights">Mes données et mes droits</Link>, qui permet aussi de télécharger
          immédiatement vos données au format JSON, ou en écrivant à{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <Callout tone="info">
          L'étendue de chaque droit et le délai de réponse dépendent du fondement juridique du
          traitement et de la nature de la demande. Aucun délai absolu n'est promis ici : la demande
          est enregistrée, traitée, et la réponse est motivée.
        </Callout>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir l'autorité de
          protection des données compétente — en France, la CNIL.
        </p>
      </Section>

      <Section id="mineurs" title="9. Protection des mineurs">
        <p>
          Likemm est accessible à partir de {MIN_AGE} ans. Pour les comptes de moins de 18 ans :
        </p>
        <ul>
          <li>le profil est privé par défaut ;</li>
          <li>la publicité ciblée et le profilage publicitaire sont désactivés, y compris si un consentement publicitaire était donné par erreur ;</li>
          <li>les informations de confidentialité sont présentées en langage simple ;</li>
          <li>les outils de signalement sont directement accessibles.</li>
        </ul>
        <p>
          Pour les utilisateurs de moins de 15 ans résidant en France, lorsque le traitement repose
          sur le consentement, l'autorisation d'un titulaire de l'autorité parentale est requise et
          une trace de cette autorisation est conservée. Aucune pièce d'identité n'est demandée pour
          s'inscrire.
        </p>
      </Section>

      <Section id="cookies" title="10. Cookies et mesure d'audience">
        <p>
          Le détail figure dans la page <Link to="/cookies">Cookies et traceurs</Link>. En résumé :
          les cookies strictement nécessaires (session, sécurité, préférence de thème) fonctionnent
          sans consentement ; les traceurs de mesure d'audience, de personnalisation et de publicité
          ne sont <strong>pas chargés</strong> avant votre accord.
        </p>
      </Section>

      <Section id="publicite" title="11. Publicité">
        <p>
          Aucune publicité n'est diffusée à ce jour. Si de la publicité était introduite, elle
          reposerait sur votre consentement, serait désactivée pour les comptes mineurs, et ne
          modifierait jamais le nombre de likes ni le classement.
        </p>
      </Section>

      <Section id="statistiques" title="12. Statistiques agrégées">
        <p>
          Likemm souhaite à terme produire des statistiques sur les comportements sociaux observés
          sur le service (nombre moyen de likes, évolution de la popularité, fréquence des
          interactions). Ces statistiques seraient <strong>agrégées et anonymisées</strong> : elles
          ne permettraient pas d'identifier une personne.
        </p>
        <p>
          Aucune donnée comportementale n'est transformée en profil détaillé d'une personne, et aucune
          information privée n'est publiée.
        </p>
      </Section>

      <Section id="suppression" title="13. Suppression du compte">
        <p>
          La suppression est réelle. Sont supprimés : le profil, le nom d'utilisateur, la photo et la
          couverture, les données personnelles associées, les likes donnés et reçus, les
          notifications, l'historique de classement et les consentements. Les classements sont
          recalculés.
        </p>
        <p>
          Après suppression, une référence <strong>pseudonymisée</strong> et non réversible est
          conservée, uniquement pour la sécurité et la lutte contre la fraude — par exemple pour
          détecter qu'un compte banni se recrée. Elle ne permet pas de remonter à une personne.
        </p>
        <p>
          Les décisions de modération déjà prises restent enregistrées, mais l'identifiant de la
          personne concernée y est effacé : on conserve le fait qu'une décision a été prise, pas
          l'identité de la personne.
        </p>
        <p>
          Détail complet : <Link to="/account-deletion">Supprimer mon compte</Link>.
        </p>
      </Section>

      <Section id="modifications" title="14. Modifications de la politique">
        <p>
          Cette politique peut évoluer. Chaque version porte un identifiant, et la version en vigueur
          au moment de votre consentement est enregistrée. En cas de modification substantielle, votre
          choix pourra vous être redemandé.
        </p>
      </Section>

      <Section id="contact" title="15. Contact">
        <p>
          Pour toute question relative à vos données :{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <Callout tone="warn" title="Aucune conformité n'est garantie ici">
          Ce document a été rédigé pour décrire fidèlement le fonctionnement réel du service et
          améliorer sa conformité. Il ne constitue ni une certification, ni une garantie de
          conformité au RGPD ou au règlement sur les services numériques. La conformité finale doit
          être vérifiée par le responsable du traitement et, si nécessaire, par un professionnel du
          droit.
        </Callout>
      </Section>
    </LegalLayout>
  );
}
