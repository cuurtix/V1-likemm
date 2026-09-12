-- =============================================================================
-- LIKEMM — 08 · Moderation, anti-fraude, maintenance (§22 / §23 / §32 / §45)
-- =============================================================================
-- Chaque action de moderation :
--   * verifie le ROLE cote base (jamais cote interface) ;
--   * exige une raison ecrite ;
--   * ecrit une ligne dans admin_actions — « Chaque action de moderation doit
--     etre journalisee » (§22) ;
--   * enregistre, lorsqu'elle sanctionne, la regle violee, la duree et la
--     possibilite d'appel (§45).
-- =============================================================================

create or replace function app.require_role(p_min public.app_role)
returns uuid
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;
  if not app.is_at_least(p_min) then
    raise exception 'Action reservee a l''equipe de moderation.'
      using errcode = '42501', hint = 'FORBIDDEN';
  end if;
  return v_uid;
end;
$$;

create or replace function app.log_admin_action(
  p_admin uuid, p_action text, p_target uuid,
  p_reason text, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = app, public, pg_temp
as $$
  insert into public.admin_actions (admin_id, action, target_user_id, reason, metadata)
  values (p_admin, p_action, p_target, p_reason, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Resout un username en identifiant, en refusant les cibles inexistantes.
create or replace function app.resolve_user(p_username text)
returns uuid
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare v_id uuid;
begin
  select id into v_id from public.profiles
   where username = public.normalize_username(p_username);
  if v_id is null then
    raise exception 'Profil introuvable : %', coalesce(p_username, '(vide)')
      using errcode = '22023', hint = 'TARGET_NOT_FOUND';
  end if;
  return v_id;
end;
$$;

-- Un moderateur ne peut pas sanctionner quelqu'un de rang egal ou superieur.
create or replace function app.assert_can_act_on(p_actor uuid, p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_actor_level  integer := app.current_role_level();
  v_target_level integer;
begin
  if p_actor = p_target then
    raise exception 'Vous ne pouvez pas appliquer cette action a votre propre compte.'
      using errcode = '42501', hint = 'TARGET_SELF';
  end if;

  select case coalesce(r.role, 'user')
           when 'owner' then 4 when 'admin' then 3 when 'moderator' then 2 else 1 end
    into v_target_level
    from public.user_roles r where r.user_id = p_target;

  if coalesce(v_target_level, 1) >= coalesce(v_actor_level, 0) then
    raise exception 'Vous ne pouvez pas appliquer cette action a ce compte.'
      using errcode = '42501', hint = 'TARGET_PRIVILEGED';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Sanctions
-- -----------------------------------------------------------------------------
create or replace function public.mod_sanction_user(
  p_username      text,
  p_type          public.sanction_type,
  p_reason        text,
  p_rule_violated text default null,
  p_duration_days integer default null,
  p_report_id     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.require_role('moderator');
  v_target uuid := app.resolve_user(p_username);
  v_id    uuid;
  v_ends  timestamptz;
begin
  perform app.assert_can_act_on(v_actor, v_target);

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Une raison ecrite est obligatoire.' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;

  -- Un bannissement definitif est reserve aux administrateurs.
  if p_type = 'ban' and not app.is_at_least('admin') then
    raise exception 'Le bannissement definitif est reserve aux administrateurs.'
      using errcode = '42501', hint = 'FORBIDDEN';
  end if;

  if p_type in ('suspension', 'limit') then
    if coalesce(p_duration_days, 0) <= 0 then
      raise exception 'Indiquez une duree en jours pour une suspension ou une limitation.'
        using errcode = '22023', hint = 'DURATION_REQUIRED';
    end if;
    v_ends := now() + make_interval(days => least(p_duration_days, 3650));
  end if;

  insert into public.sanctions (user_id, type, reason, rule_violated, issued_by, report_id, ends_at)
  values (v_target, p_type, btrim(p_reason), nullif(btrim(coalesce(p_rule_violated, '')), ''),
          v_actor, p_report_id, v_ends)
  returning id into v_id;

  -- Effet reel sur le compte.
  if p_type = 'ban' then
    update public.profiles set status = 'banned' where id = v_target;
    begin delete from auth.sessions where user_id = v_target; exception when others then null; end;
  elsif p_type = 'suspension' then
    update public.profiles set status = 'suspended' where id = v_target;
    begin delete from auth.sessions where user_id = v_target; exception when others then null; end;
  end if;

  perform app.log_admin_action(v_actor, 'sanction_' || p_type::text, v_target, btrim(p_reason),
    jsonb_build_object('sanction_id', v_id, 'rule_violated', p_rule_violated,
                       'duration_days', p_duration_days, 'report_id', p_report_id));

  return jsonb_build_object('ok', true, 'sanction_id', v_id, 'type', p_type, 'ends_at', v_ends);
end;
$$;

create or replace function public.mod_lift_sanction(p_sanction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.require_role('moderator');
  v_s     record;
  v_still boolean;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Une raison ecrite est obligatoire.' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;

  select * into v_s from public.sanctions where id = p_sanction_id;
  if v_s.id is null then
    raise exception 'Sanction introuvable.' using errcode = '22023', hint = 'SANCTION_NOT_FOUND';
  end if;

  update public.sanctions
     set revoked_at = now(), revoked_by = v_actor
   where id = p_sanction_id and revoked_at is null;

  -- Le compte n'est reactive que s'il ne reste aucune autre sanction bloquante.
  select exists (
    select 1 from public.sanctions s
     where s.user_id = v_s.user_id and s.id <> p_sanction_id
       and s.revoked_at is null
       and s.type in ('ban', 'suspension')
       and (s.ends_at is null or s.ends_at > now())
  ) into v_still;

  if not v_still then
    update public.profiles set status = 'active'
     where id = v_s.user_id and status in ('suspended', 'banned');
  end if;

  perform app.log_admin_action(v_actor, 'lift_sanction', v_s.user_id, btrim(p_reason),
    jsonb_build_object('sanction_id', p_sanction_id, 'reactivated', not v_still));

  return jsonb_build_object('ok', true, 'reactivated', not v_still);
end;
$$;

-- Levee automatique des suspensions arrivees a echeance (a planifier).
create or replace function public.expire_sanctions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rows integer := 0;
begin
  update public.profiles p
     set status = 'active'
   where p.status = 'suspended'
     and not exists (
       select 1 from public.sanctions s
        where s.user_id = p.id and s.revoked_at is null
          and s.type in ('suspension', 'ban')
          and (s.ends_at is null or s.ends_at > now())
     );
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Contenu du profil (§22 : supprimer une photo, masquer un profil)
-- -----------------------------------------------------------------------------
create or replace function public.mod_set_profile_hidden(
  p_username text, p_hidden boolean, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := app.require_role('moderator');
  v_target uuid := app.resolve_user(p_username);
begin
  perform app.assert_can_act_on(v_actor, v_target);
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Une raison ecrite est obligatoire.' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;

  update public.profiles set hidden_by_moderation = coalesce(p_hidden, true) where id = v_target;

  perform app.log_admin_action(v_actor,
    case when coalesce(p_hidden, true) then 'hide_profile' else 'unhide_profile' end,
    v_target, btrim(p_reason));

  return jsonb_build_object('ok', true, 'hidden', coalesce(p_hidden, true));
end;
$$;

create or replace function public.mod_remove_profile_image(
  p_username text, p_kind text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := app.require_role('moderator');
  v_target uuid := app.resolve_user(p_username);
begin
  perform app.assert_can_act_on(v_actor, v_target);
  if p_kind not in ('avatar', 'cover') then
    raise exception 'Type d''image inconnu.' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Une raison ecrite est obligatoire.' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;

  if p_kind = 'avatar' then
    update public.profiles set avatar_url = null where id = v_target;
  else
    update public.profiles set cover_url = null where id = v_target;
  end if;

  begin
    delete from storage.objects
     where bucket_id = case when p_kind = 'avatar' then 'avatars' else 'covers' end
       and (storage.foldername(name))[1] = v_target::text;
  exception when others then null; end;

  perform app.log_admin_action(v_actor, 'remove_' || p_kind, v_target, btrim(p_reason));
  return jsonb_build_object('ok', true, 'kind', p_kind);
end;
$$;

create or replace function public.mod_clear_bio(p_username text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := app.require_role('moderator');
  v_target uuid := app.resolve_user(p_username);
begin
  perform app.assert_can_act_on(v_actor, v_target);
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Une raison ecrite est obligatoire.' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;

  update public.profiles set bio = null, external_links = '[]'::jsonb where id = v_target;
  perform app.log_admin_action(v_actor, 'clear_bio', v_target, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- §22 / §30 : retirer des likes frauduleux. Les compteurs sont recalcules par
-- les triggers ; le nombre exact retire est journalise.
create or replace function public.mod_remove_fraudulent_likes(
  p_username  text,
  p_direction text,            -- 'given' | 'received' | 'both'
  p_since     interval,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := app.require_role('moderator');
  v_target uuid := app.resolve_user(p_username);
  v_since  timestamptz := now() - coalesce(p_since, interval '24 hours');
  v_given  integer := 0;
  v_recv   integer := 0;
begin
  perform app.assert_can_act_on(v_actor, v_target);
  if p_direction not in ('given', 'received', 'both') then
    raise exception 'Direction inconnue (given, received ou both).' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Une raison ecrite est obligatoire.' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;

  if p_direction in ('given', 'both') then
    delete from public.likes where from_user_id = v_target and created_at >= v_since;
    get diagnostics v_given = row_count;
  end if;

  if p_direction in ('received', 'both') then
    delete from public.likes where to_user_id = v_target and created_at >= v_since;
    get diagnostics v_recv = row_count;
  end if;

  perform app.log_admin_action(v_actor, 'remove_fraudulent_likes', v_target, btrim(p_reason),
    jsonb_build_object('direction', p_direction, 'since', v_since,
                       'removed_given', v_given, 'removed_received', v_recv));

  return jsonb_build_object('ok', true, 'removed_given', v_given, 'removed_received', v_recv);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Signalements et appels
-- -----------------------------------------------------------------------------
create or replace function public.mod_resolve_report(
  p_report_id uuid, p_status public.report_status, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.require_role('moderator');
  v_r     record;
begin
  if p_status not in ('reviewing', 'resolved', 'rejected') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;

  select * into v_r from public.reports where id = p_report_id;
  if v_r.id is null then
    raise exception 'Signalement introuvable.' using errcode = '22023', hint = 'REPORT_NOT_FOUND';
  end if;

  -- §45 : toute decision de moderation est justifiee.
  if p_status in ('resolved', 'rejected')
     and (p_note is null or char_length(btrim(p_note)) < 3) then
    raise exception 'Une justification est obligatoire pour clore un signalement.'
      using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;

  update public.reports
     set status = p_status,
         resolution_note = nullif(btrim(coalesce(p_note, '')), ''),
         resolved_at = case when p_status in ('resolved', 'rejected') then now() else null end,
         resolved_by = case when p_status in ('resolved', 'rejected') then v_actor else null end
   where id = p_report_id;

  perform app.log_admin_action(v_actor, 'resolve_report', v_r.target_user_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_build_object('report_id', p_report_id, 'status', p_status));

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

create or replace function public.mod_decide_appeal(
  p_appeal_id uuid, p_status public.appeal_status, p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.require_role('moderator');
  v_a     record;
begin
  if p_status not in ('reviewing', 'accepted', 'rejected') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;

  select * into v_a from public.appeals where id = p_appeal_id;
  if v_a.id is null then
    raise exception 'Contestation introuvable.' using errcode = '22023', hint = 'APPEAL_NOT_FOUND';
  end if;

  if p_status in ('accepted', 'rejected')
     and (p_decision is null or char_length(btrim(p_decision)) < 3) then
    raise exception 'Une decision ecrite est obligatoire.'
      using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;

  update public.appeals
     set status = p_status,
         decision = nullif(btrim(coalesce(p_decision, '')), ''),
         handled_by = v_actor,
         resolved_at = case when p_status in ('accepted', 'rejected') then now() else null end
   where id = p_appeal_id;

  -- Un appel accepte leve reellement la sanction.
  if p_status = 'accepted' then
    perform public.mod_lift_sanction(v_a.sanction_id,
      'Contestation acceptee : ' || coalesce(btrim(p_decision), 'sans commentaire'));
  end if;

  perform app.log_admin_action(v_actor, 'decide_appeal', v_a.user_id,
    nullif(btrim(coalesce(p_decision, '')), ''),
    jsonb_build_object('appeal_id', p_appeal_id, 'status', p_status,
                       'sanction_id', v_a.sanction_id));

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

create or replace function public.mod_review_fraud_signal(
  p_signal_id bigint, p_outcome text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.require_role('moderator');
  v_s     record;
begin
  if p_outcome not in ('confirmed', 'dismissed') then
    raise exception 'Resultat invalide (confirmed ou dismissed).' using errcode = '22023';
  end if;

  select * into v_s from public.fraud_signals where id = p_signal_id;
  if v_s.id is null then
    raise exception 'Signal introuvable.' using errcode = '22023';
  end if;

  update public.fraud_signals
     set reviewed_at = now(), reviewed_by = v_actor, review_outcome = p_outcome
   where id = p_signal_id;

  perform app.log_admin_action(v_actor, 'review_fraud_signal', v_s.user_id, p_note,
    jsonb_build_object('signal_id', p_signal_id, 'outcome', p_outcome,
                       'signal_type', v_s.signal_type));

  return jsonb_build_object('ok', true, 'outcome', p_outcome);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Roles (§32 : les admins gerent davantage de fonctions)
-- -----------------------------------------------------------------------------
create or replace function public.mod_set_role(p_username text, p_role public.app_role, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := app.require_role('owner');   -- seul le proprietaire attribue les roles
  v_target uuid := app.resolve_user(p_username);
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Une raison ecrite est obligatoire.' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;
  if v_target = v_actor then
    raise exception 'Vous ne pouvez pas modifier votre propre role.' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role, granted_by, granted_at)
  values (v_target, p_role, v_actor, now())
  on conflict (user_id) do update
    set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();

  perform app.log_admin_action(v_actor, 'set_role', v_target, btrim(p_reason),
    jsonb_build_object('role', p_role));

  return jsonb_build_object('ok', true, 'role', p_role);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Listes pour le panneau de moderation
-- -----------------------------------------------------------------------------
create or replace function public.mod_list_reports(
  p_status public.report_status default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, category public.report_category, description text,
  status public.report_status, created_at timestamptz,
  reporter_username text, target_username text,
  target_status public.profile_status, target_reports_count bigint,
  resolution_note text, resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_role('moderator');
  return query
  select r.id, r.category, r.description, r.status, r.created_at,
         rp.username, tp.username, tp.status,
         (select count(*) from public.reports r2 where r2.target_user_id = r.target_user_id),
         r.resolution_note, r.resolved_at
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    join public.profiles tp on tp.id = r.target_user_id
   where p_status is null or r.status = p_status
   order by (r.status = 'pending') desc, r.created_at desc
   offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.mod_list_appeals(
  p_status public.appeal_status default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, username text, message text, status public.appeal_status,
  created_at timestamptz, decision text, resolved_at timestamptz,
  sanction_id uuid, sanction_type public.sanction_type, sanction_reason text,
  sanction_rule text, sanction_ends_at timestamptz, sanction_revoked boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_role('moderator');
  return query
  select a.id, p.username, a.message, a.status, a.created_at, a.decision, a.resolved_at,
         s.id, s.type, s.reason, s.rule_violated, s.ends_at, (s.revoked_at is not null)
    from public.appeals a
    join public.profiles p on p.id = a.user_id
    join public.sanctions s on s.id = a.sanction_id
   where p_status is null or a.status = p_status
   order by (a.status = 'pending') desc, a.created_at desc
   offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.mod_list_fraud_signals(
  p_only_open boolean default true,
  p_limit     integer default 50,
  p_offset    integer default 0
)
returns table (
  id bigint, username text, signal_type public.fraud_signal_type,
  severity smallint, details jsonb, detected_at timestamptz,
  review_outcome text, other_signals bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_role('moderator');
  return query
  select f.id, p.username, f.signal_type, f.severity, f.details, f.detected_at,
         f.review_outcome,
         -- §29 : un signal seul ne prouve rien. On affiche donc toujours le
         -- nombre d'autres signaux du meme compte, pour que la decision se
         -- prenne sur un faisceau et non sur un indice isole.
         (select count(*) from public.fraud_signals f2
           where f2.user_id = f.user_id and f2.id <> f.id)
    from public.fraud_signals f
    left join public.profiles p on p.id = f.user_id
   where (not coalesce(p_only_open, true)) or f.reviewed_at is null
   order by f.detected_at desc
   offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.mod_list_sanctions(
  p_active_only boolean default false,
  p_limit       integer default 50,
  p_offset      integer default 0
)
returns table (
  id uuid, username text, type public.sanction_type, reason text,
  rule_violated text, issued_by_username text, starts_at timestamptz,
  ends_at timestamptz, revoked_at timestamptz, appeal_status public.appeal_status
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_role('moderator');
  return query
  select s.id, p.username, s.type, s.reason, s.rule_violated, ip.username,
         s.starts_at, s.ends_at, s.revoked_at,
         (select a.status from public.appeals a where a.sanction_id = s.id)
    from public.sanctions s
    join public.profiles p on p.id = s.user_id
    left join public.profiles ip on ip.id = s.issued_by
   where (not coalesce(p_active_only, false))
      or (s.revoked_at is null and (s.ends_at is null or s.ends_at > now()))
   order by s.created_at desc
   offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.mod_list_admin_actions(
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  id bigint, admin_username text, action text, target_username text,
  reason text, metadata jsonb, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_role('admin');
  return query
  select a.id, ap.username, a.action, tp.username, a.reason, a.metadata, a.created_at
    from public.admin_actions a
    left join public.profiles ap on ap.id = a.admin_id
    left join public.profiles tp on tp.id = a.target_user_id
   order by a.created_at desc
   offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Fiche complete d'un compte pour la moderation. Volontairement SANS donnee
-- sensible inutile : ni date de naissance exacte, ni empreinte technique.
create or replace function public.mod_user_detail(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_target uuid;
  v_out    jsonb;
begin
  perform app.require_role('moderator');
  v_target := app.resolve_user(p_username);

  select jsonb_build_object(
    'username', p.username, 'status', p.status,
    'is_private', p.is_private, 'hidden_by_moderation', p.hidden_by_moderation,
    'setup_complete', p.setup_complete, 'created_at', p.created_at,
    'bio', p.bio, 'avatar_url', p.avatar_url, 'external_links', p.external_links,
    'role', coalesce(r.role, 'user'),
    -- Tranche d'age uniquement : suffisant pour appliquer les protections des
    -- mineurs, sans exposer la date de naissance (§13 / §19).
    'age_band', app.compute_age_band(pp.birth_date),
    'likes_received', coalesce(s.likes_total, 0),
    'likes_given', (select count(*) from public.likes l where l.from_user_id = p.id),
    'likes_received_24h', (select count(*) from public.likes l
                            where l.to_user_id = p.id and l.created_at > now() - interval '24 hours'),
    'rank_general', public.rank_of(p.id, 'general'),
    'username_changes', (select count(*) from public.username_history h where h.user_id = p.id),
    'reports_against', (select count(*) from public.reports rr where rr.target_user_id = p.id),
    'reports_filed', (select count(*) from public.reports rr where rr.reporter_id = p.id),
    'open_fraud_signals', (select count(*) from public.fraud_signals f
                            where f.user_id = p.id and f.reviewed_at is null),
    'sanctions', coalesce((
      select jsonb_agg(jsonb_build_object('id', sa.id, 'type', sa.type, 'reason', sa.reason,
                                          'rule_violated', sa.rule_violated,
                                          'starts_at', sa.starts_at, 'ends_at', sa.ends_at,
                                          'revoked_at', sa.revoked_at) order by sa.created_at desc)
        from public.sanctions sa where sa.user_id = p.id), '[]'::jsonb)
  )
  into v_out
  from public.profiles p
  left join public.user_roles      r  on r.user_id  = p.id
  left join public.profile_stats   s  on s.user_id  = p.id
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = v_target;

  return v_out;
end;
$$;

-- §12 (ameliorations) / §50 : les chiffres proviennent des TABLES REELLES
-- (profiles, likes, auth.users) et non d'evenements analytiques soumis au
-- consentement. Ils sont donc exacts et ne dependent d'aucun traitement
-- supplementaire.
--
-- Definitions retenues, explicites :
--   * utilisateur actif        : s'est connecte au moins une fois sur la periode
--   * active (§8 ameliorations): compte cree + onboarding termine + classement
--                                consulte + au moins un like donne
--   * retention Dn             : parmi les comptes crees il y a au moins n
--                                jours, part de ceux dont la derniere connexion
--                                est posterieure a inscription + n jours
create or replace function public.mod_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_out  jsonb;
begin
  perform app.require_role('admin');

  select jsonb_build_object(
    'generated_at', now(),
    'window_days', v_days,
    'users_total',        (select count(*) from public.profiles where status <> 'deleted'),
    'users_ready',        (select count(*) from public.profiles where setup_complete),
    'users_listed',       app.listable_count(),
    'users_suspended',    (select count(*) from public.profiles where status = 'suspended'),
    'users_banned',       (select count(*) from public.profiles where status = 'banned'),
    'users_private',      (select count(*) from public.profiles where is_private),
    'signups_window',     (select count(*) from public.profiles
                            where created_at > now() - make_interval(days => v_days)),
    'signups_today',      (select count(*) from public.profiles
                            where created_at >= date_trunc('day', now())),
    'signups_by_day',     coalesce((
        select jsonb_agg(jsonb_build_object('day', d.day, 'count', d.c) order by d.day)
          from (select date_trunc('day', created_at)::date as day, count(*) as c
                  from public.profiles
                 where created_at > now() - make_interval(days => v_days)
                 group by 1) d), '[]'::jsonb),
    'acquisition',        coalesce((
        select jsonb_object_agg(coalesce(pp.acquisition_channel, 'unknown'), pp.c)
          from (select acquisition_channel, count(*) as c
                  from public.profile_private group by 1) pp), '{}'::jsonb),
    'likes_total',        (select count(*) from public.likes),
    'likes_window',       (select count(*) from public.likes
                            where created_at > now() - make_interval(days => v_days)),
    'likes_24h',          (select count(*) from public.likes
                            where created_at > now() - interval '24 hours'),
    'active_users_window',(select count(*) from auth.users
                            where last_sign_in_at > now() - make_interval(days => v_days)),
    'daily_active_users', (select count(*) from auth.users
                            where last_sign_in_at > now() - interval '1 day'),
    'top_likers',         coalesce((
        select jsonb_agg(jsonb_build_object('username', t.username, 'likes_given', t.c)
                         order by t.c desc)
          from (select p.username, count(*) as c
                  from public.likes l join public.profiles p on p.id = l.from_user_id
                 group by p.username order by count(*) desc limit 10) t), '[]'::jsonb),
    'activation_rate',    (
        -- §8 (ameliorations) : compte cree, profil complete, classement
        -- consulte, au moins un like donne. La consultation du classement
        -- provient des evenements analytiques : la valeur n'est donc
        -- representative QUE des utilisateurs ayant consenti a la mesure. Elle
        -- est renvoyee avec son denominateur pour rester interpretable.
        select case when count(*) = 0 then null else
          round(100.0 * count(*) filter (
            where p.profile_completed
              and exists (select 1 from public.likes l where l.from_user_id = p.id)
              and exists (select 1 from public.analytics_events e
                           where e.user_id = p.id
                             and e.event_name in ('leaderboard_viewed', 'leaderboard_24h_viewed'))
          ) / count(*), 1) end
          from public.profiles p where p.setup_complete),
    'activation_note', 'Le critere « classement consulte » repose sur les '
                       'evenements analytiques, donc sur les utilisateurs ayant '
                       'consenti a la mesure. Les autres criteres proviennent '
                       'des tables reelles.',
    'retention', jsonb_build_object(
      'd1',  app.retention_rate(1),
      'd7',  app.retention_rate(7),
      'd30', app.retention_rate(30)
    ),
    'reports_pending',  (select count(*) from public.reports where status in ('pending', 'reviewing')),
    'appeals_pending',  (select count(*) from public.appeals where status in ('pending', 'reviewing')),
    'fraud_signals_open',(select count(*) from public.fraud_signals where reviewed_at is null),
    'privacy_requests_pending', (select count(*) from public.privacy_requests
                                  where status in ('pending', 'in_progress')),
    'shares_window', (select count(*) from public.analytics_events
                       where event_name = 'share_completed'
                         and occurred_at > now() - make_interval(days => v_days)),
    'signups_from_share', (select count(*) from public.profile_private
                            where acquisition_channel = 'share')
  ) into v_out;

  return v_out;
end;
$$;

create or replace function app.retention_rate(p_day integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_cohort integer;
  v_kept   integer;
begin
  select count(*), count(*) filter (
           where u.last_sign_in_at > p.created_at + make_interval(days => p_day)
         )
    into v_cohort, v_kept
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.created_at < now() - make_interval(days => p_day);

  return jsonb_build_object(
    'cohort_size', v_cohort,
    'retained',    v_kept,
    'rate',        case when v_cohort = 0 then null
                        else round(100.0 * v_kept / v_cohort, 1) end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Maintenance (a planifier avec pg_cron — voir la migration suivante)
-- -----------------------------------------------------------------------------
-- Rafraichit le cache de classement. Sans effet fonctionnel tant que la
-- volumetrie reste sous le seuil de calcul en direct, mais le faire tourner des
-- le depart evite une bascule brutale le jour ou le seuil est franchi.
create or replace function public.refresh_leaderboards()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_general integer;
  v_h24     integer;
begin
  delete from public.leaderboard_cache where ranking_type = 'general';
  insert into public.leaderboard_cache (ranking_type, board_position, rank, user_id, likes_count)
  select 'general',
         row_number() over (order by coalesce(s.likes_total, 0) desc, p.created_at asc, p.id asc),
         rank()       over (order by coalesce(s.likes_total, 0) desc),
         p.id, coalesce(s.likes_total, 0)
    from public.profiles p
    join public.profile_stats s on s.user_id = p.id
   where p.status = 'active' and p.is_private = false
     and p.hidden_by_moderation = false and p.setup_complete = true;
  get diagnostics v_general = row_count;

  delete from public.leaderboard_cache where ranking_type = 'h24';
  insert into public.leaderboard_cache (ranking_type, board_position, rank, user_id, likes_count)
  with windowed as (
    select l.to_user_id as id, count(*)::integer as lc
      from public.likes l
     where l.created_at > now() - interval '24 hours'
     group by l.to_user_id
  )
  select 'h24',
         row_number() over (order by w.lc desc, p.created_at asc, p.id asc),
         rank()       over (order by w.lc desc),
         p.id, w.lc
    from windowed w
    join public.profiles p on p.id = w.id
   where p.status = 'active' and p.is_private = false
     and p.hidden_by_moderation = false and p.setup_complete = true;
  get diagnostics v_h24 = row_count;

  return jsonb_build_object('general', v_general, 'h24', v_h24, 'refreshed_at', now());
end;
$$;

-- §11 / §14 (ameliorations) : enregistre les positions du jour et genere les
-- notifications de changement de rang a partir de la COMPARAISON avec la
-- derniere mesure reellement enregistree. Aucun mouvement n'est invente.
create or replace function public.snapshot_ranks()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows   integer := 0;
  v_notifs integer := 0;
  r        record;
begin
  create temporary table if not exists _snap (
    user_id uuid, rank integer, likes_count integer
  ) on commit drop;
  delete from _snap;

  insert into _snap (user_id, rank, likes_count)
  select p.id,
         rank() over (order by coalesce(s.likes_total, 0) desc),
         coalesce(s.likes_total, 0)
    from public.profiles p
    join public.profile_stats s on s.user_id = p.id
   where p.status = 'active' and p.is_private = false
     and p.hidden_by_moderation = false and p.setup_complete = true;

  for r in
    select n.user_id, n.rank as new_rank, n.likes_count,
           prev.rank as old_rank,
           coalesce(pp.notify_rank, true) as wants
      from _snap n
      left join public.profile_private pp on pp.user_id = n.user_id
      left join lateral (
        select h.rank from public.rank_history h
         where h.user_id = n.user_id and h.ranking_type = 'general'
         order by h.recorded_at desc limit 1
      ) prev on true
  loop
    insert into public.rank_history (user_id, ranking_type, rank, likes_count)
    values (r.user_id, 'general', r.new_rank, r.likes_count);
    v_rows := v_rows + 1;

    -- Meilleur classement atteint (§12 : « Ton meilleur classement : #24 »)
    update public.profile_stats
       set best_rank = r.new_rank, best_rank_at = now()
     where user_id = r.user_id
       and (best_rank is null or r.new_rank < best_rank);

    if r.wants and r.old_rank is not null and r.new_rank <> r.old_rank then
      if r.new_rank < r.old_rank then
        insert into public.notifications (user_id, type, payload)
        values (r.user_id, 'rank_up',
                jsonb_build_object('old_rank', r.old_rank, 'new_rank', r.new_rank,
                                   'delta', r.old_rank - r.new_rank));
      else
        insert into public.notifications (user_id, type, payload)
        values (r.user_id, 'overtaken',
                jsonb_build_object('old_rank', r.old_rank, 'new_rank', r.new_rank,
                                   'delta', r.old_rank - r.new_rank));
      end if;
      v_notifs := v_notifs + 1;

      -- Paliers reellement franchis, dans ce sens uniquement.
      if r.new_rank <= 100 and r.old_rank > 100 then
        insert into public.notifications (user_id, type, payload)
        values (r.user_id, 'milestone_top', jsonb_build_object('milestone', 100, 'rank', r.new_rank));
        v_notifs := v_notifs + 1;
      elsif r.new_rank <= 10 and r.old_rank > 10 then
        insert into public.notifications (user_id, type, payload)
        values (r.user_id, 'milestone_top', jsonb_build_object('milestone', 10, 'rank', r.new_rank));
        v_notifs := v_notifs + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('snapshots', v_rows, 'notifications', v_notifs, 'at', now());
end;
$$;

-- §25 / §29 : detection de motifs qui ne sont visibles qu'a l'echelle de
-- l'ensemble des donnees. Produit des SIGNAUX, jamais des sanctions.
create or replace function public.run_fraud_detection()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new integer := 0;
  v_c   integer;
begin
  -- 1. Volume anormal de likes donnes sur 24 h.
  insert into public.fraud_signals (user_id, signal_type, severity, details)
  select l.from_user_id, 'like_volume', 3,
         jsonb_build_object('likes_24h', count(*), 'threshold', 300)
    from public.likes l
   where l.created_at > now() - interval '24 hours'
   group by l.from_user_id
  having count(*) >= 300
     and not exists (
       select 1 from public.fraud_signals f
        where f.user_id = l.from_user_id and f.signal_type = 'like_volume'
          and f.detected_at > now() - interval '24 hours');
  get diagnostics v_c = row_count; v_new := v_new + v_c;

  -- 2. Echanges reciproques massifs : deux comptes qui se likent dans un
  --    intervalle tres court, de facon repetee.
  insert into public.fraud_signals (user_id, signal_type, severity, details)
  select t.user_id, 'reciprocal_pattern', 2,
         jsonb_build_object('fast_reciprocal_pairs', t.c, 'threshold', 15)
    from (
      select a.from_user_id as user_id, count(*) as c
        from public.likes a
        join public.likes b
          on b.from_user_id = a.to_user_id
         and b.to_user_id   = a.from_user_id
         and abs(extract(epoch from (b.created_at - a.created_at))) < 300
       where a.created_at > now() - interval '7 days'
       group by a.from_user_id
    ) t
   where t.c >= 15
     and not exists (
       select 1 from public.fraud_signals f
        where f.user_id = t.user_id and f.signal_type = 'reciprocal_pattern'
          and f.detected_at > now() - interval '24 hours');
  get diagnostics v_c = row_count; v_new := v_new + v_c;

  -- 3. Rafale d'inscriptions. Aucun compte n'est designe : le signal porte sur
  --    la periode, car une IP peut etre partagee (§29). C'est a un humain de
  --    regarder les comptes concernes.
  insert into public.fraud_signals (user_id, signal_type, severity, details)
  select null, 'signup_burst', 2,
         jsonb_build_object('signups_last_hour', count(*), 'threshold', 50)
    from public.profiles
   where created_at > now() - interval '1 hour'
  having count(*) >= 50
     and not exists (
       select 1 from public.fraud_signals f
        where f.signal_type = 'signup_burst'
          and f.detected_at > now() - interval '1 hour');
  get diagnostics v_c = row_count; v_new := v_new + v_c;

  return jsonb_build_object('new_signals', v_new, 'at', now());
end;
$$;

-- Conservation des evenements analytiques. La duree definitive n'est PAS
-- decidee ici : ce parametre doit etre fixe par le responsable du traitement et
-- reporte dans la politique de confidentialite. La valeur par defaut (14 mois)
-- est un point de depart courant, pas une obligation juridique affirmee.
create or replace function public.purge_analytics_events(p_keep_months integer default 14)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rows integer;
begin
  delete from public.analytics_events
   where occurred_at < now() - make_interval(months => greatest(coalesce(p_keep_months, 14), 1));
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
