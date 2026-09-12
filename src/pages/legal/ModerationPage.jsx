/* =============================================================================
   LIKEMM — Modération et recours (§22 / §23 / §24 / §44 / §45)
   =============================================================================
   §44 : « Ne pas implémenter de fausse conformité. Si une obligation dépend de
   la taille ou du statut juridique du service, documenter cette dépendance au
   lieu de prétendre que l'obligation s'applique automatiquement. »
   ========================================================================== */

import { Link } from "react-router-dom";
import { LegalLayout, Section } from "./LegalLayout.jsx";
import { Callout, ToComplete } from "../../components/atoms.jsx";
import { CONTACT_EMAIL } from "../../lib/config.js";

const SUMMARY = [
  ["qui", "Qui modère"],
  ["signalement", "Traitement d'un signalement"],
  ["mesures", "Mesures possibles"],
  ["information", "Information de la personne concernée"],
  ["contestation", "Contester une décision"],
  ["journal", "Traçabilité des décisions"],
  ["fraude", "Lutte contre la fraude"],
  ["dsa", "Obligations applicables aux plateformes en ligne"],
];

export default function ModerationPage() {
  return (
    <LegalLayout
      title="Modération et recours"
      subtitle="Comment les décisions sont prises, tracées, et comment les contester."
      path="/moderation"
      summary={SUMMARY}
    >
      <Section id="qui" title="1. Qui modère">
        <p>
          La modération est assurée par l'éditeur du service et par une équipe de modération. Les
          droits sont attribués par rôle :
        </p>
        <ul>
          <li><strong>Utilisateur</strong> — aucun droit de modération.</li>
          <li><strong>Modérateur</strong> — examen des signalements, retrait de contenus, retrait de likes frauduleux, avertissement, limitation, suspension.</li>
          <li><strong>Administrateur</strong> — en plus : bannissement définitif, accès aux statistiques et au journal administratif.</li>
          <li><strong>Propriétaire</strong> — en plus : attribution des rôles.</li>
        </ul>
        <p>
          Ces droits sont vérifiés par la base de données à chaque action. Un modérateur ne peut pas
          sanctionner un compte de rôle égal ou supérieur au sien, ni son propre compte.
        </p>
      </Section>

      <Section id="signalement" title="2. Traitement d'un signalement">
        <ol>
          <li>Un signalement est déposé depuis un profil ou depuis la page dédiée.</li>
          <li>Il est enregistré avec son motif, sa description, son auteur et sa date.</li>
          <li>Un modérateur l'examine, en consultant les éléments nécessaires à la décision.</li>
          <li>Une décision motivée est prise : mesure appliquée, ou signalement rejeté.</li>
          <li>La décision et sa justification sont enregistrées.</li>
        </ol>
        <p>
          Un même utilisateur ne peut pas déposer plusieurs signalements identiques en attente sur le
          même profil, afin d'éviter les signalements abusifs en masse.
        </p>
      </Section>

      <Section id="mesures" title="3. Mesures possibles">
        <ul>
          <li><strong>Avertissement</strong> — sans effet sur l'usage du compte.</li>
          <li><strong>Retrait de contenu</strong> — photo de profil, image de couverture, bio, liens.</li>
          <li><strong>Retrait de likes frauduleux</strong> — les compteurs et le classement sont recalculés.</li>
          <li><strong>Masquage du profil</strong> — le profil n'apparaît plus publiquement.</li>
          <li><strong>Limitation temporaire</strong> — pour une durée déterminée.</li>
          <li><strong>Suspension</strong> — le compte ne peut plus agir pendant une durée déterminée, mais peut contester.</li>
          <li><strong>Bannissement</strong> — mesure définitive, réservée aux administrateurs.</li>
        </ul>
        <p>
          Une suspension à durée déterminée prend fin automatiquement à son échéance : le compte est
          réactivé sans intervention.
        </p>
      </Section>

      <Section id="information" title="4. Information de la personne concernée">
        <p>
          Une personne sanctionnée voit, depuis son compte, le motif de la mesure, la règle
          concernée, la date de début, la date de fin le cas échéant, et la possibilité de contester.
          Cette information est affichée dès la connexion.
        </p>
      </Section>

      <Section id="contestation" title="5. Contester une décision">
        <p>
          Toute mesure contestable peut faire l'objet d'une demande de réexamen depuis la page{" "}
          <Link to="/appeal">Contester une décision</Link>. Un compte suspendu ou banni conserve
          l'accès à cette possibilité.
        </p>
        <p>Les statuts d'une contestation sont : en attente, en cours d'examen, acceptée, rejetée.</p>
        <p>
          Une contestation acceptée <strong>lève réellement la sanction</strong> et réactive le compte
          si aucune autre mesure ne s'y oppose. Une contestation par sanction est possible.
        </p>
        <Callout tone="info">
          Aucun délai de réponse absolu n'est promis : il dépend du volume et de la complexité des
          demandes. Chaque décision est motivée par écrit et vous est communiquée.
        </Callout>
      </Section>

      <Section id="journal" title="6. Traçabilité des décisions">
        <p>
          Chaque action de modération est journalisée : qui l'a effectuée, quelle action, sur quel
          compte, pour quelle raison et à quelle date. Ce journal n'est accessible qu'aux
          administrateurs. Il n'est jamais accessible aux utilisateurs, y compris aux personnes
          concernées par une décision, qui reçoivent en revanche la motivation les concernant.
        </p>
      </Section>

      <Section id="fraude" title="7. Lutte contre la fraude">
        <p>
          Le service observe des signaux susceptibles d'indiquer un comportement automatisé ou une
          manipulation du classement : volume anormal de likes, rythme anormal, schémas d'échange
          réciproque, rafales d'inscriptions.
        </p>
        <Callout tone="warn" title="Un signal n'est pas une preuve">
          Aucun compte n'est sanctionné automatiquement sur la base d'un seul signal. Une adresse IP
          peut être partagée par plusieurs personnes — un foyer, une école, un réseau mobile. Les
          décisions sont prises par une personne, après examen d'un faisceau d'éléments.
        </Callout>
        <p>
          Si aucune détection n'a eu lieu, aucune n'est affichée : le panneau de modération n'invente
          pas de fausse alerte pour paraître actif.
        </p>
      </Section>

      <Section id="dsa" title="8. Obligations applicables aux plateformes en ligne">
        <p>
          L'architecture de Likemm a été conçue pour être compatible avec les obligations applicables
          aux plateformes en ligne dans l'Union européenne : mécanisme de signalement accessible,
          traitement des notifications de contenu illégal, motivation des décisions de modération,
          possibilité de contestation, transparence des règles, et conservation des éléments
          nécessaires.
        </p>
        <Callout tone="warn" title="Ce que cette page n'affirme pas">
          Certaines obligations issues du règlement européen sur les services numériques dépendent de
          la taille du service, de son statut juridique et de sa qualification. Likemm ne prétend pas
          y être soumis automatiquement, ni y être conforme par principe. La qualification applicable
          au service doit être déterminée par l'éditeur :{" "}
          <ToComplete>QUALIFICATION ET OBLIGATIONS APPLICABLES À DÉTERMINER PAR L'ÉDITEUR, LE CAS ÉCHÉANT AVEC UN PROFESSIONNEL DU DROIT</ToComplete>
        </Callout>
        <p>
          Pour toute question relative à la modération :{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </LegalLayout>
  );
}
