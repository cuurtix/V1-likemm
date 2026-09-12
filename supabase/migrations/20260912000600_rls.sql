-- =============================================================================
-- LIKEMM — 06 · Row Level Security et droits (§33 / §44)
-- =============================================================================
-- Deux couches de protection, volontairement redondantes :
--
--   1. GRANT / REVOKE au niveau des TABLES et des COLONNES. La RLS filtre des
--      lignes, jamais des colonnes : c'est le GRANT par colonne qui empeche un
--      utilisateur de modifier son propre `status`, son `username` ou son
--      compteur de likes, meme si la ligne lui appartient.
--
--   2. Politiques RLS pour le filtrage par ligne.
--
-- Regle appliquee partout : le frontend n'a le droit d'ecrire QUE ce qui est
-- inoffensif. Toute operation sensible (like, username, signalement, sanction,
-- suppression, consentement, analytics) passe par une fonction RPC qui
-- re-verifie l'authentification, l'etat du compte, les blocages et les quotas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. On part d'une base fermee : plus aucun droit implicite.
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end $$;

-- Note : on n'active volontairement PAS `force row level security`. La RLS
-- s'applique deja a `anon` et `authenticated` ; la laisser inactive pour le
-- proprietaire des tables est ce qui permet aux fonctions SECURITY DEFINER de
-- ce projet de faire leur travail (verifier, puis ecrire) de facon controlee.

-- -----------------------------------------------------------------------------
-- 1. profiles — partie publique
-- -----------------------------------------------------------------------------
grant select on public.profiles to anon, authenticated;

-- Les colonnes qu'un utilisateur peut modifier lui-meme. `username`, `status`,
-- `hidden_by_moderation` et `username_changed_at` en sont volontairement
-- absents : ils passent par une RPC ou par la moderation.
grant update (bio, avatar_url, cover_url, external_links, is_private, hide_likes, profile_completed)
  on public.profiles to authenticated;

drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (
    -- Mon propre profil, toujours.
    id = auth.uid()
    -- Les profils publics, actifs, non masques par la moderation, et non
    -- impliques dans un blocage mutuel (§22).
    or (
      status = 'active'
      and is_private = false
      and hidden_by_moderation = false
      and not app.is_blocked_between(auth.uid(), id)
    )
    -- La moderation voit tout, y compris les comptes suspendus et masques.
    or app.is_at_least('moderator')
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() and status = 'active')
  with check (id = auth.uid() and status = 'active');

-- Aucune politique INSERT ni DELETE : la creation passe par le trigger
-- d'inscription, la suppression par public.delete_my_account().

-- -----------------------------------------------------------------------------
-- 2. profile_private — donnees personnelles
-- -----------------------------------------------------------------------------
grant select on public.profile_private to authenticated;
-- Seules les preferences de notification sont modifiables directement.
-- La date de naissance ne l'est pas : une rectification passe par une demande
-- tracee (§14), afin qu'un changement d'age ne puisse pas servir a contourner
-- les protections applicables aux mineurs.
grant update (notify_likes, notify_rank, notify_email_security, notify_email_marketing)
  on public.profile_private to authenticated;

drop policy if exists profile_private_select_own on public.profile_private;
create policy profile_private_select_own on public.profile_private
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists profile_private_update_own on public.profile_private;
create policy profile_private_update_own on public.profile_private
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. user_roles — jamais modifiable par le client
-- -----------------------------------------------------------------------------
grant select on public.user_roles to authenticated;

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or app.is_at_least('admin'));

-- -----------------------------------------------------------------------------
-- 4. profile_stats — lecture seule
-- -----------------------------------------------------------------------------
grant select on public.profile_stats to anon, authenticated;

drop policy if exists profile_stats_select on public.profile_stats;
create policy profile_stats_select on public.profile_stats
  for select to anon, authenticated
  using (
    user_id = auth.uid()
    or app.profile_is_listable(user_id)
    or app.is_at_least('moderator')
  );

-- -----------------------------------------------------------------------------
-- 5. likes
-- -----------------------------------------------------------------------------
grant select on public.likes to authenticated;
-- Ni INSERT ni DELETE : public.like_user() / public.unlike_user() uniquement.

drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes
  for select to authenticated
  using (
    -- Mes propres likes donnes.
    from_user_id = auth.uid()
    -- Les likes que J'AI RECUS, sauf si leur auteur a active « masquer mes
    -- likes » (§10 / §21). Le like compte quand meme dans le classement,
    -- il n'est simplement pas attribuable publiquement.
    or (to_user_id = auth.uid() and not app.hides_likes(from_user_id))
    or app.is_at_least('moderator')
  );

-- -----------------------------------------------------------------------------
-- 6. notifications
-- -----------------------------------------------------------------------------
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 7. rank_history — §14
-- -----------------------------------------------------------------------------
grant select on public.rank_history to authenticated;

drop policy if exists rank_history_select on public.rank_history;
create policy rank_history_select on public.rank_history
  for select to authenticated
  using (user_id = auth.uid() or app.is_at_least('moderator'));

-- -----------------------------------------------------------------------------
-- 8. leaderboard_cache — lu exclusivement par public.get_leaderboard()
-- -----------------------------------------------------------------------------
-- Aucun GRANT, aucune politique : le cache contient aussi les profils prives
-- (pour que les rangs restent contigus) et n'est donc jamais lu directement.

-- -----------------------------------------------------------------------------
-- 9. blocks — §22
-- -----------------------------------------------------------------------------
grant select, insert, delete on public.blocks to authenticated;

drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid() or app.is_at_least('moderator'));

drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (
    blocker_id = auth.uid()
    and blocked_id <> auth.uid()
    and app.current_profile_status() = 'active'
  );

drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 10. reports — §21 / §31
-- -----------------------------------------------------------------------------
grant select on public.reports to authenticated;
-- INSERT via public.create_report() : quotas + verification de la cible.

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or app.is_at_least('moderator'));

-- §34 : un utilisateur ne voit JAMAIS les signalements dont il est la cible,
-- ni ceux deposes par d'autres. Seule la moderation y accede.

-- -----------------------------------------------------------------------------
-- 11. sanctions — §45 : l'utilisateur sanctionne est informe
-- -----------------------------------------------------------------------------
grant select on public.sanctions to authenticated;

drop policy if exists sanctions_select on public.sanctions;
create policy sanctions_select on public.sanctions
  for select to authenticated
  using (user_id = auth.uid() or app.is_at_least('moderator'));

-- -----------------------------------------------------------------------------
-- 12. appeals — §24 / §33
-- -----------------------------------------------------------------------------
grant select on public.appeals to authenticated;

drop policy if exists appeals_select on public.appeals;
create policy appeals_select on public.appeals
  for select to authenticated
  using (user_id = auth.uid() or app.is_at_least('moderator'));

-- -----------------------------------------------------------------------------
-- 13. admin_actions / fraud_signals — §34 : inaccessibles aux utilisateurs
-- -----------------------------------------------------------------------------
grant select on public.admin_actions to authenticated;
grant select on public.fraud_signals to authenticated;

drop policy if exists admin_actions_select on public.admin_actions;
create policy admin_actions_select on public.admin_actions
  for select to authenticated using (app.is_at_least('admin'));

drop policy if exists fraud_signals_select on public.fraud_signals;
create policy fraud_signals_select on public.fraud_signals
  for select to authenticated using (app.is_at_least('moderator'));

-- -----------------------------------------------------------------------------
-- 14. Consentements et documents juridiques
-- -----------------------------------------------------------------------------
grant select on public.consents to authenticated;
grant select on public.consent_log to authenticated;
grant select on public.legal_acceptances to authenticated;

drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists consent_log_select_own on public.consent_log;
create policy consent_log_select_own on public.consent_log
  for select to authenticated using (user_id = auth.uid());

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own on public.legal_acceptances
  for select to authenticated using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 15. privacy_requests — §14
-- -----------------------------------------------------------------------------
grant select on public.privacy_requests to authenticated;

drop policy if exists privacy_requests_select on public.privacy_requests;
create policy privacy_requests_select on public.privacy_requests
  for select to authenticated
  using (user_id = auth.uid() or app.is_at_least('admin'));

-- -----------------------------------------------------------------------------
-- 16. private_profile_links — §32
-- -----------------------------------------------------------------------------
grant select on public.private_profile_links to authenticated;

drop policy if exists private_links_select_own on public.private_profile_links;
create policy private_links_select_own on public.private_profile_links
  for select to authenticated using (user_id = auth.uid());

-- Le token_hash n'a aucune utilite pour le client : il est renvoye par la RPC
-- de creation, une seule fois, sous forme de token en clair non stocke.

-- -----------------------------------------------------------------------------
-- 17. Analytics
-- -----------------------------------------------------------------------------
grant select on public.analytics_event_types to anon, authenticated;
grant select on public.analytics_events to authenticated;

drop policy if exists analytics_types_select on public.analytics_event_types;
create policy analytics_types_select on public.analytics_event_types
  for select to anon, authenticated using (true);

-- §34 : les evenements bruts ne sont lisibles que par l'administration.
-- Un utilisateur recupere SES evenements via l'export RGPD, pas en SELECT.
drop policy if exists analytics_events_select_admin on public.analytics_events;
create policy analytics_events_select_admin on public.analytics_events
  for select to authenticated using (app.is_at_least('admin'));

-- -----------------------------------------------------------------------------
-- 18. Tables strictement internes — aucun GRANT, aucune politique
-- -----------------------------------------------------------------------------
-- rate_limit_hits, account_deletions, reserved_usernames, username_blocklist,
-- username_history : manipulees uniquement par des fonctions SECURITY DEFINER.
grant select on public.username_history to authenticated;

drop policy if exists username_history_select on public.username_history;
create policy username_history_select on public.username_history
  for select to authenticated
  using (user_id = auth.uid() or app.is_at_least('moderator'));

-- -----------------------------------------------------------------------------
-- 19. Sequences : aucune raison de les exposer
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from anon, authenticated', r.relname);
  end loop;
end $$;
