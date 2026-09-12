/* =============================================================================
   LIKEMM — Mentions légales (§4 / §36 / §52)
   =============================================================================
   RÈGLE ABSOLUE appliquée ici : aucune information juridique n'est inventée.
   Ni adresse, ni numéro d'entreprise, ni hébergeur, ni responsable de
   publication. Tout ce qui doit être renseigné par l'éditeur apparaît comme un
   placeholder visible, impossible à confondre avec une donnée réelle.
   ========================================================================== */

import { LegalLayout, Section } from "./LegalLayout.jsx";
import { Callout, ToComplete } from "../../components/atoms.jsx";
import { CONTACT_EMAIL } from "../../lib/config.js";

const SUMMARY = [
  ["editeur", "Éditeur du service"],
  ["publication", "Responsable de la publication"],
  ["contact", "Contact"],
  ["hebergeur", "Hébergeur"],
  ["prestataires", "Prestataires techniques"],
  ["propriete", "Propriété intellectuelle"],
  ["service", "Informations relatives au service"],
  ["droit", "Droit applicable"],
];

export default function MentionsLegalesPage() {
  return (
    <LegalLayout
      title="Mentions légales"
      subtitle="Qui édite Likemm, qui l'héberge, et avec quels prestataires."
      path="/mentions-legales"
      summary={SUMMARY}
    >
      <Callout tone="warn" title="À compléter avant la mise en production">
        Les informations en surbrillance doivent être renseignées par l'éditeur du service. Tant
        qu'elles ne le sont pas, cette page n'est pas complète. Aucune valeur n'a été inventée pour
        les remplacer.
      </Callout>

      <Section id="editeur" title="1. Éditeur du service">
        <p>
          Le site <strong>likemm.site</strong> est actuellement exploité par une personne physique
          située en France. Aucune société n'est constituée à ce jour.
        </p>
        <ul>
          <li>Identité de l'éditeur : <ToComplete>NOM ET PRÉNOM À COMPLÉTER</ToComplete></li>
          <li>Statut : <ToComplete>STATUT JURIDIQUE À COMPLÉTER — par exemple : personne physique, entrepreneur individuel</ToComplete></li>
          <li>Adresse : <ToComplete>ADRESSE À COMPLÉTER</ToComplete></li>
          <li>Numéro d'identification, le cas échéant : <ToComplete>SIREN / SIRET À COMPLÉTER SI APPLICABLE</ToComplete></li>
          <li>Numéro de TVA intracommunautaire, le cas échéant : <ToComplete>À COMPLÉTER SI APPLICABLE</ToComplete></li>
          <li>Téléphone : <ToComplete>NUMÉRO À COMPLÉTER SI L'ÉDITEUR SOUHAITE EN PUBLIER UN</ToComplete></li>
        </ul>
        <p>
          Certaines de ces mentions ne sont obligatoires que selon le statut de l'éditeur et la
          nature de l'activité (notamment selon qu'elle est exercée à titre professionnel ou non).
          Cette dépendance est signalée ici plutôt que d'affirmer qu'elles s'appliquent
          automatiquement.
        </p>
      </Section>

      <Section id="publication" title="2. Responsable de la publication">
        <p>
          Responsable de la publication : <ToComplete>NOM DU RESPONSABLE DE PUBLICATION À COMPLÉTER</ToComplete>
        </p>
      </Section>

      <Section id="contact" title="3. Contact">
        <p>
          Pour toute question concernant le service, un signalement, une réclamation ou l'exercice
          de vos droits :
        </p>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          C'est la seule adresse de contact du service. Aucune autre coordonnée n'est publiée tant
          qu'elle n'a pas été renseignée par l'éditeur.
        </p>
      </Section>

      <Section id="hebergeur" title="4. Hébergeur">
        <ul>
          <li>Hébergeur du site : <ToComplete>NOM DE L'HÉBERGEUR À COMPLÉTER</ToComplete></li>
          <li>Adresse : <ToComplete>ADRESSE DE L'HÉBERGEUR À COMPLÉTER</ToComplete></li>
          <li>Contact : <ToComplete>CONTACT DE L'HÉBERGEUR À COMPLÉTER</ToComplete></li>
        </ul>
        <p>
          L'hébergement des données applicatives (comptes, profils, likes, images) est assuré par le
          prestataire mentionné à la section suivante.
        </p>
      </Section>

      <Section id="prestataires" title="5. Prestataires techniques">
        <p>
          Likemm s'appuie sur des prestataires pour fonctionner. Ne sont déclarés actifs que les
          services réellement utilisés à ce jour :
        </p>
        <h3>Prestataires actuellement utilisés</h3>
        <ul>
          <li>
            <strong>Supabase</strong> — base de données, authentification et stockage des images.
            Localisation de la région du projet : <ToComplete>RÉGION DU PROJET SUPABASE À COMPLÉTER</ToComplete>
          </li>
          <li>
            <strong>Hébergement du site</strong> — <ToComplete>HÉBERGEUR À COMPLÉTER</ToComplete>
          </li>
        </ul>

        <h3>Prestataires envisagés, non encore activés</h3>
        <p>
          Les services suivants sont prévus dans l'architecture mais ne sont pas actifs. Ils ne
          traitent aucune donnée aujourd'hui. Cette liste sera mise à jour au fur et à mesure de leur
          activation :
        </p>
        <ul>
          <li>Mesure d'audience (Google Analytics) — activée uniquement après consentement</li>
          <li>Connexion Google et Apple — actives uniquement si les fournisseurs sont configurés</li>
          <li>Fournisseur d'envoi d'emails — <ToComplete>NON ENCORE CHOISI</ToComplete></li>
          <li>Régies publicitaires — non activées</li>
          <li>Stripe — non activé, aucun paiement n'est proposé à ce jour</li>
        </ul>
      </Section>

      <Section id="propriete" title="6. Propriété intellectuelle">
        <p>
          La marque « Likemm », le nom de domaine, l'identité visuelle, la structure du site et son
          code sont la propriété de l'éditeur ou font l'objet d'une licence à son bénéfice. Toute
          reproduction ou exploitation non autorisée est interdite.
        </p>
        <p>
          Les contenus publiés par les utilisateurs (photo de profil, image de couverture, bio,
          liens) restent leur propriété. En les publiant, l'utilisateur accorde au service
          l'autorisation strictement nécessaire pour les afficher dans le cadre du fonctionnement de
          Likemm — profil, classement et prévisualisation de partage. Cette autorisation prend fin
          lorsque le contenu est supprimé, sous réserve des délais techniques de propagation et des
          copies de sauvegarde.
        </p>
      </Section>

      <Section id="service" title="7. Informations relatives au service">
        <p>
          Likemm est un service de classement de popularité. Les utilisateurs créent un profil et
          peuvent recevoir des « likes » d'autres utilisateurs. Le nombre de likes reçus détermine la
          position dans deux classements : un classement général et un classement sur 24 heures
          glissantes.
        </p>
        <p>
          Le service est gratuit. Une monétisation pourra être introduite ultérieurement
          (publicité, fonctionnalités payantes, mise en avant). Elle ne modifiera jamais le nombre
          réel de likes : <strong>Likemm ne vend pas de likes</strong> et une mise en avant payante
          ne peut pas créer de likes artificiels.
        </p>
      </Section>

      <Section id="droit" title="8. Droit applicable">
        <p>
          Le service est exploité depuis la France et destiné à des utilisateurs situés dans le monde
          entier. Les présentes mentions sont soumises au droit français et, lorsqu'il s'applique, au
          droit de l'Union européenne.
        </p>
        <Callout tone="info">
          Si vous résidez dans un autre pays, les règles impératives applicables dans votre pays de
          résidence — notamment en matière de protection des consommateurs et de protection des
          données — continuent de s'appliquer. Le choix du droit français ne les écarte pas.
        </Callout>
      </Section>
    </LegalLayout>
  );
}
