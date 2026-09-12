-- ============================================================
-- Likemm - DIAGNOSTIC (lecture seule, ne modifie RIEN)
-- Supabase -> SQL Editor -> coller -> Run
-- Une seule requete, un seul tableau de resultats a me renvoyer.
-- ============================================================
with attendu_tables(nom) as (values
  ('profiles'),('profile_private'),('user_roles'),('profile_stats'),
  ('username_history'),('reserved_usernames'),('username_blocklist'),
  ('likes'),('rank_history'),('leaderboard_cache'),('notifications'),
  ('reports'),('sanctions'),('appeals'),('admin_actions'),('fraud_signals'),
  ('blocks'),('rate_limit_hits'),('consents'),('consent_log'),
  ('legal_acceptances'),('privacy_requests'),('private_profile_links'),
  ('account_deletions'),('analytics_event_types'),('analytics_events')
),
attendu_fonctions(nom) as (values
  ('get_me'),('complete_signup'),('check_username'),('update_username'),
  ('get_public_profile'),('get_leaderboard'),('get_my_rank'),('get_rank_context'),
  ('get_rank_neighbors'),('search_profiles'),('like_user'),('unlike_user'),
  ('get_notifications'),('set_consent'),('track_event'),('create_report'),
  ('mod_stats'),('refresh_leaderboards')
),
tables_manquantes as (
  select t.nom from attendu_tables t
  where not exists (
    select 1 from pg_class c
     where c.relname = t.nom
       and c.relnamespace = 'public'::regnamespace
       and c.relkind = 'r')
),
fonctions_manquantes as (
  select f.nom from attendu_fonctions f
  where not exists (
    select 1 from pg_proc p
     where p.proname = f.nom
       and p.pronamespace = 'public'::regnamespace)
)
select 1 as n, 'TABLES manquantes' as controle,
       coalesce((select string_agg(nom, ', ' order by nom) from tables_manquantes),
                'aucune (26/26 presentes)') as resultat
union all
select 2, 'FONCTIONS RPC manquantes',
       coalesce((select string_agg(nom, ', ' order by nom) from fonctions_manquantes),
                'aucune (18/18 presentes)')
union all
select 3, 'Schema interne app',
       case when exists(select 1 from pg_namespace where nspname='app')
            then 'present, ' || (select count(*)::text from pg_proc p
                                   join pg_namespace n on n.oid=p.pronamespace
                                  where n.nspname='app') || ' fonctions'
            else 'ABSENT' end
union all
select 4, 'Trigger sur auth.users (creation du profil)',
       coalesce((select string_agg(tgname || ' [' || tgenabled::text || ']', ', ')
                   from pg_trigger
                  where tgrelid='auth.users'::regclass and not tgisinternal),
                'AUCUN TRIGGER -> aucun profil cree a l inscription')
union all
select 5, 'Tables de public sans RLS',
       coalesce((select string_agg(c.relname, ', ' order by c.relname)
                   from pg_class c
                  where c.relnamespace='public'::regnamespace
                    and c.relkind='r' and not c.relrowsecurity),
                'aucune (RLS active partout)')
union all
select 6, 'Policies sur profiles',
       coalesce((select string_agg(cmd || ':' || policyname, ' | ' order by cmd, policyname)
                   from pg_policies
                  where schemaname='public' and tablename='profiles'),
                'AUCUNE')
union all
select 7, 'Comptes auth vs profils',
       (select count(*)::text from auth.users) || ' comptes auth / ' ||
       case when to_regclass('public.profiles') is null then 'table profiles absente'
            else (xpath('/row/c/text()',
                    query_to_xml('select count(*) as c from public.profiles',
                                 false, true, '')))[1]::text || ' profils'
       end
order by n;
