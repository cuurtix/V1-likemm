# Checklist avant mise en production

À parcourir intégralement avant d'ouvrir le service aux premiers utilisateurs.
Les points marqués **bloquant** doivent être traités ; les autres sont à vérifier.

---

## Backend

- [ ] Les 12 migrations sont appliquées **dans l'ordre**
- [ ] `select relname from pg_class ... where not relrowsecurity` ne renvoie rien
      (RLS active sur toutes les tables de `public`)
- [ ] Aucune écriture directe accordée sur `likes`, `profile_stats`, `user_roles`,
      `sanctions`, `admin_actions`, `fraud_signals`, `analytics_events`,
      `leaderboard_cache`, `rate_limit_hits`
- [ ] Buckets `avatars` et `covers` créés, avec limite de taille et types MIME
- [ ] Les 148 tests de sécurité passent sur une base locale
- [ ] **Bloquant** — le rôle `owner` est attribué à votre compte
- [ ] pg_cron activé et les 6 tâches planifiées installées *(sinon l'historique
      de classement et les notifications de progression ne seront jamais générés,
      et les suspensions ne se lèveront pas automatiquement)*
- [ ] Confirmation d'email activée dans Supabase Auth
- [ ] Site URL et Redirect URLs renseignées

## Frontend

- [ ] `.env` créé, **jamais** commité (`npm run audit:mock` le vérifie)
- [ ] `npm run build` réussit
- [ ] `npm run audit:mock` ne signale rien
- [ ] `dist/` téléversé **avec** le `.htaccess`
- [ ] **Bloquant** — `https://VOTRE-PROJET.supabase.co` remplacé par l'URL réelle
      dans la règle CSP du `.htaccess`
- [ ] Rafraîchir directement `likemm.site/@untel` ne produit pas un 404 Apache
- [ ] `likemm.site/.env` renvoie 403
- [ ] HTTPS actif, redirection depuis HTTP fonctionnelle

## Documents juridiques — **bloquant**

Tous les `[À COMPLÉTER]` en surbrillance doivent disparaître :

- [ ] Identité, statut et adresse de l'éditeur (mentions légales)
- [ ] Responsable de la publication
- [ ] Hébergeur : nom, adresse, contact
- [ ] Région du projet Supabase
- [ ] Responsable du traitement (politique de confidentialité)
- [ ] Délégué à la protection des données, s'il est désigné
- [ ] Durées de conservation : notifications, historique de classement,
      événements analytiques, signalements et sanctions, signaux anti-fraude,
      preuves de consentement, journaux d'authentification
- [ ] Mécanisme juridique de chaque transfert hors Union européenne
- [ ] Qualification du service au regard des obligations applicables aux
      plateformes en ligne
- [ ] Dispositif de médiation, si l'éditeur y est soumis
- [ ] Liste des sous-traitants mise à jour (seuls les services réellement actifs
      sont déclarés actifs)

Vérifier également qu'**aucune page n'affirme** une certification, une conformité
RGPD garantie ou une conformité DSA garantie. Le texte livré ne le fait pas :
ne l'ajoutez pas.

## Parcours produit à tester réellement

Avec deux comptes A et B :

- [ ] A s'inscrit, confirme son email, complète l'onboarding
- [ ] A partage son profil et le lien s'ouvre correctement
- [ ] B s'inscrit depuis le lien de A *(la provenance « partage » doit être
      enregistrée)*
- [ ] B recherche A, ouvre son profil, le like
- [ ] Le compteur de A change réellement, le classement bouge
- [ ] A reçoit la notification
- [ ] B ne peut pas liker A une seconde fois
- [ ] B retire son like, tout revient en arrière
- [ ] A active « masquer mes likes » : B ne voit plus qui l'a liké, mais le
      compteur reste juste
- [ ] A passe son profil en privé : il disparaît du classement et de la
      recherche, et le message affiché explique pourquoi
- [ ] A génère un lien privé, B y accède, A le révoque, B n'y accède plus
- [ ] B bloque A : plus d'interaction possible dans les deux sens
- [ ] B signale A, le signalement apparaît dans `/admin`
- [ ] Un modérateur sanctionne, l'utilisateur voit le motif et conteste
- [ ] La contestation acceptée lève réellement la sanction

## Cas limites

- [ ] Base vide : le site est utilisable, les états vides sont propres
- [ ] Un seul utilisateur : le podium ne s'affiche pas, le classement montre une
      seule ligne
- [ ] Profil sans photo : avatar par défaut, pas d'image empruntée ailleurs
- [ ] Profil sans bio : « Cette personne n'a pas encore ajouté de bio »
- [ ] Pseudo déjà pris à l'inscription : message clair
- [ ] Date de naissance sous 13 ans : inscription refusée
- [ ] Session expirée : redirection vers la connexion, pas d'écran cassé
- [ ] Backend injoignable : « Connexion impossible », bouton Réessayer
- [ ] Upload d'un fichier trop lourd ou d'un mauvais format : message explicite
- [ ] `/route-inexistante` : vraie page 404 avec retour
- [ ] `@pseudo-inexistant` : « Ce profil n'existe pas », pas un 404 générique

## Confidentialité et consentement

- [ ] La bannière apparaît à la première visite
- [ ] « Tout refuser » a la même taille et la même visibilité que « Tout accepter »
- [ ] Refuser : aucun script de mesure n'est chargé *(onglet Réseau du navigateur)*
- [ ] Accepter puis retirer : la collecte s'arrête réellement
- [ ] Le choix est retrouvé après reconnexion sur un autre appareil
- [ ] Un compte mineur ne peut pas activer le consentement publicitaire
- [ ] L'export JSON se télécharge et contient bien les données attendues
- [ ] La suppression de compte supprime réellement — vérifier en base

## Accessibilité et responsive

- [ ] Navigation au clavier possible sur les formulaires principaux
- [ ] Les états de focus sont visibles
- [ ] Aucune page ne déborde horizontalement en 390 px de large
- [ ] Les images ont un texte alternatif
- [ ] Les messages d'erreur sont annoncés *(`role="alert"`)*
- [ ] Thème clair et thème sombre vérifiés

Le test `node scripts/smoke-test.mjs` couvre automatiquement le débordement
horizontal, les erreurs JavaScript, la bannière de consentement et le thème
sombre sur toutes les routes, en mobile et en desktop.

## Sécurité — contrôles finaux

- [ ] Aucune clé de service, aucun secret, aucun JWT dans le dépôt
- [ ] Tenter, connecté en tant qu'utilisateur ordinaire :
      `update profiles set status='active' where id <> auth.uid()` → refusé
- [ ] Tenter `insert into user_roles ...` → refusé
- [ ] Tenter `insert into likes ...` → refusé
- [ ] Appeler `mod_sanction_user()` sans rôle → « Action réservée à l'équipe de
      modération »
- [ ] Une sauvegarde de la base a été testée *(restauration comprise)*

---

## Après le lancement

- Surveiller `/admin` → Anti-fraude pendant les premiers jours
- Traiter les signalements et les contestations rapidement : la qualité de la
  modération se juge sur le délai
- Rejouer `supabase/tests/10_security_tests.sql` après toute modification du
  schéma
- Relancer `npm run audit:mock` avant chaque déploiement
