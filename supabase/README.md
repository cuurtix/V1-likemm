# Base de données Likemm

## Appliquer

```bash
supabase link --project-ref VOTRE_REF
supabase db push
```

ou, dans le SQL editor, coller les fichiers de `migrations/` **un par un, dans
l'ordre alphabétique**. Les dépendances entre fichiers sont réelles.

## Tester localement

Sur un PostgreSQL nu, sans Supabase :

```bash
createdb likemm_test
psql likemm_test -f tests/00_local_stubs.sql
for f in migrations/*.sql; do psql likemm_test -v ON_ERROR_STOP=1 -f "$f"; done
psql likemm_test -v ON_ERROR_STOP=1 -f tests/10_security_tests.sql
```

`tests/00_local_stubs.sql` recrée le strict minimum fourni par Supabase (rôles
`anon`/`authenticated`, schéma `auth`, `auth.uid()`, schéma `storage`). Il ne
doit **jamais** être exécuté sur le projet Supabase.

Les 148 tests s'arrêtent au premier échec. Rejouez-les après toute modification
du schéma.

## Tables

**Comptes et profils**
`profiles` · `profile_private` · `user_roles` · `profile_stats` ·
`username_history` · `reserved_usernames` · `username_blocklist`

**Cœur du produit**
`likes` · `rank_history` · `leaderboard_cache` · `notifications`

**Modération et sécurité**
`reports` · `sanctions` · `appeals` · `admin_actions` · `fraud_signals` ·
`blocks` · `rate_limit_hits`

**Vie privée**
`consents` · `consent_log` · `legal_acceptances` · `privacy_requests` ·
`private_profile_links` · `account_deletions`

**Mesure**
`analytics_event_types` · `analytics_events`

## Schéma `app`

Schéma interne, **non exposé par l'API**. Contient les fonctions utilisées par
les politiques RLS et les fonctions RPC, ainsi que `app.secrets` (clé de
pseudonymisation), sur laquelle aucun rôle client n'a de droit.

## Fonctions appelables par le client

Listées et commentées dans `migrations/..._function_grants.sql`. Ce fichier
commence par **retirer** l'exécution de toutes les fonctions de `public` à `anon`
et `authenticated`, puis n'ouvre que le nécessaire.

Pour auditer la surface d'API à tout moment :

```sql
select p.proname, array_agg(distinct a.grantee order by a.grantee) as roles
  from information_schema.routine_privileges a
  join pg_proc p on p.proname = a.routine_name
 where a.grantee in ('anon', 'authenticated')
 group by 1 order by 1;
```

## Maintenance

Non exposées au client, appelées par pg_cron ou depuis le SQL editor :

| Fonction | Rôle | Fréquence conseillée |
|---|---|---|
| `refresh_leaderboards()` | rafraîchit le cache de classement | 5 min |
| `snapshot_ranks()` | enregistre les positions, génère les notifications de progression | 1 jour |
| `run_fraud_detection()` | produit les signaux anti-fraude de fond | 1 heure |
| `expire_sanctions()` | lève les suspensions arrivées à échéance | 15 min |
| `purge_analytics_events(n)` | conservation des événements | 1 jour |
| `purge_rate_limit_hits()` | nettoie les compteurs de quota | 1 jour |
| `recompute_like_counts()` | réconcilie tous les compteurs (admin) | à la demande |
