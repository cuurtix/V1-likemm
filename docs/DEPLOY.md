# Mise en production de Likemm

Trois étapes : la base, le site, puis les options (OAuth, mesure d'audience).

---

## 1. Supabase

### 1.1 Créer le projet

Tableau de bord Supabase → **New project**. Choisissez une région et notez-la :
elle doit être reportée dans les mentions légales et la politique de
confidentialité.

### 1.2 Appliquer les migrations

Les 12 fichiers de `supabase/migrations/` doivent être exécutés **dans l'ordre
alphabétique**, qui est aussi leur ordre chronologique.

Avec la CLI Supabase :

```bash
supabase link --project-ref VOTRE_REF
supabase db push
```

Sans la CLI : ouvrez le **SQL editor** et collez chaque fichier, un par un, dans
l'ordre. N'en sautez aucun : les dépendances sont réelles (les fonctions du
fichier 05 utilisent les tables du fichier 04, etc.).

Ce que chaque fichier installe :

| Fichier | Contenu |
|---|---|
| `..._extensions_and_types.sql` | extensions, schéma interne `app`, types, clé de pseudonymisation |
| `..._profiles.sql` | profils publics, données personnelles isolées, rôles, statistiques, règles de nommage |
| `..._likes_and_rankings.sql` | likes, compteur dérivé, historique de rang, cache de classement, notifications |
| `..._moderation_privacy_analytics.sql` | signalements, sanctions, appels, journal admin, anti-fraude, consentements, RGPD, blocages, liens privés, analytics |
| `..._helpers.sql` | fonctions internes utilisées par les RLS et les RPC |
| `..._rls.sql` | **Row Level Security et droits par colonne** |
| `..._rpc_core.sql` | inscription, username, profil, classements, recherche |
| `..._rpc_actions.sql` | likes, notifications, consentements, signalements, RGPD, suppression |
| `..._moderation_rpc.sql` | modération, statistiques, maintenance, détection de fraude |
| `..._storage.sql` | buckets `avatars` et `covers` + politiques d'écriture |
| `..._function_grants.sql` | **droits d'exécution des fonctions** — referme la surface d'API |
| `..._scheduled_jobs.sql` | tâches planifiées (sans effet si pg_cron n'est pas activé) |
| `..._bootstrap_owner.sql` | instructions pour se donner le rôle `owner` |

### 1.3 Vérifier que tout est en place

```sql
-- Toutes les tables doivent avoir la RLS activée : cette requête doit
-- ne renvoyer AUCUNE ligne.
select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Aucune écriture directe sur les tables sensibles : AUCUNE ligne non plus.
select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated')
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
   and table_name in ('likes', 'profile_stats', 'user_roles', 'sanctions',
                      'admin_actions', 'fraud_signals', 'analytics_events',
                      'leaderboard_cache', 'rate_limit_hits');
```

### 1.4 Se donner le rôle propriétaire

Créez votre compte depuis le site, puis, dans le SQL editor :

```sql
insert into public.user_roles (user_id, role, granted_at)
select id, 'owner', now() from public.profiles where username = 'VOTRE_USERNAME'
on conflict (user_id) do update set role = 'owner', granted_at = now();
```

Ensuite, les rôles `moderator` et `admin` s'attribuent depuis `/admin`, et chaque
changement est journalisé.

### 1.5 Authentification

**Authentication → Providers → Email** : activez la confirmation d'email.

**Authentication → URL Configuration** :
- Site URL : `https://likemm.site`
- Redirect URLs : `https://likemm.site/**`

**Authentication → Rate limits** : conservez ou durcissez les limites par défaut.
Elles complètent les quotas applicatifs, elles ne les remplacent pas.

### 1.6 Tâches planifiées (recommandé)

**Database → Extensions → pg_cron**, puis réexécutez
`..._scheduled_jobs.sql`. Sans pg_cron, le site fonctionne, mais :

- l'historique de classement n'est pas alimenté (`snapshot_ranks`) et les
  notifications de progression ne sont donc jamais générées ;
- les suspensions à durée déterminée ne se lèvent pas toutes seules ;
- la détection de fraude de fond ne tourne pas.

Vous pouvez aussi appeler ces fonctions manuellement depuis le SQL editor.

### 1.7 Temps réel (facultatif)

**Database → Replication** → activez la publication pour la table
`notifications` si vous voulez les notifications instantanées. Sans cela, la
liste se recharge à l'ouverture de la page : rien ne casse.

---

## 2. Le site (hébergement statique type LWS)

```bash
cp .env.example .env     # renseigner l'URL et la clé anon du projet
npm install
npm run build
```

Le contenu de `dist/` est à téléverser à la racine du domaine, **`.htaccess`
compris** (fichier caché : vérifiez qu'il a bien été transféré).

### 2.1 Adapter le `.htaccess`

Une seule modification est indispensable : remplacer les deux occurrences de
`https://VOTRE-PROJET.supabase.co` par l'URL réelle du projet, dans la règle
`Content-Security-Policy`. Sans cela, le navigateur bloquera tous les appels à
la base.

Ce que le fichier fait déjà :

- redirection HTTPS ;
- **routing SPA** : un rafraîchissement direct sur `/@alex` sert `index.html` au
  lieu d'un 404 — c'est ce qui fait fonctionner les deep links depuis Instagram,
  TikTok, Discord ou les messageries (§18 du cahier des charges) ;
- en-têtes de sécurité : `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS, CSP ;
- cache long pour les fichiers versionnés, aucun cache pour `index.html` ;
- refus d'accès aux fichiers sensibles (`.env`, `.git`, `package.json`).

### 2.2 Vérifier après déploiement

```
https://likemm.site/              → le classement
https://likemm.site/@untel        → page de profil (pas un 404 Apache)
https://likemm.site/legal         → les documents
https://likemm.site/robots.txt    → accessible
https://likemm.site/.env          → doit renvoyer 403
```

---

## 3. Previews de partage — ce qui marche et ce qui ne marche pas

**À lire avant de promettre quoi que ce soit sur ce point.**

Likemm est une application monopage servie statiquement. Les robots de Discord,
TikTok, X, Instagram ou Snapchat lisent le **HTML brut** sans exécuter
JavaScript. Conséquence directe :

| | Fonctionne |
|---|---|
| Le lien `likemm.site/@alex` s'ouvre au bon endroit depuis n'importe quelle app | **Oui** |
| Une carte de preview s'affiche lors du partage | **Oui**, mais **générique** (logo Likemm) |
| La preview montre l'avatar et le pseudo de la personne partagée | **Non**, en l'état |
| Titre, description et `noindex` corrects pour un humain et pour Google | **Oui** |

Les profils privés envoient bien `<meta name="robots" content="noindex">`, ce qui
les exclut des moteurs de recherche.

### Obtenir de vraies previews par profil

Deux chemins possibles, à choisir le jour où ce sera une priorité :

**a) Une fonction edge Supabase qui sert les meta aux robots.** Elle lit le
profil, renvoie un HTML minimal avec `og:title`, `og:description` et `og:image`,
et redirige les navigateurs vers l'application. Il faut ensuite router
`/@username` vers cette fonction uniquement pour les user-agents de robots —
ce qui n'est pas faisable avec un `.htaccess` seul de façon fiable.

**b) Déplacer l'hébergement vers une plateforme à fonctions edge** (Vercel,
Netlify, Cloudflare Pages). C'est l'option la plus simple et la plus robuste :
une fonction intercepte `/@username`, génère les meta et l'image, et sert
l'application au reste du monde. Le reste du projet n'a pas à changer.

En attendant, `public/og-default.png` est la carte affichée. Elle est propre et
identifiable, mais elle est la même pour tout le monde : ne dites pas le
contraire dans la communication du produit.

---

## 4. Options

### 4.1 Google et Apple

**Authentication → Providers** → activez et renseignez les identifiants
OAuth. Tant que ce n'est pas fait, les boutons affichent une erreur explicite au
clic — ils ne simulent jamais une connexion.

Un compte créé par ce chemin n'a ni pseudo ni date de naissance : l'application
l'amène automatiquement sur `/complete-signup`, et le compte ne peut rien faire
(ni liker, ni apparaître au classement) tant que ces informations manquent.

### 4.2 Mesure d'audience

Renseignez `VITE_GA_MEASUREMENT_ID` dans `.env`. Le script n'est chargé
**qu'après** consentement explicite, et la CSP du `.htaccess` doit être élargie
pour l'autoriser :

```
script-src 'self' https://www.googletagmanager.com;
connect-src 'self' https://VOTRE-PROJET.supabase.co wss://VOTRE-PROJET.supabase.co https://www.google-analytics.com;
```

Sans identifiant renseigné, rien n'est chargé et aucun appel n'est fait.

### 4.3 Emails

Le fournisseur d'emails n'est pas choisi et l'architecture ne le présuppose pas.
Supabase envoie par défaut les emails transactionnels (confirmation,
réinitialisation) via son propre service, avec des quotas faibles. Pour la
production, configurez un SMTP dans **Project Settings → Auth → SMTP**, puis
mettez à jour la liste des sous-traitants dans les mentions légales et la
politique de confidentialité.

---

## 5. Tester la base localement (facultatif mais recommandé)

Les 148 tests de sécurité tournent sur un PostgreSQL nu, sans Supabase :

```bash
createdb likemm_test
psql likemm_test -f supabase/tests/00_local_stubs.sql
for f in supabase/migrations/*.sql; do psql likemm_test -v ON_ERROR_STOP=1 -f "$f"; done
psql likemm_test -v ON_ERROR_STOP=1 -f supabase/tests/10_security_tests.sql
```

Le script s'arrête au premier échec. Il vérifie notamment qu'un utilisateur ne
peut pas lire les données d'un autre, gonfler son compteur de likes, s'attribuer
un rôle, accéder à un profil privé, ou modérer sans en avoir le droit.

Lancez-les après toute modification du schéma.
