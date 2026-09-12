-- =============================================================================
-- LIKEMM — 10 · Droits d'execution des fonctions
-- =============================================================================
-- PostgreSQL accorde EXECUTE a `public` par defaut sur toute nouvelle fonction.
-- Dans un projet Supabase, cela signifie que TOUTE fonction du schema `public`
-- devient un point d'API ouvert. On repart donc de zero et on n'ouvre que ce
-- qui doit l'etre, role par role.
--
-- Les fonctions de maintenance (rafraichissement du classement, instantanes de
-- rang, detection de fraude, purges) ne sont PAS ouvertes : elles sont
-- declenchees par pg_cron, qui s'execute avec les droits du proprietaire, ou
-- manuellement depuis le SQL editor.
-- =============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Accessible sans compte (§8 : un visiteur consulte un profil public)
-- -----------------------------------------------------------------------------
grant execute on function public.normalize_username(text)                           to anon, authenticated;
grant execute on function public.check_username(text)                               to anon, authenticated;
grant execute on function public.get_public_profile(text, text)                     to anon, authenticated;
grant execute on function public.get_leaderboard(public.ranking_type, integer, integer) to anon, authenticated;
grant execute on function public.search_profiles(text, integer, integer)            to anon, authenticated;
grant execute on function public.rank_of(uuid, public.ranking_type)                 to anon, authenticated;
grant execute on function public.track_event(text, jsonb, text, text)               to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reserve aux comptes connectes
-- -----------------------------------------------------------------------------
grant execute on function public.get_me()                                           to authenticated;
grant execute on function public.complete_signup(text, date, text)                  to authenticated;
grant execute on function public.update_username(text)                              to authenticated;

grant execute on function public.get_my_rank(public.ranking_type)                   to authenticated;
grant execute on function public.get_rank_context(public.ranking_type)              to authenticated;
grant execute on function public.get_rank_neighbors(public.ranking_type, integer)   to authenticated;
grant execute on function public.get_my_rank_history(public.ranking_type, integer)  to authenticated;

grant execute on function public.like_user(uuid, text, text)                        to authenticated;
grant execute on function public.unlike_user(uuid)                                  to authenticated;
grant execute on function public.get_my_likers(integer, integer)                    to authenticated;
grant execute on function public.get_my_liked_profiles(integer, integer)            to authenticated;

grant execute on function public.get_notifications(integer, integer, boolean)       to authenticated;
grant execute on function public.mark_notifications_read(bigint[])                  to authenticated;

grant execute on function public.set_consent(public.consent_type, boolean, text)    to authenticated;
grant execute on function public.withdraw_consent(public.consent_type, text)        to authenticated;
grant execute on function public.accept_legal(text, text)                           to authenticated;
grant execute on function public.record_parental_consent(text)                      to authenticated;

grant execute on function public.create_report(text, public.report_category, text)  to authenticated;
grant execute on function public.create_appeal(uuid, text)                          to authenticated;
grant execute on function public.block_user(text)                                   to authenticated;
grant execute on function public.unblock_user(text)                                 to authenticated;

grant execute on function public.create_private_link(text, interval)                to authenticated;
grant execute on function public.revoke_private_links(uuid)                         to authenticated;

grant execute on function public.create_privacy_request(public.privacy_request_type, text) to authenticated;
grant execute on function public.export_my_data()                                   to authenticated;
grant execute on function public.delete_my_account(text)                            to authenticated;

-- -----------------------------------------------------------------------------
-- Moderation et administration
-- -----------------------------------------------------------------------------
-- Ces fonctions sont ouvertes a `authenticated` MAIS verifient le role en
-- premiere instruction, cote base (app.require_role). Un utilisateur ordinaire
-- qui les appelle recoit une erreur « Action reservee a l'equipe de
-- moderation » : le controle ne depend jamais de l'interface.
grant execute on function public.mod_sanction_user(text, public.sanction_type, text, text, integer, uuid) to authenticated;
grant execute on function public.mod_lift_sanction(uuid, text)                      to authenticated;
grant execute on function public.mod_set_profile_hidden(text, boolean, text)        to authenticated;
grant execute on function public.mod_remove_profile_image(text, text, text)         to authenticated;
grant execute on function public.mod_clear_bio(text, text)                          to authenticated;
grant execute on function public.mod_remove_fraudulent_likes(text, text, interval, text) to authenticated;
grant execute on function public.mod_resolve_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.mod_decide_appeal(uuid, public.appeal_status, text) to authenticated;
grant execute on function public.mod_review_fraud_signal(bigint, text, text)        to authenticated;
grant execute on function public.mod_set_role(text, public.app_role, text)          to authenticated;

grant execute on function public.mod_list_reports(public.report_status, integer, integer) to authenticated;
grant execute on function public.mod_list_appeals(public.appeal_status, integer, integer) to authenticated;
grant execute on function public.mod_list_fraud_signals(boolean, integer, integer)  to authenticated;
grant execute on function public.mod_list_sanctions(boolean, integer, integer)      to authenticated;
grant execute on function public.mod_list_admin_actions(integer, integer)           to authenticated;
grant execute on function public.mod_user_detail(text)                              to authenticated;
grant execute on function public.mod_stats(integer)                                 to authenticated;

grant execute on function public.recompute_like_counts()                            to authenticated;
grant execute on function public.purge_rate_limit_hits()                            to authenticated;

-- -----------------------------------------------------------------------------
-- Fonctions volontairement NON exposees
-- -----------------------------------------------------------------------------
--   public.refresh_leaderboards()   public.snapshot_ranks()
--   public.run_fraud_detection()    public.purge_analytics_events(integer)
--   public.expire_sanctions()       public.get_my_rank_for(...) si presente
--
-- Elles restent appelables par pg_cron et depuis le SQL editor du projet.

-- -----------------------------------------------------------------------------
-- Verification : lister ce qui est joignable depuis l'API
-- -----------------------------------------------------------------------------
comment on schema public is
  'Schema expose par l''API. Pour auditer la surface d''attaque : '
  'select p.proname, array_agg(distinct a.privilege_type) '
  'from information_schema.routine_privileges a '
  'join pg_proc p on p.proname = a.routine_name '
  'where a.grantee in (''anon'', ''authenticated'') group by 1 order by 1;';
