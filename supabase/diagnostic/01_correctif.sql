-- ============================================================
-- Likemm - CORRECTIF (modifie la base)
-- A executer UNE FOIS dans Supabase -> SQL Editor.
-- Supabase affichera peut-etre un avertissement "Potential issue
-- detected" : c'est normal, ce script contient bien une suppression
-- de policy. Lisez-le avant de confirmer.
-- ============================================================

-- 1) Retirer la policy INSERT ajoutee a la main sur profiles.
--
--    Pourquoi : la creation d'un profil doit passer UNIQUEMENT par le
--    trigger on_auth_user_created (SECURITY DEFINER), qui applique les
--    pseudos reserves, le minimum de 13 ans, la confidentialite par
--    defaut des comptes mineurs et les consentements par defaut.
--    Une policy INSERT ouvre un chemin qui contourne tout cela.
drop policy if exists "Enable insert for authenticated users only"
  on public.profiles;

-- Par securite : retirer aussi tout droit d'ecriture directe qui aurait
-- ete accorde a la main sur profiles (la RLS seule ne suffit pas,
-- ce sont les GRANT qui donnent le droit d'ecrire).
revoke insert, delete on public.profiles from anon, authenticated;

-- 2) Forcer PostgREST a relire le schema.
--    Sans cela, une fonction creee recemment peut encore renvoyer
--    "Could not find the function public.xxx".
notify pgrst, 'reload schema';

-- ============================================================
-- 3) Controles apres correction (lecture seule)
-- ============================================================
with cibles(nom) as (values
  ('get_me'),('complete_signup'),('check_username'),('update_username'),
  ('get_public_profile'),('get_leaderboard'),('get_my_rank'),('get_rank_context'),
  ('get_rank_neighbors'),('search_profiles'),('like_user'),('unlike_user'),
  ('get_notifications'),('set_consent'),('track_event'),('create_report'),
  ('accept_legal'),('export_my_data'),('block_user')
),
manquants as (
  select c.nom from cibles c
  where exists (select 1 from pg_proc p
                 where p.proname=c.nom and p.pronamespace='public'::regnamespace)
    and not exists (
      select 1 from pg_proc p
       where p.proname=c.nom and p.pronamespace='public'::regnamespace
         and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
),
sensibles(nom) as (values
  ('likes'),('profile_stats'),('user_roles'),('sanctions'),('admin_actions'),
  ('fraud_signals'),('analytics_events'),('leaderboard_cache'),('rate_limit_hits')
),
ouvertes as (
  select c.relname from pg_class c join sensibles s on s.nom = c.relname
  where c.relnamespace='public'::regnamespace
    and exists (select 1 from aclexplode(c.relacl) a
                 where a.grantee::regrole::text in ('anon','authenticated')
                   and a.privilege_type <> 'SELECT')
)
select 1 as n, 'Fonctions cibles sans droit pour authenticated' as controle,
       coalesce((select string_agg(nom, ', ' order by nom) from manquants),
                'aucune - tous les droits sont poses') as resultat
union all
select 2, 'Policies d ecriture restantes sur profiles',
       coalesce((select string_agg(cmd || ':' || policyname, ', ')
                   from pg_policies
                  where schemaname='public' and tablename='profiles'
                    and cmd not in ('SELECT','UPDATE')),
                'aucune (correct)')
union all
select 3, 'Tables sensibles ouvertes en ecriture',
       coalesce((select string_agg(relname, ', ' order by relname) from ouvertes),
                'aucune (correct)')
union all
select 4, 'Buckets de stockage',
       coalesce((select string_agg(id || ' (public=' || public::text || ')', ', ' order by id)
                   from storage.buckets), 'aucun bucket - a creer')
union all
select 5, 'Extension pg_cron',
       case when exists(select 1 from pg_extension where extname='pg_cron')
            then 'activee, ' || (xpath('/row/c/text()',
                   query_to_xml('select count(*) as c from cron.job', false, true, '')))[1]::text
                 || ' taches'
            else 'non activee (taches planifiees inactives)' end
union all
select 6, 'Donnees de reference',
       (select count(*)::text from public.reserved_usernames) || ' pseudos reserves, ' ||
       (select count(*)::text from public.username_blocklist) || ' bloques, ' ||
       (select count(*)::text from public.analytics_event_types) || ' types d evenements'
order by n;
