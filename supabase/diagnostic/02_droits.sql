-- ============================================================
-- Likemm - CORRECTIF DES DROITS (modifie la base)
-- A executer UNE FOIS dans Supabase -> SQL Editor.
-- Supabase affichera l'avertissement "Potential issue detected" :
-- normal, le script retire des droits. Lisez-le avant de confirmer.
-- ============================================================
--
-- CE QUI A ETE TROUVE
--
-- 14 droits d'ecriture directe avaient ete accordes aux roles clients,
-- en plus des 3 prevus par l'architecture :
--
--   likes        : anon ET authenticated peuvent INSERT / UPDATE / DELETE
--   rank_history : anon ET authenticated peuvent INSERT / UPDATE / DELETE
--   profiles     : anon ET authenticated peuvent UPDATE toute la table
--
-- Consequence concrete : la cle anon etant publique (elle est dans le
-- JavaScript du site), n'importe qui pouvait inserer des lignes dans
-- "likes". Le trigger recalcule alors profile_stats.likes_total, donc
-- le classement pouvait etre gonfle sans jamais passer par like_user(),
-- qui verifie l'authentification, les blocages et les quotas.
-- L'UPDATE sur toute la table profiles permettait en plus de modifier
-- username, status ou setup_complete - donc de se rendre visible malgre
-- une sanction, ou de prendre un pseudo reserve.
--
-- Les 3 droits legitimes, conserves :
--   blocks        : authenticated INSERT / DELETE  (bloquer, debloquer)
--   notifications : authenticated DELETE           (supprimer les siennes)
-- ============================================================

-- 1) Retirer les droits d'ecriture directe non prevus.
revoke insert, update, delete on public.likes        from anon, authenticated;
revoke insert, update, delete on public.rank_history from anon, authenticated;
revoke update                  on public.profiles    from anon, authenticated;

-- 2) IMPORTANT : sous PostgreSQL, un revoke au niveau de la TABLE emporte
--    aussi les droits accordes COLONNE PAR COLONNE. Il faut donc les
--    reposer. Ce sont eux qui permettent a une personne de modifier sa bio
--    ou son avatar, mais PAS son pseudo ni son statut de moderation.
grant update (avatar_url, bio, cover_url, external_links,
              hide_likes, is_private, profile_completed)
  on public.profiles to authenticated;

-- ============================================================
-- 3) Controle final (lecture seule)
-- ============================================================
select 1 as n, 'Droits d ecriture directe restants' as controle,
       coalesce((select string_agg(c.relname || '/' || a.grantee::regrole::text
                                   || '/' || a.privilege_type, '  ,  '
                                   order by c.relname, a.grantee::regrole::text,
                                            a.privilege_type)
                   from pg_class c, aclexplode(c.relacl) a
                  where c.relnamespace='public'::regnamespace and c.relkind='r'
                    and a.grantee::regrole::text in ('anon','authenticated')
                    and a.privilege_type <> 'SELECT'), 'aucun') as resultat
union all
select 2, 'Droits par colonne (doivent rester 12)',
       (select count(*)::text
          from pg_class c
          join pg_attribute att on att.attrelid=c.oid and att.attnum>0
          cross join lateral aclexplode(att.attacl) a
         where c.relnamespace='public'::regnamespace
           and a.grantee::regrole::text in ('anon','authenticated'))
       || ' colonnes'
order by n;
