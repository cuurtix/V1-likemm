-- =============================================================================
-- LIKEMM — 07b · Actions : likes, notifications, consentements, signalements,
--                 appels, droits RGPD, liens prives, analytics
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Likes (§9 / §25 / §27 / §29)
-- -----------------------------------------------------------------------------
-- Enchainement impose par le cahier des charges, dans cet ordre :
--   1. verifier l'authentification            5. mettre a jour les compteurs
--   2. verifier que le compte peut agir       6. creer la notification
--   3. verifier les regles anti-abus          7. laisser l'interface se mettre
--   4. creer le like reel                       a jour sur le retour reel
-- Les etapes 5 et 6 sont assurees par des triggers, donc indissociables de
-- l'insertion : il est impossible d'avoir un like sans compteur a jour.
create or replace function public.like_user(
  p_target_id    uuid,
  p_invite_token text default null,
  p_source       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := app.require_active_account();
  v_t         record;
  v_token_ok  boolean := false;
  v_recent    integer;
  v_fp        text;
  v_total     integer;
begin
  if p_target_id is null then
    raise exception 'Profil introuvable.' using errcode = '22023', hint = 'TARGET_MISSING';
  end if;

  -- --- 2. la cible peut-elle recevoir un like ? -----------------------------
  select p.id, p.status, p.is_private, p.hidden_by_moderation, p.setup_complete
    into v_t from public.profiles p where p.id = p_target_id;

  if v_t.id is null then
    raise exception 'Ce profil n''existe pas ou n''est plus disponible.'
      using errcode = '22023', hint = 'TARGET_NOT_FOUND';
  end if;

  if v_t.status <> 'active' or v_t.hidden_by_moderation or not v_t.setup_complete then
    raise exception 'Ce profil n''est pas disponible.'
      using errcode = '22023', hint = 'TARGET_UNAVAILABLE';
  end if;

  -- §22 : un blocage empeche reellement l'interaction, pas seulement
  -- l'affichage.
  if app.is_blocked_between(v_uid, p_target_id) then
    raise exception 'Cette interaction n''est pas possible.'
      using errcode = '42501', hint = 'BLOCKED';
  end if;

  -- §32 : un profil prive ne peut etre like que par son proprietaire ou par
  -- une personne disposant d'un lien d'invitation valide.
  if v_t.is_private and v_t.id is distinct from v_uid then
    if p_invite_token is not null then
      select true into v_token_ok
        from public.private_profile_links l
       where l.user_id    = p_target_id
         and l.token_hash = encode(extensions.digest(p_invite_token, 'sha256'), 'hex')
         and l.revoked_at is null
         and (l.expires_at is null or l.expires_at > now())
       limit 1;
    end if;
    if not coalesce(v_token_ok, false) then
      raise exception 'Ce profil est prive.'
        using errcode = '42501', hint = 'TARGET_PRIVATE';
    end if;
  end if;

  -- --- 3. regles anti-abus --------------------------------------------------
  -- §27 : limitation cote serveur, a plusieurs echelles de temps.
  perform app.enforce_rate_limit('like_minute', 20,  interval '1 minute');
  perform app.enforce_rate_limit('like_hour',   200, interval '1 hour');
  perform app.enforce_rate_limit('like_day',    600, interval '1 day');

  v_fp := app.request_fingerprint();

  -- §29 : on enregistre des SIGNAUX, on ne prononce pas de verdict. Le like
  -- passe ; c'est un humain qui decidera, via le panneau de moderation.
  select count(*) into v_recent
    from public.likes
   where from_user_id = v_uid and created_at > now() - interval '10 seconds';

  if v_recent >= 6 then
    insert into public.fraud_signals (user_id, signal_type, severity, details, fingerprint)
    values (v_uid, 'like_velocity', 3,
            jsonb_build_object('likes_in_10s', v_recent + 1), v_fp);
  end if;

  select count(*) into v_recent
    from public.likes
   where from_user_id = v_uid and created_at > now() - interval '1 hour';

  if v_recent >= 120 then
    insert into public.fraud_signals (user_id, signal_type, severity, details, fingerprint)
    values (v_uid, 'like_volume', 3,
            jsonb_build_object('likes_in_1h', v_recent + 1), v_fp);
  end if;

  -- --- 4. creation du like reel ---------------------------------------------
  begin
    insert into public.likes (from_user_id, to_user_id)
    values (v_uid, p_target_id);
  exception when unique_violation then
    -- La contrainte UNIQUE a fait son travail : un seul like actif par paire.
    raise exception 'Vous avez deja like ce profil.'
      using errcode = '23505', hint = 'ALREADY_LIKED';
  end;

  select coalesce(s.likes_total, 0) into v_total
    from public.profile_stats s where s.user_id = p_target_id;

  return jsonb_build_object(
    'ok', true,
    'liked', true,
    'target_id', p_target_id,
    'target_likes_total', coalesce(v_total, 0),
    'target_likes_24h', (select count(*) from public.likes l
                          where l.to_user_id = p_target_id
                            and l.created_at > now() - interval '24 hours'),
    'source', case when p_source in ('leaderboard', 'search', 'profile', 'shared_profile', 'neighbor')
                   then p_source else null end
  );
end;
$$;

create or replace function public.unlike_user(p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := app.require_active_account();
  v_deleted integer;
  v_total   integer;
begin
  perform app.enforce_rate_limit('unlike_minute', 20, interval '1 minute');

  delete from public.likes
   where from_user_id = v_uid and to_user_id = p_target_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'Vous n''avez pas like ce profil.'
      using errcode = '22023', hint = 'NOT_LIKED';
  end if;

  select coalesce(s.likes_total, 0) into v_total
    from public.profile_stats s where s.user_id = p_target_id;

  return jsonb_build_object(
    'ok', true, 'liked', false, 'target_id', p_target_id,
    'target_likes_total', coalesce(v_total, 0),
    'target_likes_24h', (select count(*) from public.likes l
                          where l.to_user_id = p_target_id
                            and l.created_at > now() - interval '24 hours')
  );
end;
$$;

-- §10 : qui m'a like — en respectant « masquer mes likes » (§21).
create or replace function public.get_my_likers(
  p_limit  integer default 30,
  p_offset integer default 0
)
returns table (
  username text, avatar_url text, liked_at timestamptz, hidden boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if v_uid is null then
    return;
  end if;

  return query
  select case when lp.hide_likes then null else lp.username end,
         case when lp.hide_likes then null else lp.avatar_url end,
         l.created_at,
         lp.hide_likes
    from public.likes l
    join public.profiles lp on lp.id = l.from_user_id
   where l.to_user_id = v_uid
   order by l.created_at desc
   offset greatest(coalesce(p_offset, 0), 0) limit v_limit;
end;
$$;

-- Les profils que J'AI likes (toujours visibles pour moi, meme si j'ai active
-- « masquer mes likes » : cette option concerne le regard des autres).
create or replace function public.get_my_liked_profiles(
  p_limit  integer default 30,
  p_offset integer default 0
)
returns table (
  user_id uuid, username text, avatar_url text, liked_at timestamptz, likes_total integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if v_uid is null then
    return;
  end if;

  return query
  select p.id, p.username, p.avatar_url, l.created_at, coalesce(s.likes_total, 0)::integer
    from public.likes l
    join public.profiles p on p.id = l.to_user_id
    left join public.profile_stats s on s.user_id = p.id
   where l.from_user_id = v_uid
   order by l.created_at desc
   offset greatest(coalesce(p_offset, 0), 0) limit v_limit;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Notifications (§19)
-- -----------------------------------------------------------------------------
create or replace function public.get_notifications(
  p_limit       integer default 30,
  p_offset      integer default 0,
  p_only_unread boolean default false
)
returns table (
  id bigint, type public.notification_type, payload jsonb,
  actor_username text, actor_avatar_url text, actor_hidden boolean,
  read_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if v_uid is null then
    return;
  end if;

  return query
  select n.id, n.type, n.payload,
         -- §21 : l'identite de l'auteur est masquee s'il l'a demande.
         case when n.actor_hidden then null else ap.username end,
         case when n.actor_hidden then null else ap.avatar_url end,
         n.actor_hidden,
         n.read_at, n.created_at
    from public.notifications n
    left join public.profiles ap on ap.id = n.actor_id
   where n.user_id = v_uid
     and (not coalesce(p_only_unread, false) or n.read_at is null)
   order by n.created_at desc
   offset greatest(coalesce(p_offset, 0), 0) limit v_limit;
end;
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    return 0;
  end if;

  update public.notifications
     set read_at = now()
   where user_id = v_uid
     and read_at is null
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- §14 (ameliorations) : historique reel des positions enregistrees.
create or replace function public.get_my_rank_history(
  p_type public.ranking_type default 'general',
  p_days integer default 30
)
returns table (rank integer, likes_count integer, recorded_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if v_uid is null then
    return;
  end if;

  return query
  select h.rank, h.likes_count, h.recorded_at
    from public.rank_history h
   where h.user_id = v_uid
     and h.ranking_type = p_type
     and h.recorded_at > now() - make_interval(days => v_days)
   order by h.recorded_at asc;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Consentements et documents juridiques (§17 / §18 / §37 / §39)
-- -----------------------------------------------------------------------------
create or replace function public.set_consent(
  p_consent_type   public.consent_type,
  p_granted        boolean,
  p_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_age_band public.age_band;
  v_status   public.consent_status;
  v_forced   boolean := false;
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  perform app.enforce_rate_limit('set_consent', 60, interval '1 hour');

  select app.compute_age_band(pp.birth_date) into v_age_band
    from public.profile_private pp where pp.user_id = v_uid;

  v_status := case when p_granted then 'granted' else 'denied' end;

  -- §18 / §43 : pas de profilage publicitaire des mineurs lorsqu'il n'est pas
  -- legalement permis. Le consentement publicitaire et de personnalisation est
  -- donc refuse par construction pour les comptes mineurs — et on le DIT, au
  -- lieu de faire semblant de l'avoir enregistre.
  if v_age_band is not null and v_age_band <> 'adult'
     and p_consent_type in ('advertising', 'personalization') and p_granted then
    v_status := 'denied';
    v_forced := true;
  end if;

  insert into public.consents (user_id, consent_type, status, policy_version, updated_at)
  values (v_uid, p_consent_type, v_status, p_policy_version, now())
  on conflict (user_id, consent_type) do update
    set status = excluded.status,
        policy_version = excluded.policy_version,
        updated_at = now();

  -- Preuve du consentement : journal en ajout seul, jamais ecrase (§17).
  insert into public.consent_log (user_id, consent_type, status, policy_version)
  values (v_uid, p_consent_type, v_status, p_policy_version);

  return jsonb_build_object(
    'ok', true,
    'consent_type', p_consent_type,
    'status', v_status,
    'forced_denied_minor', v_forced
  );
end;
$$;

-- §14 : « retrait du consentement lorsque le traitement repose sur le
-- consentement ». Le retrait est distinct d'un refus initial et est trace.
create or replace function public.withdraw_consent(
  p_consent_type   public.consent_type,
  p_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  perform app.enforce_rate_limit('set_consent', 60, interval '1 hour');

  insert into public.consents (user_id, consent_type, status, policy_version, updated_at)
  values (v_uid, p_consent_type, 'withdrawn', p_policy_version, now())
  on conflict (user_id, consent_type) do update
    set status = 'withdrawn', policy_version = excluded.policy_version, updated_at = now();

  insert into public.consent_log (user_id, consent_type, status, policy_version)
  values (v_uid, p_consent_type, 'withdrawn', p_policy_version);

  insert into public.privacy_requests (user_id, type, message, status)
  values (v_uid, 'consent_withdrawal',
          'Retrait du consentement : ' || p_consent_type::text, 'completed');

  return jsonb_build_object('ok', true, 'consent_type', p_consent_type, 'status', 'withdrawn');
end;
$$;

create or replace function public.accept_legal(p_document text, p_policy_version text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  if p_document not in ('terms', 'privacy', 'community_guidelines') then
    raise exception 'Document inconnu.' using errcode = '22023';
  end if;

  perform app.enforce_rate_limit('accept_legal', 30, interval '1 hour');

  insert into public.legal_acceptances (user_id, document, policy_version)
  values (v_uid, p_document, p_policy_version);

  return jsonb_build_object('ok', true, 'document', p_document, 'policy_version', p_policy_version);
end;
$$;

-- §43 : enregistrement du consentement parental lorsqu'il est requis.
-- On conserve la NATURE de la preuve fournie, pas de piece d'identite (§19).
create or replace function public.record_parental_consent(p_proof_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  if p_proof_reference is null or char_length(btrim(p_proof_reference)) < 3
     or char_length(p_proof_reference) > 200 then
    raise exception 'Reference de preuve invalide.' using errcode = '22023';
  end if;

  update public.profile_private
     set parental_consent_at    = now(),
         parental_consent_proof = btrim(p_proof_reference)
   where user_id = v_uid and parental_consent_required;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Signalements, sanctions, appels (§21 / §24 / §31 / §33)
-- -----------------------------------------------------------------------------
create or replace function public.create_report(
  p_target_username text,
  p_category        public.report_category,
  p_description     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := app.require_active_account();
  v_target uuid;
  v_id     uuid;
begin
  perform app.enforce_rate_limit('create_report', 10, interval '1 day');

  select p.id into v_target
    from public.profiles p
   where p.username = public.normalize_username(p_target_username)
     and p.status <> 'deleted';

  if v_target is null then
    raise exception 'Ce profil n''existe pas.' using errcode = '22023', hint = 'TARGET_NOT_FOUND';
  end if;

  if v_target = v_uid then
    raise exception 'Vous ne pouvez pas signaler votre propre profil.'
      using errcode = '22023', hint = 'TARGET_SELF';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'La description ne doit pas depasser 1000 caracteres.'
      using errcode = '22023';
  end if;

  begin
    insert into public.reports (reporter_id, target_user_id, category, description)
    values (v_uid, v_target, p_category, nullif(btrim(coalesce(p_description, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Vous avez deja un signalement en cours pour ce profil et ce motif.'
      using errcode = '23505', hint = 'REPORT_DUPLICATE';
  end;

  return jsonb_build_object('ok', true, 'report_id', v_id, 'status', 'pending');
end;
$$;

-- §33 : « Ne pas faire semblant qu'un appel a ete envoye si aucune donnee
-- n'est reellement enregistree. » L'appel est donc une vraie ligne en base,
-- rattachee a une vraie sanction.
create or replace function public.create_appeal(p_sanction_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_s   record;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  -- Un compte suspendu ou banni DOIT pouvoir contester : on n'utilise donc pas
  -- require_active_account() ici.
  perform app.enforce_rate_limit('create_appeal', 5, interval '1 day');

  select * into v_s from public.sanctions where id = p_sanction_id;

  if v_s.id is null or v_s.user_id <> v_uid then
    raise exception 'Sanction introuvable.' using errcode = '22023', hint = 'SANCTION_NOT_FOUND';
  end if;

  if not v_s.appealable then
    raise exception 'Cette decision n''est pas contestable.'
      using errcode = '22023', hint = 'NOT_APPEALABLE';
  end if;

  if v_s.revoked_at is not null then
    raise exception 'Cette sanction a deja ete levee.'
      using errcode = '22023', hint = 'SANCTION_REVOKED';
  end if;

  if p_message is null or char_length(btrim(p_message)) < 10 then
    raise exception 'Expliquez votre demande en quelques phrases (10 caracteres minimum).'
      using errcode = '22023', hint = 'MESSAGE_TOO_SHORT';
  end if;

  begin
    insert into public.appeals (user_id, sanction_id, message)
    values (v_uid, p_sanction_id, btrim(p_message))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Vous avez deja conteste cette decision.'
      using errcode = '23505', hint = 'APPEAL_EXISTS';
  end;

  return jsonb_build_object('ok', true, 'appeal_id', v_id, 'status', 'pending');
end;
$$;

-- §22 : blocage. La table et les regles backend existent reellement ; le
-- blocage n'est pas un simple masquage visuel.
create or replace function public.block_user(p_target_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := app.require_active_account();
  v_target uuid;
begin
  perform app.enforce_rate_limit('block_user', 50, interval '1 day');

  select p.id into v_target from public.profiles p
   where p.username = public.normalize_username(p_target_username) and p.status <> 'deleted';

  if v_target is null then
    raise exception 'Ce profil n''existe pas.' using errcode = '22023', hint = 'TARGET_NOT_FOUND';
  end if;
  if v_target = v_uid then
    raise exception 'Vous ne pouvez pas vous bloquer vous-meme.' using errcode = '22023';
  end if;

  insert into public.blocks (blocker_id, blocked_id) values (v_uid, v_target)
  on conflict do nothing;

  -- Un blocage rompt les interactions existantes dans les deux sens.
  delete from public.likes
   where (from_user_id = v_uid and to_user_id = v_target)
      or (from_user_id = v_target and to_user_id = v_uid);

  return jsonb_build_object('ok', true, 'blocked', true);
end;
$$;

create or replace function public.unblock_user(p_target_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := app.require_active_account();
  v_target uuid;
begin
  select p.id into v_target from public.profiles p
   where p.username = public.normalize_username(p_target_username);

  if v_target is null then
    raise exception 'Ce profil n''existe pas.' using errcode = '22023', hint = 'TARGET_NOT_FOUND';
  end if;

  delete from public.blocks where blocker_id = v_uid and blocked_id = v_target;
  return jsonb_build_object('ok', true, 'blocked', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Liens de profil prive (§32)
-- -----------------------------------------------------------------------------
-- Le token en clair est renvoye UNE SEULE FOIS, a la creation. La base ne
-- conserve que son empreinte SHA-256 : meme avec un acces a la base, on ne
-- peut pas reconstituer un lien existant.
create or replace function public.create_private_link(
  p_label      text default null,
  p_expires_in interval default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := app.require_active_account();
  v_token text;
  v_id    uuid;
  v_count integer;
begin
  perform app.enforce_rate_limit('create_private_link', 20, interval '1 day');

  select count(*) into v_count
    from public.private_profile_links
   where user_id = v_uid and revoked_at is null
     and (expires_at is null or expires_at > now());

  if v_count >= 10 then
    raise exception 'Vous avez atteint la limite de 10 liens prives actifs. Revoquez-en un d''abord.'
      using errcode = '54000', hint = 'LINK_LIMIT';
  end if;

  -- 32 octets aleatoires -> 43 caracteres base64url. Non devinable.
  v_token := replace(replace(replace(
               encode(extensions.gen_random_bytes(32), 'base64'),
             '+', '-'), '/', '_'), '=', '');

  insert into public.private_profile_links (user_id, token_hash, label, expires_at)
  values (
    v_uid,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    nullif(btrim(coalesce(p_label, '')), ''),
    case when p_expires_in is null then null else now() + p_expires_in end
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'token', v_token,
    'note', 'Ce token n''est affiche qu''une seule fois : seule son empreinte est conservee.'
  );
end;
$$;

-- §32 : « Revoquer tous mes liens prives »
create or replace function public.revoke_private_links(p_link_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := app.require_active_account();
  v_rows integer;
begin
  update public.private_profile_links
     set revoked_at = now()
   where user_id = v_uid and revoked_at is null
     and (p_link_id is null or id = p_link_id);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Analytics (§1 et §36 : fonction centralisee, evenements reels)
-- -----------------------------------------------------------------------------
-- Trois garde-fous, tous cote serveur :
--   1. le nom de l'evenement doit exister dans analytics_event_types ;
--   2. les metadonnees sont filtrees par une liste blanche de cles, avec des
--      valeurs bornees : impossible de faire passer un email ou un texte libre ;
--   3. l'evenement n'est enregistre que si le consentement analytics est
--      accorde — sinon la fonction retourne false, sans rien ecrire.
--
-- A noter : les metriques STRUCTURELLES (nombre d'inscrits, de likes, de
-- partages, taux d'activation, retention D1/D7/D30) sont calculees a partir
-- des tables reelles (profiles.created_at, likes.created_at...). Elles ne
-- dependent donc pas de cette table, et aucun consentement n'est necessaire
-- pour elles puisqu'aucune donnee supplementaire n'est collectee.
create or replace function app.sanitize_event_metadata(p_metadata jsonb)
returns jsonb
language plpgsql
immutable
set search_path = app, pg_temp
as $$
declare
  v_allowed text[] := array[
    'mode', 'source', 'channel', 'ref', 'rank', 'old_rank', 'new_rank', 'delta',
    'target_user_id', 'notification_type', 'category', 'count', 'query_length',
    'page', 'step', 'result_count', 'consent_type', 'granted', 'position'
  ];
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    return '{}'::jsonb;
  end if;

  for v_key, v_val in select * from jsonb_each(p_metadata) loop
    if v_key = any (v_allowed) then
      if jsonb_typeof(v_val) in ('number', 'boolean') then
        v_out := v_out || jsonb_build_object(v_key, v_val);
      elsif jsonb_typeof(v_val) = 'string' and char_length(v_val #>> '{}') <= 64 then
        v_out := v_out || jsonb_build_object(v_key, v_val);
      end if;
    end if;
  end loop;

  return v_out;
end;
$$;

create or replace function public.track_event(
  p_event_name text,
  p_metadata   jsonb default '{}'::jsonb,
  p_anon_id    text default null,
  p_session_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_granted boolean := false;
begin
  if p_event_name is null
     or not exists (select 1 from public.analytics_event_types t where t.name = p_event_name) then
    -- On ne leve pas d'exception : un evenement inconnu ne doit pas casser le
    -- parcours. Il est simplement ignore.
    return false;
  end if;

  perform app.enforce_rate_limit('track_event', 400, interval '1 hour');

  -- §12 / §37 : respect du consentement. Sans consentement analytics, rien
  -- n'est enregistre.
  if v_uid is not null then
    select (c.status = 'granted') into v_granted
      from public.consents c
     where c.user_id = v_uid and c.consent_type = 'analytics';
  else
    -- Visiteur non connecte : le client n'appelle cette fonction qu'apres un
    -- consentement explicite. On l'accepte donc, sans aucun identifiant
    -- personnel (juste un identifiant aleatoire local au navigateur).
    v_granted := p_anon_id is not null;
  end if;

  if not coalesce(v_granted, false) then
    return false;
  end if;

  insert into public.analytics_events (user_id, anon_id, session_id, event_name, metadata)
  values (
    v_uid,
    case when v_uid is null then left(coalesce(p_anon_id, ''), 64) else null end,
    left(coalesce(p_session_id, ''), 64),
    p_event_name,
    app.sanitize_event_metadata(p_metadata)
  );

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Droits RGPD (§14 / §31 / §35)
-- -----------------------------------------------------------------------------
create or replace function public.create_privacy_request(
  p_type    public.privacy_request_type,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  perform app.enforce_rate_limit('privacy_request', 10, interval '1 day');

  insert into public.privacy_requests (user_id, type, message)
  values (v_uid, p_type, nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_id;

  -- Aucun delai n'est promis ici : il depend du fondement juridique du
  -- traitement et de la demande (§14). L'interface renvoie vers le contact.
  return jsonb_build_object('ok', true, 'request_id', v_id, 'status', 'pending');
end;
$$;

-- §31 / §35 : « Telecharger mes donnees ». Contenu exporte : le profil, les
-- parametres, les likes, l'historique, les notifications, les consentements.
-- Volontairement EXCLUS : secrets internes, donnees de securite, signaux
-- anti-fraude, notes de moderation, et toute donnee personnelle d'autrui.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  perform app.enforce_rate_limit('export_my_data', 5, interval '1 day');

  select jsonb_build_object(
    'export_generated_at', now(),
    'export_format_version', 1,
    'account', jsonb_build_object(
      'id', p.id, 'username', p.username, 'email', u.email,
      'email_confirmed_at', u.email_confirmed_at,
      'created_at', p.created_at, 'status', p.status,
      'last_sign_in_at', u.last_sign_in_at
    ),
    'profile', jsonb_build_object(
      'avatar_url', p.avatar_url, 'cover_url', p.cover_url, 'bio', p.bio,
      'external_links', p.external_links, 'is_private', p.is_private,
      'hide_likes', p.hide_likes, 'profile_completed', p.profile_completed,
      'username_changed_at', p.username_changed_at
    ),
    'personal_data', jsonb_build_object(
      'birth_date', pp.birth_date,
      'age_band', app.compute_age_band(pp.birth_date),
      'acquisition_channel', pp.acquisition_channel,
      'acquisition_ref', pp.acquisition_ref,
      'acquisition_utm', pp.acquisition_utm
    ),
    'notification_settings', jsonb_build_object(
      'notify_likes', pp.notify_likes, 'notify_rank', pp.notify_rank,
      'notify_email_security', pp.notify_email_security,
      'notify_email_marketing', pp.notify_email_marketing
    ),
    'stats', jsonb_build_object(
      'likes_total', coalesce(st.likes_total, 0),
      'best_rank', st.best_rank, 'best_rank_at', st.best_rank_at,
      'current_rank_general', public.rank_of(v_uid, 'general')
    ),
    'likes_given', coalesce((
      select jsonb_agg(jsonb_build_object('to_username', tp.username, 'at', l.created_at)
                       order by l.created_at desc)
        from public.likes l join public.profiles tp on tp.id = l.to_user_id
       where l.from_user_id = v_uid
    ), '[]'::jsonb),
    -- Les likes RECUS sont une donnee me concernant. L'identite de leur auteur
    -- n'est incluse que lorsqu'elle est deja visible pour moi dans
    -- l'application (§21 : « masquer mes likes »).
    'likes_received', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from_username', case when fp.hide_likes then null else fp.username end,
               'author_hidden', fp.hide_likes, 'at', l.created_at)
                       order by l.created_at desc)
        from public.likes l join public.profiles fp on fp.id = l.from_user_id
       where l.to_user_id = v_uid
    ), '[]'::jsonb),
    'rank_history', coalesce((
      select jsonb_agg(jsonb_build_object('type', h.ranking_type, 'rank', h.rank,
                                          'likes_count', h.likes_count, 'at', h.recorded_at)
                       order by h.recorded_at desc)
        from public.rank_history h where h.user_id = v_uid
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('type', n.type, 'payload', n.payload,
                                          'read_at', n.read_at, 'at', n.created_at)
                       order by n.created_at desc)
        from public.notifications n where n.user_id = v_uid
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object('type', c.consent_type, 'status', c.status,
                                          'policy_version', c.policy_version, 'at', c.occurred_at)
                       order by c.occurred_at desc)
        from public.consent_log c where c.user_id = v_uid
    ), '[]'::jsonb),
    'legal_acceptances', coalesce((
      select jsonb_agg(jsonb_build_object('document', la.document,
                                          'policy_version', la.policy_version, 'at', la.accepted_at)
                       order by la.accepted_at desc)
        from public.legal_acceptances la where la.user_id = v_uid
    ), '[]'::jsonb),
    'blocked_usernames', coalesce((
      select jsonb_agg(bp.username order by bp.username)
        from public.blocks b join public.profiles bp on bp.id = b.blocked_id
       where b.blocker_id = v_uid
    ), '[]'::jsonb),
    'reports_i_filed', coalesce((
      select jsonb_agg(jsonb_build_object('category', r.category, 'status', r.status,
                                          'at', r.created_at)
                       order by r.created_at desc)
        from public.reports r where r.reporter_id = v_uid
    ), '[]'::jsonb),
    'sanctions_applied_to_me', coalesce((
      select jsonb_agg(jsonb_build_object('type', sa.type, 'reason', sa.reason,
                                          'rule_violated', sa.rule_violated,
                                          'starts_at', sa.starts_at, 'ends_at', sa.ends_at,
                                          'revoked_at', sa.revoked_at)
                       order by sa.created_at desc)
        from public.sanctions sa where sa.user_id = v_uid
    ), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object('message', ap.message, 'status', ap.status,
                                          'decision', ap.decision, 'at', ap.created_at)
                       order by ap.created_at desc)
        from public.appeals ap where ap.user_id = v_uid
    ), '[]'::jsonb),
    'privacy_requests', coalesce((
      select jsonb_agg(jsonb_build_object('type', pr.type, 'status', pr.status,
                                          'at', pr.created_at, 'handled_at', pr.handled_at)
                       order by pr.created_at desc)
        from public.privacy_requests pr where pr.user_id = v_uid
    ), '[]'::jsonb),
    'analytics_events', coalesce((
      select jsonb_agg(jsonb_build_object('event', ae.event_name, 'metadata', ae.metadata,
                                          'at', ae.occurred_at)
                       order by ae.occurred_at desc)
        from public.analytics_events ae where ae.user_id = v_uid
    ), '[]'::jsonb),
    'not_included', jsonb_build_array(
      'Donnees de securite et journaux techniques',
      'Signaux anti-fraude',
      'Notes internes de moderation',
      'Donnees personnelles concernant d''autres utilisateurs',
      'Secrets et elements pouvant compromettre la securite du service'
    )
  )
  into v_out
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profile_private pp on pp.user_id = p.id
  left join public.profile_stats  st on st.user_id = p.id
  where p.id = v_uid;

  insert into public.privacy_requests (user_id, type, message, status, handled_at)
  values (v_uid, 'portability', 'Export automatique via l''application', 'completed', now());

  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Suppression de compte (§13 / §34)
-- -----------------------------------------------------------------------------
-- La suppression est REELLE : la ligne auth.users est supprimee, ce qui
-- supprime en cascade le profil, les donnees personnelles, les likes donnes
-- ET recus, les notifications, l'historique et les consentements.
--
-- Ce qui subsiste, et pourquoi :
--   * une ligne dans account_deletions contenant une reference PSEUDONYMISEE
--     (HMAC non reversible), conservee pour la securite et l'anti-fraude ;
--   * les lignes de moderation dont l'auteur etait ce compte, dont
--     l'identifiant est mis a NULL (on ne supprime pas le fait qu'une decision
--     a ete prise, on supprime la personne).
--
-- La duree de conservation applicable n'est PAS decidee ici : voir la politique
-- de confidentialite, ou les durees restent a completer par le responsable du
-- traitement.
create or replace function public.delete_my_account(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_banned boolean;
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  -- Confirmation explicite, en plus des etapes de confirmation de l'interface.
  if upper(coalesce(btrim(p_confirmation), '')) <> 'SUPPRIMER' then
    raise exception 'Confirmation invalide.' using errcode = '22023', hint = 'CONFIRMATION_INVALID';
  end if;

  perform app.enforce_rate_limit('delete_account', 3, interval '1 day');

  select exists (
    select 1 from public.sanctions s
     where s.user_id = v_uid and s.type = 'ban' and s.revoked_at is null
  ) into v_banned;

  insert into public.account_deletions (pseudonymous_ref, had_active_ban, deletion_reason)
  values (app.pseudonymize('user:' || v_uid::text), coalesce(v_banned, false), 'user_request');

  -- Likes donnes : supprimes explicitement pour que les compteurs des
  -- destinataires soient recalcules par le trigger (§13 : « Les likes donnes
  -- par le compte supprime doivent etre supprimes »).
  delete from public.likes where from_user_id = v_uid;

  -- Fichiers : les objets de stockage du dossier de l'utilisateur. Le client
  -- appelle aussi storage.remove() ; ceci est un filet de securite.
  begin
    delete from storage.objects
     where bucket_id in ('avatars', 'covers')
       and (storage.foldername(name))[1] = v_uid::text;
  exception when others then
    null; -- le stockage n'est pas critique pour la suppression du compte
  end;

  -- Sessions : invalidation immediate des jetons de rafraichissement.
  begin
    delete from auth.sessions where user_id = v_uid;
  exception when others then
    null;
  end;

  -- Suppression reelle du compte : cascade sur toutes les tables du projet.
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'note', 'Compte supprime. Le jeton d''acces en cours expire de lui-meme '
            'dans l''heure ; deconnectez-vous pour le revoquer immediatement.'
  );
end;
$$;
