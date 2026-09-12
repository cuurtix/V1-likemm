# Modèle de sécurité

Le principe directeur : **le frontend n'est jamais ce qui protège**. Il est
entièrement lisible et modifiable par n'importe quel visiteur. Tout ce qui compte
est vérifié dans PostgreSQL.

---

## Les quatre couches

### 1. Droits par table et par colonne

Les migrations commencent par retirer **tous** les droits à `anon` et
`authenticated`, puis n'en réaccordent que le strict nécessaire.

C'est cette couche — et non la RLS — qui empêche un utilisateur de modifier son
propre `status`, son `username` ou son compteur de likes : la Row Level Security
filtre des **lignes**, jamais des **colonnes**.

```sql
grant update (bio, avatar_url, cover_url, external_links,
              is_private, hide_likes, profile_completed)
  on public.profiles to authenticated;
```

`status`, `username`, `setup_complete` et `hidden_by_moderation` sont absents de
cette liste. Une tentative de les écrire échoue avec une erreur de permission,
quelle que soit la requête envoyée.

Les tables `likes`, `profile_stats`, `user_roles`, `sanctions`, `admin_actions`,
`fraud_signals`, `analytics_events`, `leaderboard_cache`, `rate_limit_hits` et
`account_deletions` n'ont **aucun droit d'écriture** pour les clients.

### 2. Row Level Security

Activée sur toutes les tables de `public`. Quelques règles notables :

- **`profiles`** : on voit son propre profil, plus les profils actifs, publics,
  non masqués, et non impliqués dans un blocage mutuel. La modération voit tout.
- **`profile_private`** (date de naissance, préférences) : propriétaire
  uniquement. Ces données sont dans une table séparée précisément parce que la
  RLS ne sait pas masquer une colonne.
- **`likes`** : mes likes donnés ; les likes que j'ai reçus, sauf si leur auteur
  a activé « masquer mes likes » — le like compte toujours, il n'est simplement
  plus attribuable.
- **`analytics_events`**, **`admin_actions`**, **`fraud_signals`** : administration
  uniquement. Un utilisateur ne lit même pas ses propres événements bruts ; il les
  obtient par l'export RGPD.
- **`leaderboard_cache`** : aucun droit, aucune politique. Il contient aussi des
  profils non listables et n'est lu que par `get_leaderboard()`.

Les fonctions appelées depuis les politiques (`app.is_blocked_between`,
`app.profile_is_listable`, `app.hides_likes`) sont en `SECURITY DEFINER` à
dessein : une sous-requête écrite directement dans une politique serait
elle-même filtrée par la RLS de la table interrogée et donnerait des résultats
faux — un like reçu deviendrait invisible parce que son auteur a un profil privé.

### 3. Fonctions RPC

Toute opération sensible passe par une fonction SQL qui revérifie, dans cet
ordre : authentification → état du compte (actif, suspendu, banni, non finalisé)
→ blocages → quotas → règles métier → écriture.

`like_user()` illustre l'enchaînement complet : compte actif, cible existante et
disponible, absence de blocage, profil privé accompagné d'un token valide,
trois quotas (minute, heure, jour), enregistrement des signaux anti-fraude, puis
insertion réelle — l'unicité étant garantie par une contrainte
`UNIQUE (from_user_id, to_user_id)` qu'aucun code ne peut contourner.

Les fonctions de maintenance (`refresh_leaderboards`, `snapshot_ranks`,
`run_fraud_detection`, `purge_analytics_events`, `expire_sanctions`) ne sont
accordées à personne : elles sont appelées par pg_cron ou depuis le SQL editor.

### 4. Contraintes de base

Ce qui ne peut structurellement pas être faux :

| Contrainte | Ce qu'elle garantit |
|---|---|
| `UNIQUE (from_user_id, to_user_id)` sur `likes` | un seul like actif par paire |
| `UNIQUE (username)` + `CHECK` de format | pseudo unique et normalisé, sans JavaScript |
| `UNIQUE (sanction_id)` sur `appeals` | une contestation par sanction |
| index unique partiel sur `reports` | pas d'empilement de signalements identiques en attente |
| `CHECK (likes_total >= 0)` | pas de compteur négatif |
| `ON DELETE CASCADE` depuis `auth.users` | la suppression d'un compte efface réellement tout |

---

## Les secrets

Le build frontend est public : tout ce qu'il contient est lisible.

- Seules `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` y figurent. C'est prévu :
  la clé `anon` ne donne accès qu'à ce que la RLS autorise.
- La clé de service, le secret de signature des jetons et les mots de passe de
  base n'apparaissent nulle part. `npm run audit:mock` échoue s'ils sont
  introduits, et repère aussi tout JWT écrit en dur.
- `.env` est dans `.gitignore`, et l'audit vérifie que cette ligne y est.

Une clé interne (`app.secrets`) sert à pseudonymiser par HMAC les rares
références conservées après suppression de compte, ainsi que les empreintes
techniques de l'anti-fraude. Elle est générée à l'installation et n'est lisible
que par les fonctions `SECURITY DEFINER` : `anon` et `authenticated` n'ont aucun
droit sur les tables du schéma `app`.

---

## Stockage des images

Chaque fichier est écrit dans `<bucket>/<uuid_du_proprietaire>/…`. Les politiques
de `storage.objects` comparent ce dossier à `auth.uid()` : il est impossible
d'écrire dans l'espace d'un autre. Le type MIME et la taille sont limités au
niveau du bucket, donc côté serveur — un client modifié ne peut pas envoyer un
exécutable de 50 Mo. Le nom de fichier ne contient aucune donnée personnelle.

---

## Quotas et anti-abus

Les quotas sont appliqués **côté serveur** par `app.enforce_rate_limit()`, jamais
en JavaScript :

| Action | Quota |
|---|---|
| Likes | 20/min, 200/h, 600/jour |
| Unlike | 20/min |
| Signalements | 10/jour |
| Contestations | 5/jour |
| Changement de pseudo | 5/h, et 2 changements par 30 jours |
| Liens privés | 20/jour, 10 actifs maximum |
| Demandes RGPD | 10/jour |
| Export de données | 5/jour |
| Suppression de compte | 3/jour |
| Événements analytiques | 400/h |

L'anti-fraude produit des **signaux**, jamais des verdicts : volume et vitesse de
likes, échanges réciproques rapides et répétés, rafales d'inscriptions. Aucun
compte n'est sanctionné automatiquement. Une adresse IP peut être partagée — un
foyer, une école, un réseau mobile — et n'est jamais conservée en clair : seule
une empreinte HMAC sert de signal de corrélation. Le panneau de modération
affiche systématiquement le nombre d'autres signaux du même compte, pour que la
décision se prenne sur un faisceau et non sur un indice isolé.

---

## Modération

Quatre rôles : `user`, `moderator`, `admin`, `owner`. Le rôle est vérifié dans la
base à chaque action, pas dans l'interface.

- un modérateur ne peut pas agir sur un compte de rôle égal ou supérieur, ni sur
  le sien ;
- le bannissement définitif est réservé aux administrateurs ;
- seul le propriétaire attribue les rôles ;
- chaque action exige une raison écrite et écrit une ligne dans `admin_actions` ;
- une sanction enregistre son motif, la règle violée, sa durée, son auteur et la
  possibilité de contestation ;
- un compte suspendu ou banni **conserve** l'accès à la contestation, à l'export
  de ses données et à la suppression de son compte.

---

## Ce que ce document n'affirme pas

Ce projet a été conçu pour réduire la surface d'attaque et pour rendre les
garanties vérifiables. Il ne constitue ni un audit de sécurité, ni une
certification, ni une garantie de conformité réglementaire.

Points qui méritent une attention particulière avant un lancement à large
échelle :

- **Jeton d'accès après suppression de compte.** La suppression invalide les
  jetons de rafraîchissement, mais le jeton d'accès en cours reste
  techniquement valide jusqu'à son expiration (une heure par défaut). L'interface
  déconnecte immédiatement ; c'est signalé honnêtement dans le retour de la
  fonction.
- **Anti-bot.** Aucun CAPTCHA n'est installé. Les quotas serveur et la détection
  de signaux limitent les abus, mais une campagne déterminée de création de
  comptes nécessiterait un mécanisme de type Turnstile à l'inscription. Le
  cahier des charges demande de ne pas imposer un CAPTCHA à chaque action
  normale : l'architecture permet d'en ajouter un à l'inscription uniquement.
- **Transferts hors UE.** Le mécanisme juridique applicable à chaque
  sous-traitant doit être identifié par le responsable du traitement. La
  politique de confidentialité le signale au lieu d'affirmer une conformité.
- **Audit périodique.** Rejouez `supabase/tests/10_security_tests.sql` après
  chaque modification du schéma, et `npm run audit:mock` avant chaque
  déploiement.
