-- =============================================================================
-- LIKEMM — 07 · Fonctions metier (RPC)
-- =============================================================================
-- Toute operation sensible passe par ici. Chaque fonction re-verifie, cote
-- serveur : l'authentification, l'etat du compte, les blocages, les quotas.
-- Le frontend ne fait que presenter le resultat — il n'est jamais la source de
-- la securite (§44).
--
-- Convention d'erreur : le message est en francais et lisible par l'utilisateur,
-- et le champ HINT porte un code machine stable (AUTH_REQUIRED, RATE_LIMITED,
-- ALREADY_LIKED...) que le frontend traduit en message contextualise.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Inscription — trigger sur auth.users
-- -----------------------------------------------------------------------------
-- L'unicite du username est garantie par la contrainte UNIQUE de la table
-- (§5 : « ne jamais utiliser uniquement une verification JavaScript »). Une
-- course entre deux inscriptions simultanees se solde donc par un echec propre.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username    text;
  v_birth_date  date;
  v_age_band    public.age_band;
  v_reason      text;
  v_setup       boolean := false;
  v_policy      text := nullif(v_meta ->> 'policy_version', '');
  v_channel     text := nullif(v_meta ->> 'acquisition_channel', '');
  v_ref         text := nullif(v_meta ->> 'acquisition_ref', '');
  v_utm         jsonb := coalesce(v_meta -> 'acquisition_utm', '{}'::jsonb);
begin
  -- --- username -------------------------------------------------------------
  v_username := public.normalize_username(v_meta ->> 'username');

  if v_username is not null then
    v_reason := app.username_rejection_reason(v_username);
    if v_reason is not null then
      raise exception 'Nom d''utilisateur refuse : %', v_reason
        using errcode = '22023', hint = 'USERNAME_INVALID';
    end if;
  else
    -- Connexion Google / Apple : aucun username fourni. On pose un identifiant
    -- provisoire non devinable et le compte reste inactif (setup_complete =
    -- false) jusqu'a ce que l'utilisateur choisisse son vrai username.
    v_username := 'new_' || encode(extensions.gen_random_bytes(5), 'hex');
  end if;

  -- --- date de naissance ----------------------------------------------------
  begin
    v_birth_date := nullif(v_meta ->> 'birth_date', '')::date;
  exception when others then
    raise exception 'Date de naissance invalide.'
      using errcode = '22023', hint = 'BIRTHDATE_INVALID';
  end;

  if v_birth_date is not null then
    if v_birth_date > current_date then
      raise exception 'Date de naissance invalide.'
        using errcode = '22023', hint = 'BIRTHDATE_INVALID';
    end if;

    -- §19 / §38 : age minimum 13 ans. Refus net, sans compte cree.
    if v_birth_date > current_date - interval '13 years' then
      raise exception 'Likemm est accessible a partir de 13 ans.'
        using errcode = '22023', hint = 'AGE_TOO_YOUNG';
    end if;

    v_age_band := app.compute_age_band(v_birth_date);
    v_setup := v_meta ? 'username';
  end if;

  -- --- profil public --------------------------------------------------------
  begin
    insert into public.profiles (id, username, setup_complete, is_private)
    values (
      new.id,
      v_username,
      v_setup,
      -- §19 / §43 : un compte mineur est prive par defaut. Protection par
      -- defaut, modifiable ensuite en connaissance de cause.
      coalesce(v_age_band <> 'adult', false)
    );
  exception when unique_violation then
    raise exception 'Ce nom d''utilisateur est deja pris.'
      using errcode = '23505', hint = 'USERNAME_TAKEN';
  end;

  -- --- donnees personnelles -------------------------------------------------
  insert into public.profile_private (
    user_id, birth_date, age_band, parental_consent_required,
    acquisition_channel, acquisition_ref, acquisition_utm
  )
  values (
    new.id, v_birth_date, v_age_band,
    -- §43 : le consentement parental est requis pour les moins de 15 ans
    -- lorsque le consentement est la base legale du traitement.
    coalesce(v_age_band = 'minor_13_14', false),
    case when v_channel in ('share', 'social', 'campaign', 'search', 'direct') then v_channel else null end,
    v_ref,
    case when jsonb_typeof(v_utm) = 'object' then v_utm else '{}'::jsonb end
  );

  insert into public.user_roles (user_id, role) values (new.id, 'user');
  insert into public.profile_stats (user_id, likes_total) values (new.id, 0);

  -- §39 : quelle version des documents s'appliquait a l'acceptation.
  if v_policy is not null then
    insert into public.legal_acceptances (user_id, document, policy_version)
    values (new.id, 'terms', v_policy), (new.id, 'privacy', v_policy);
  end if;

  -- §17 / §37 : aucun consentement facultatif n'est presume accorde.
  insert into public.consents (user_id, consent_type, status, policy_version)
  select new.id, t, 'denied', coalesce(v_policy, 'unversioned')
    from unnest(enum_range(null::public.consent_type)) as t;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Username : verification et changement (§5 / §6)
-- -----------------------------------------------------------------------------
create or replace function public.check_username(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_norm   text := public.normalize_username(p_username);
  v_reason text;
begin
  v_reason := app.username_rejection_reason(v_norm);
  if v_reason is not null then
    return jsonb_build_object('normalized', v_norm, 'available', false, 'reason', v_reason);
  end if;

  if exists (select 1 from public.profiles where username = v_norm and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)) then
    return jsonb_build_object('normalized', v_norm, 'available', false,
                              'reason', 'Ce nom d''utilisateur est deja pris.');
  end if;

  return jsonb_build_object('normalized', v_norm, 'available', true, 'reason', null);
end;
$$;

comment on function public.check_username(text) is
  'Retour indicatif pour l''interface. La garantie d''unicite reste la '
  'contrainte UNIQUE de la table profiles.';

-- Finalisation du compte : cas Google/Apple, ou compte sans age renseigne.
create or replace function public.complete_signup(
  p_username       text,
  p_birth_date     date,
  p_policy_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_norm     text := public.normalize_username(p_username);
  v_reason   text;
  v_age_band public.age_band;
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte.' using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and setup_complete) then
    raise exception 'Votre compte est deja finalise.' using errcode = '22023', hint = 'ALREADY_SETUP';
  end if;

  perform app.enforce_rate_limit('complete_signup', 10, interval '1 hour');

  v_reason := app.username_rejection_reason(v_norm);
  if v_reason is not null then
    raise exception 'Nom d''utilisateur refuse : %', v_reason
      using errcode = '22023', hint = 'USERNAME_INVALID';
  end if;

  if p_birth_date is null or p_birth_date > current_date then
    raise exception 'Date de naissance invalide.' using errcode = '22023', hint = 'BIRTHDATE_INVALID';
  end if;

  if p_birth_date > current_date - interval '13 years' then
    raise exception 'Likemm est accessible a partir de 13 ans.'
      using errcode = '22023', hint = 'AGE_TOO_YOUNG';
  end if;

  v_age_band := app.compute_age_band(p_birth_date);

  begin
    update public.profiles
       set username       = v_norm,
           setup_complete = true,
           is_private     = (v_age_band <> 'adult')
     where id = v_uid;
  exception when unique_violation then
    raise exception 'Ce nom d''utilisateur est deja pris.'
      using errcode = '23505', hint = 'USERNAME_TAKEN';
  end;

  update public.profile_private
     set birth_date                = p_birth_date,
         age_band                  = v_age_band,
         parental_consent_required = (v_age_band = 'minor_13_14')
   where user_id = v_uid;

  if p_policy_version is not null then
    insert into public.legal_acceptances (user_id, document, policy_version)
    values (v_uid, 'terms', p_policy_version), (v_uid, 'privacy', p_policy_version);
  end if;

  return jsonb_build_object('ok', true, 'username', v_norm);
end;
$$;

-- §6 : « Prevoir une limitation anti-abus concernant les changements repetes
-- de username. » Deux changements par periode de 30 jours.
create or replace function public.update_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := app.require_active_account();
  v_norm    text := public.normalize_username(p_username);
  v_reason  text;
  v_recent  integer;
  v_current text;
begin
  select username into v_current from public.profiles where id = v_uid;

  if v_norm = v_current then
    return jsonb_build_object('ok', true, 'username', v_current, 'unchanged', true);
  end if;

  perform app.enforce_rate_limit('update_username', 5, interval '1 hour');

  select count(*) into v_recent
    from public.username_history
   where user_id = v_uid and changed_at > now() - interval '30 days';

  if v_recent >= 2 then
    raise exception 'Vous avez deja change de nom d''utilisateur deux fois ce mois-ci. Reessayez plus tard.'
      using errcode = '54000', hint = 'USERNAME_CHANGE_LIMIT';
  end if;

  v_reason := app.username_rejection_reason(v_norm);
  if v_reason is not null then
    raise exception 'Nom d''utilisateur refuse : %', v_reason
      using errcode = '22023', hint = 'USERNAME_INVALID';
  end if;

  begin
    update public.profiles set username = v_norm where id = v_uid;
  exception when unique_violation then
    raise exception 'Ce nom d''utilisateur est deja pris.'
      using errcode = '23505', hint = 'USERNAME_TAKEN';
  end;

  return jsonb_build_object('ok', true, 'username', v_norm);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Mon compte
-- -----------------------------------------------------------------------------
create or replace function public.get_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select jsonb_build_object(
    'id',                p.id,
    'username',          p.username,
    'avatar_url',        p.avatar_url,
    'cover_url',         p.cover_url,
    'bio',               p.bio,
    'external_links',    p.external_links,
    'is_private',        p.is_private,
    'hide_likes',        p.hide_likes,
    'status',            p.status,
    'setup_complete',    p.setup_complete,
    'profile_completed', p.profile_completed,
    'created_at',        p.created_at,
    'username_changed_at', p.username_changed_at,
    'role',              coalesce(r.role, 'user'),
    'likes_total',       coalesce(s.likes_total, 0),
    'best_rank',         s.best_rank,
    'birth_date',        pp.birth_date,
    -- La tranche d'age est RECALCULEE a la lecture : un compte cree a 14 ans
    -- ne doit pas rester traite comme un mineur de 13-14 ans a 16 ans.
    'age_band',          app.compute_age_band(pp.birth_date),
    'is_minor',          case when pp.birth_date is null then null
                              else app.compute_age_band(pp.birth_date) <> 'adult' end,
    'parental_consent_required', pp.parental_consent_required,
    'parental_consent_at',       pp.parental_consent_at,
    'notify_likes',              pp.notify_likes,
    'notify_rank',               pp.notify_rank,
    'notify_email_security',     pp.notify_email_security,
    'notify_email_marketing',    pp.notify_email_marketing,
    'consents', coalesce((
      select jsonb_object_agg(c.consent_type, jsonb_build_object(
               'status', c.status, 'policy_version', c.policy_version, 'updated_at', c.updated_at))
        from public.consents c where c.user_id = v_uid
    ), '{}'::jsonb),
    'active_sanctions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sa.id, 'type', sa.type, 'reason', sa.reason,
               'rule_violated', sa.rule_violated, 'starts_at', sa.starts_at,
               'ends_at', sa.ends_at, 'appealable', sa.appealable,
               'appeal_status', (select ap.status from public.appeals ap where ap.sanction_id = sa.id))
               order by sa.created_at desc)
        from public.sanctions sa
       where sa.user_id = v_uid
         and sa.revoked_at is null
         and (sa.ends_at is null or sa.ends_at > now())
         and sa.type in ('suspension', 'ban', 'limit', 'warning')
    ), '[]'::jsonb),
    'unread_notifications', (
      select count(*) from public.notifications n where n.user_id = v_uid and n.read_at is null
    )
  )
  into v_out
  from public.profiles p
  left join public.user_roles     r  on r.user_id  = p.id
  left join public.profile_stats  s  on s.user_id  = p.id
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = v_uid;

  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Profil public (§7 / §8 / §32)
-- -----------------------------------------------------------------------------
-- Un visiteur non connecte voit les informations publiques autorisees, et rien
-- de plus. Un profil prive n'est accessible qu'avec un token d'invitation
-- valide — le controle est fait ICI, cote serveur, jamais en masquant du
-- contenu avec du CSS.
create or replace function public.get_public_profile(
  p_username     text,
  p_invite_token text default null
)
returns jsonb
language plpgsql
-- VOLATILE a dessein : la consultation d'un profil prive via un lien
-- d'invitation met a jour les compteurs d'usage de ce lien.
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_norm       text := public.normalize_username(p_username);
  v_p          record;
  v_token_ok   boolean := false;
  v_blocked    boolean := false;
begin
  if v_norm is null then
    return jsonb_build_object('found', false, 'reason', 'not_found');
  end if;

  select p.*, coalesce(s.likes_total, 0) as likes_total, s.best_rank,
         pp.age_band
    into v_p
    from public.profiles p
    left join public.profile_stats   s  on s.user_id  = p.id
    left join public.profile_private pp on pp.user_id = p.id
   where p.username = v_norm;

  if v_p.id is null then
    return jsonb_build_object('found', false, 'reason', 'not_found');
  end if;

  -- §40 : un profil supprime a un comportement propre, pas une page cassee.
  if v_p.status = 'deleted' then
    return jsonb_build_object('found', false, 'reason', 'deleted');
  end if;

  if v_p.status in ('suspended', 'banned')
     and v_p.id is distinct from v_uid and not app.is_at_least('moderator') then
    return jsonb_build_object('found', false, 'reason', 'unavailable');
  end if;

  if v_p.hidden_by_moderation
     and v_p.id is distinct from v_uid and not app.is_at_least('moderator') then
    return jsonb_build_object('found', false, 'reason', 'unavailable');
  end if;

  if not v_p.setup_complete
     and v_p.id is distinct from v_uid and not app.is_at_least('moderator') then
    return jsonb_build_object('found', false, 'reason', 'not_found');
  end if;

  v_blocked := app.is_blocked_between(v_uid, v_p.id);
  if v_blocked and not app.is_at_least('moderator') then
    return jsonb_build_object('found', false, 'reason', 'blocked');
  end if;

  -- Profil prive : token d'invitation obligatoire (§32).
  if v_p.is_private
     and v_p.id is distinct from v_uid and not app.is_at_least('moderator') then
    if p_invite_token is not null then
      select true into v_token_ok
        from public.private_profile_links l
       where l.user_id    = v_p.id
         and l.token_hash = encode(extensions.digest(p_invite_token, 'sha256'), 'hex')
         and l.revoked_at is null
         and (l.expires_at is null or l.expires_at > now())
       limit 1;

      if coalesce(v_token_ok, false) then
        update public.private_profile_links
           set last_used_at = now(), use_count = use_count + 1
         where user_id = v_p.id
           and token_hash = encode(extensions.digest(p_invite_token, 'sha256'), 'hex');
      end if;
    end if;

    if not coalesce(v_token_ok, false) then
      return jsonb_build_object(
        'found', true, 'private', true, 'username', v_p.username,
        'reason', 'private'
      );
    end if;
  end if;

  return jsonb_build_object(
    'found',          true,
    'private',        v_p.is_private,
    'id',             v_p.id,
    'username',       v_p.username,
    'avatar_url',     v_p.avatar_url,
    'cover_url',      v_p.cover_url,
    'bio',            v_p.bio,
    'external_links', v_p.external_links,
    'created_at',     v_p.created_at,
    'likes_total',    v_p.likes_total,
    'likes_24h',      (select count(*) from public.likes l
                        where l.to_user_id = v_p.id and l.created_at > now() - interval '24 hours'),
    'rank',           public.rank_of(v_p.id, 'general'),
    'best_rank',      v_p.best_rank,
    'is_me',          (v_p.id is not distinct from v_uid),
    'liked_by_me',    (v_uid is not null and exists (
                        select 1 from public.likes l
                         where l.from_user_id = v_uid and l.to_user_id = v_p.id)),
    -- §8 : un visiteur non connecte ne peut pas interagir. L'interface l'invite
    -- a creer un compte ; la RPC like_user refuserait de toute facon.
    'can_interact',   (v_uid is not null),
    'listed',         (v_p.status = 'active' and not v_p.is_private
                       and not v_p.hidden_by_moderation and v_p.setup_complete)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Classements (§11 / §12 / §13 / §49)
-- -----------------------------------------------------------------------------
-- Ensemble classe : profils ACTIFS, PUBLICS, non masques par la moderation et
-- completement constitues.
--
-- Choix assume et visible dans l'interface : un profil PRIVE n'apparait pas au
-- classement et ne s'y voit pas attribuer un rang fantome. get_my_rank renvoie
-- alors la raison `profile_private`, que l'ecran affiche telle quelle. Aucun
-- rang, aucun nombre, aucune ligne n'est inventee pour remplir l'ecran.
--
-- Egalites (§13) : `rank` est calcule sur le seul nombre de likes, donc
-- #1, #2, #2, #4. L'ORDRE d'affichage entre ex aequo est departage par
-- created_at puis id : il est stable et deterministe d'un rafraichissement a
-- l'autre. `position` est ce rang d'affichage, unique et sans trou.
--
-- Le blocage (§22) empeche les interactions entre deux comptes mais ne retire
-- personne du classement : un classement public doit rester le meme pour tous.

create or replace function app.listable_count()
returns integer
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select count(*)::integer from public.profiles
   where status = 'active' and is_private = false
     and hidden_by_moderation = false and setup_complete = true;
$$;

-- Rang EXACT, calcule a la demande par comptage indexe (pas de tri complet).
create or replace function app.exact_rank(
  p_user_id uuid,
  p_type    public.ranking_type
)
returns table (board_position integer, rank integer, likes_count integer)
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_listable boolean;
  v_created  timestamptz;
  v_likes    integer;
begin
  select (p.status = 'active' and p.is_private = false
          and p.hidden_by_moderation = false and p.setup_complete = true),
         p.created_at
    into v_listable, v_created
    from public.profiles p where p.id = p_user_id;

  if not coalesce(v_listable, false) then
    return;
  end if;

  if p_type = 'general' then
    select coalesce(s.likes_total, 0) into v_likes
      from public.profile_stats s where s.user_id = p_user_id;
    v_likes := coalesce(v_likes, 0);

    return query
    with board as (
      select p.id, p.created_at, coalesce(s.likes_total, 0) as lc
        from public.profiles p
        join public.profile_stats s on s.user_id = p.id
       where p.status = 'active' and p.is_private = false
         and p.hidden_by_moderation = false and p.setup_complete = true
    )
    select (1 + count(*) filter (
              where b.lc > v_likes
                 or (b.lc = v_likes and (b.created_at, b.id) < (v_created, p_user_id))
            ))::integer,
           (1 + count(*) filter (where b.lc > v_likes))::integer,
           v_likes
      from board b;
  else
    -- §12 : calcule a partir des VRAIS timestamps, fenetre glissante de 24 h.
    select count(*)::integer into v_likes
      from public.likes l
     where l.to_user_id = p_user_id and l.created_at > now() - interval '24 hours';

    if coalesce(v_likes, 0) = 0 then
      return;
    end if;

    return query
    with windowed as (
      select l.to_user_id as id, count(*)::integer as lc
        from public.likes l
       where l.created_at > now() - interval '24 hours'
       group by l.to_user_id
    ),
    board as (
      select w.id, p.created_at, w.lc
        from windowed w
        join public.profiles p on p.id = w.id
       where p.status = 'active' and p.is_private = false
         and p.hidden_by_moderation = false and p.setup_complete = true
    )
    select (1 + count(*) filter (
              where b.lc > v_likes
                 or (b.lc = v_likes and (b.created_at, b.id) < (v_created, p_user_id))
            ))::integer,
           (1 + count(*) filter (where b.lc > v_likes))::integer,
           v_likes
      from board b;
  end if;
end;
$$;

-- Rang d'un utilisateur pour AFFICHAGE (recherche, fiche profil).
-- Exact tant que la volumetrie le permet, puis lu dans le cache.
create or replace function public.rank_of(
  p_user_id uuid,
  p_type    public.ranking_type default 'general'
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_rank integer;
begin
  if p_user_id is null then
    return null;
  end if;

  if app.listable_count() <= app.live_ranking_threshold() then
    select t.rank into v_rank from app.exact_rank(p_user_id, p_type) t;
  else
    select c.rank into v_rank
      from public.leaderboard_cache c
     where c.ranking_type = p_type and c.user_id = p_user_id;
  end if;

  return v_rank;
end;
$$;

-- Mon rang — TOUJOURS exact, jamais lu dans le cache.
create or replace function public.get_my_rank(p_type public.ranking_type default 'general')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p   record;
  v_t   record;
begin
  if v_uid is null then
    return jsonb_build_object('rank', null, 'reason', 'not_authenticated');
  end if;

  select status, is_private, hidden_by_moderation, setup_complete
    into v_p from public.profiles where id = v_uid;

  if v_p.status is null then
    return jsonb_build_object('rank', null, 'reason', 'profile_missing');
  end if;
  if not v_p.setup_complete then
    return jsonb_build_object('rank', null, 'reason', 'setup_incomplete');
  end if;
  if v_p.status <> 'active' then
    return jsonb_build_object('rank', null, 'reason', 'account_' || v_p.status::text);
  end if;
  if v_p.is_private then
    return jsonb_build_object('rank', null, 'reason', 'profile_private');
  end if;
  if v_p.hidden_by_moderation then
    return jsonb_build_object('rank', null, 'reason', 'profile_hidden');
  end if;

  select * into v_t from app.exact_rank(v_uid, p_type);

  if v_t.rank is null then
    return jsonb_build_object(
      'rank', null, 'likes_count', 0,
      'reason', case when p_type = 'h24' then 'no_likes_24h' else 'not_ranked' end
    );
  end if;

  return jsonb_build_object(
    'rank',         v_t.rank,
    'position',     v_t.board_position,
    'likes_count',  v_t.likes_count,
    'total_ranked', app.listable_count(),
    'reason',       null
  );
end;
$$;

-- §10 (ameliorations) : « Tu es #284. Il te manque 12 likes pour depasser
-- #283. » Calcule sur les vraies donnees ; renvoie NULL quand l'information
-- n'existe pas (premier du classement, ou personne au-dessus).
create or replace function public.get_rank_context(p_type public.ranking_type default 'general')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_self     jsonb := public.get_my_rank(p_type);
  v_my_rank  integer := (v_self ->> 'rank')::integer;
  v_my_likes integer := coalesce((v_self ->> 'likes_count')::integer, 0);
  v_above    record;
begin
  if v_my_rank is null then
    return v_self;
  end if;

  if p_type = 'general' then
    select p.id, p.username, p.avatar_url, s.likes_total as likes
      into v_above
      from public.profile_stats s
      join public.profiles p on p.id = s.user_id
     where p.status = 'active' and p.is_private = false
       and p.hidden_by_moderation = false and p.setup_complete = true
       and s.likes_total > v_my_likes
     order by s.likes_total asc, p.created_at asc, p.id asc
     limit 1;
  else
    select p.id, p.username, p.avatar_url, t.c as likes
      into v_above
      from (
        select l.to_user_id, count(*)::integer as c
          from public.likes l
         where l.created_at > now() - interval '24 hours'
         group by l.to_user_id
      ) t
      join public.profiles p on p.id = t.to_user_id
     where p.status = 'active' and p.is_private = false
       and p.hidden_by_moderation = false and p.setup_complete = true
       and t.c > v_my_likes
     order by t.c asc, p.created_at asc, p.id asc
     limit 1;
  end if;

  if v_above.id is null then
    return v_self || jsonb_build_object('above', null, 'likes_to_pass', null);
  end if;

  return v_self || jsonb_build_object(
    'above', jsonb_build_object(
      'username',    v_above.username,
      'avatar_url',  v_above.avatar_url,
      'rank',        public.rank_of(v_above.id, p_type),
      'likes_count', v_above.likes
    ),
    -- Depasser = avoir STRICTEMENT plus de likes ; les ex aequo partagent le
    -- meme rang (§13).
    'likes_to_pass', greatest(1, v_above.likes - v_my_likes + 1)
  );
end;
$$;

create or replace function public.get_leaderboard(
  p_type   public.ranking_type default 'general',
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  board_position integer,
  rank        integer,
  user_id     uuid,
  username    text,
  avatar_url  text,
  bio         text,
  likes_count integer,
  is_me       boolean,
  liked_by_me boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
begin
  -- §49 : sous le seuil, calcul EN DIRECT (donc exact a la seconde) ; au-dela,
  -- lecture du cache rafraichi par public.refresh_leaderboards().
  if app.listable_count() <= app.live_ranking_threshold() then
    if p_type = 'general' then
      return query
      with ranked as (
        select p.id, p.username, p.avatar_url, p.bio,
               coalesce(s.likes_total, 0) as lc,
               rank()       over (order by coalesce(s.likes_total, 0) desc) as rk,
               row_number() over (order by coalesce(s.likes_total, 0) desc,
                                           p.created_at asc, p.id asc)      as pos
          from public.profiles p
          join public.profile_stats s on s.user_id = p.id
         where p.status = 'active' and p.is_private = false
           and p.hidden_by_moderation = false and p.setup_complete = true
      )
      select r.pos::integer, r.rk::integer, r.id, r.username, r.avatar_url, r.bio,
             r.lc::integer,
             (r.id is not distinct from v_uid),
             (v_uid is not null and exists (
                select 1 from public.likes l
                 where l.from_user_id = v_uid and l.to_user_id = r.id))
        from ranked r
       where r.pos > v_off and r.pos <= v_off + v_limit
       order by r.pos asc;
    else
      return query
      with windowed as (
        select l.to_user_id as id, count(*)::integer as lc
          from public.likes l
         where l.created_at > now() - interval '24 hours'
         group by l.to_user_id
      ),
      ranked as (
        select p.id, p.username, p.avatar_url, p.bio, w.lc,
               rank()       over (order by w.lc desc) as rk,
               row_number() over (order by w.lc desc, p.created_at asc, p.id asc) as pos
          from windowed w
          join public.profiles p on p.id = w.id
         where p.status = 'active' and p.is_private = false
           and p.hidden_by_moderation = false and p.setup_complete = true
      )
      select r.pos::integer, r.rk::integer, r.id, r.username, r.avatar_url, r.bio,
             r.lc,
             (r.id is not distinct from v_uid),
             (v_uid is not null and exists (
                select 1 from public.likes l
                 where l.from_user_id = v_uid and l.to_user_id = r.id))
        from ranked r
       where r.pos > v_off and r.pos <= v_off + v_limit
       order by r.pos asc;
    end if;
  else
    return query
    select c.board_position, c.rank, p.id, p.username, p.avatar_url, p.bio, c.likes_count,
           (p.id is not distinct from v_uid),
           (v_uid is not null and exists (
              select 1 from public.likes l
               where l.from_user_id = v_uid and l.to_user_id = p.id))
      from public.leaderboard_cache c
      join public.profiles p on p.id = c.user_id
     where c.ranking_type = p_type
       and p.status = 'active' and p.is_private = false
       and p.hidden_by_moderation = false and p.setup_complete = true
     order by c.board_position asc
     offset v_off limit v_limit;
  end if;
end;
$$;

-- Voisins immediats au classement : alimente la carte « votre position ».
create or replace function public.get_rank_neighbors(
  p_type  public.ranking_type default 'general',
  p_range integer default 1
)
returns table (
  board_position integer, rank integer, user_id uuid, username text,
  avatar_url text, likes_count integer, is_me boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pos integer;
  v_r   integer := least(greatest(coalesce(p_range, 1), 1), 5);
begin
  if v_uid is null then
    return;
  end if;

  if app.listable_count() <= app.live_ranking_threshold() then
    select t.board_position into v_pos from app.exact_rank(v_uid, p_type) t;
  else
    select c.board_position into v_pos
      from public.leaderboard_cache c
     where c.ranking_type = p_type and c.user_id = v_uid;
  end if;

  if v_pos is null then
    return;
  end if;

  return query
  select b.board_position, b.rank, b.user_id, b.username, b.avatar_url, b.likes_count, b.is_me
    from public.get_leaderboard(p_type, 2 * v_r + 1, greatest(0, v_pos - v_r - 1)) b;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Recherche (§15)
-- -----------------------------------------------------------------------------
-- Requete ciblee cote base, paginee, jamais un chargement complet de la table.
-- Les profils prives, masques par la moderation, suspendus, bannis, supprimes,
-- non finalises et bloques sont exclus.
create or replace function public.search_profiles(
  p_query  text,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid, username text, avatar_url text, bio text,
  likes_count integer, rank integer, liked_by_me boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_q     text := nullif(btrim(lower(regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9_]', '', 'g'))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_q is null then
    return;
  end if;

  return query
  select p.id, p.username, p.avatar_url, p.bio,
         coalesce(s.likes_total, 0)::integer,
         public.rank_of(p.id, 'general'),
         (v_uid is not null and exists (
            select 1 from public.likes l
             where l.from_user_id = v_uid and l.to_user_id = p.id))
    from public.profiles p
    left join public.profile_stats s on s.user_id = p.id
   where p.status = 'active'
     and p.is_private = false
     and p.hidden_by_moderation = false
     and p.setup_complete = true
     and not app.is_blocked_between(v_uid, p.id)
     and p.username like '%' || v_q || '%'
   order by
     (p.username = v_q) desc,
     (p.username like v_q || '%') desc,
     coalesce(s.likes_total, 0) desc,
     p.username asc
   offset v_off limit v_limit;
end;
$$;
