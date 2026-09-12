-- =============================================================================
-- LIKEMM — 05 · Helpers internes (schema `app`, non expose a l'API)
-- =============================================================================
-- Ces fonctions sont utilisees par les RLS et par les fonctions RPC. Elles ne
-- sont PAS appelables depuis le client : `anon` et `authenticated` n'ont aucun
-- droit sur le schema `app`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles (§32 / §34)
-- -----------------------------------------------------------------------------
create or replace function app.current_role_level()
returns integer
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select case coalesce((select r.role from public.user_roles r where r.user_id = auth.uid()), 'user')
           when 'owner'     then 4
           when 'admin'     then 3
           when 'moderator' then 2
           else 1
         end
  where auth.uid() is not null;
$$;

create or replace function app.is_at_least(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select coalesce(app.current_role_level(), 0) >= case p_role
           when 'owner'     then 4
           when 'admin'     then 3
           when 'moderator' then 2
           else 1
         end;
$$;

comment on function app.is_at_least(public.app_role) is
  'Vrai si l''utilisateur courant possede au moins le role demande. Utilise par '
  'les RLS ET par les RPC de moderation : le controle n''est jamais cote UI.';

-- -----------------------------------------------------------------------------
-- Etat du compte courant
-- -----------------------------------------------------------------------------
-- §4 : un compte suspendu, banni ou supprime ne doit pas pouvoir agir.
create or replace function app.current_profile_status()
returns public.profile_status
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select p.status from public.profiles p where p.id = auth.uid();
$$;

create or replace function app.require_active_account()
returns uuid
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_status public.profile_status;
begin
  if v_uid is null then
    raise exception 'Vous devez etre connecte pour effectuer cette action.'
      using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  select status into v_status from public.profiles where id = v_uid;

  if v_status is null then
    raise exception 'Profil introuvable.'
      using errcode = '42501', hint = 'PROFILE_MISSING';
  end if;

  if v_status = 'suspended' then
    raise exception 'Votre compte est temporairement suspendu. Vous pouvez contester cette decision.'
      using errcode = '42501', hint = 'ACCOUNT_SUSPENDED';
  end if;

  if v_status = 'banned' then
    raise exception 'Votre compte est banni. Vous pouvez contester cette decision.'
      using errcode = '42501', hint = 'ACCOUNT_BANNED';
  end if;

  if v_status = 'deleted' then
    raise exception 'Ce compte a ete supprime.'
      using errcode = '42501', hint = 'ACCOUNT_DELETED';
  end if;

  -- Le compte doit etre reellement constitue : username definitif et age
  -- renseigne. Cas typique d'une premiere connexion Google/Apple.
  if not exists (select 1 from public.profiles where id = v_uid and setup_complete) then
    raise exception 'Terminez la creation de votre compte pour continuer.'
      using errcode = '42501', hint = 'SETUP_REQUIRED';
  end if;

  return v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Blocage mutuel (§22)
-- -----------------------------------------------------------------------------
create or replace function app.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1 from public.blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting cote SERVEUR (§27)
-- -----------------------------------------------------------------------------
-- « Ne pas compter uniquement sur JavaScript. » Cette fonction est appelee au
-- debut de chaque RPC sensible. Elle enregistre le coup et leve une exception
-- si le quota de la fenetre est depasse.
create or replace function app.enforce_rate_limit(
  p_action   text,
  p_max_hits integer,
  p_window   interval
)
returns void
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_identity text;
  v_count    integer;
begin
  v_identity := coalesce('user:' || auth.uid()::text, 'anon');

  select count(*) into v_count
    from public.rate_limit_hits
   where identity = v_identity
     and action   = p_action
     and occurred_at > now() - p_window;

  if v_count >= p_max_hits then
    raise exception 'Trop de tentatives. Merci de patienter avant de reessayer.'
      using errcode = '54000', hint = 'RATE_LIMITED';
  end if;

  insert into public.rate_limit_hits (identity, action) values (v_identity, p_action);
end;
$$;

-- Purge des compteurs expires. A planifier (pg_cron) ; appelable par un admin.
create or replace function public.purge_rate_limit_hits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rows integer;
begin
  if not app.is_at_least('admin') then
    raise exception 'Reserve aux administrateurs' using errcode = '42501';
  end if;
  delete from public.rate_limit_hits where occurred_at < now() - interval '7 days';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- -----------------------------------------------------------------------------
-- Empreinte technique de la requete (anti-fraude)
-- -----------------------------------------------------------------------------
-- §29 : l'IP ne doit JAMAIS etre la seule preuve, et §13 (ameliorations) :
-- ne pas collecter inutilement. On ne conserve donc qu'une empreinte HMAC
-- non reversible, utilisee comme simple signal de correlation.
create or replace function app.request_fingerprint()
returns text
language plpgsql
stable
security definer
set search_path = app, extensions, pg_temp
as $$
declare
  v_headers json;
  v_ip      text;
begin
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;

  if v_headers is null then
    return null;
  end if;

  v_ip := split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1);
  if v_ip = '' then
    return null;
  end if;

  return app.pseudonymize('ip:' || btrim(v_ip));
end;
$$;

-- -----------------------------------------------------------------------------
-- Age (§19 / §38 / §43)
-- -----------------------------------------------------------------------------
create or replace function app.compute_age_band(p_birth_date date)
returns public.age_band
language sql
immutable
as $$
  select case
    when p_birth_date is null then null
    when p_birth_date > current_date - interval '15 years' then 'minor_13_14'::public.age_band
    when p_birth_date > current_date - interval '18 years' then 'minor_15_17'::public.age_band
    else 'adult'::public.age_band
  end;
$$;

comment on function app.compute_age_band(date) is
  'Trois tranches : 13-14, 15-17, 18+. La tranche est recalculee a la lecture '
  'par public.get_me() afin de ne pas rester figee au jour de l''inscription.';

-- -----------------------------------------------------------------------------
-- Normalisation et validation d'un username (§5)
-- -----------------------------------------------------------------------------
create or replace function public.normalize_username(p_input text)
returns text
language sql
immutable
as $$
  select nullif(btrim(lower(regexp_replace(coalesce(p_input, ''), '[^A-Za-z0-9_]', '', 'g'))), '');
$$;

-- Retourne NULL si le username est valide, sinon le motif du refus.
create or replace function app.username_rejection_reason(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_pattern text;
begin
  if p_username is null or p_username = '' then
    return 'Le nom d''utilisateur ne peut pas etre vide.';
  end if;
  if char_length(p_username) < 3 then
    return '3 caracteres minimum.';
  end if;
  if char_length(p_username) > 20 then
    return '20 caracteres maximum.';
  end if;
  if p_username <> lower(p_username) or p_username !~ '^[a-z0-9_]+$' then
    return 'Lettres minuscules, chiffres et _ uniquement.';
  end if;
  if p_username ~ '^_' or p_username ~ '_$' then
    return 'Le nom d''utilisateur ne peut pas commencer ni finir par _.';
  end if;
  if p_username ~ '__' then
    return 'Deux _ consecutifs ne sont pas autorises.';
  end if;
  if p_username ~ '^[0-9]+$' then
    return 'Le nom d''utilisateur ne peut pas etre uniquement composee de chiffres.';
  end if;
  if exists (select 1 from public.reserved_usernames r where r.username = p_username) then
    return 'Ce nom d''utilisateur est reserve.';
  end if;
  for v_pattern in select b.pattern from public.username_blocklist b loop
    if p_username ~ v_pattern then
      return 'Ce nom d''utilisateur n''est pas autorise.';
    end if;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helpers utilises PAR LES POLITIQUES RLS
-- -----------------------------------------------------------------------------
-- Ils sont en SECURITY DEFINER a dessein : une sous-requete ecrite directement
-- dans une politique serait elle-meme filtree par la RLS de la table
-- interrogee, ce qui produirait des resultats faux (par exemple un like recu
-- deviendrait invisible parce que son auteur a un profil prive).

-- Le profil est-il listable publiquement (classement, recherche, stats) ?
create or replace function app.profile_is_listable(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user_id
       and p.status = 'active'
       and p.is_private = false
       and p.hidden_by_moderation = false
       and p.setup_complete = true
  ) and not app.is_blocked_between(auth.uid(), p_user_id);
$$;

-- L'utilisateur a-t-il active « masquer mes likes » (§21) ?
create or replace function app.hides_likes(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select coalesce((select p.hide_likes from public.profiles p where p.id = p_user_id), false);
$$;

-- -----------------------------------------------------------------------------
-- Droits sur les helpers
-- -----------------------------------------------------------------------------
-- Une expression de politique RLS est evaluee avec les droits de l'appelant :
-- les fonctions qu'elle utilise doivent donc etre executables par `anon` et
-- `authenticated`, et le schema `app` doit etre traversable. On ouvre donc le
-- STRICT minimum :
--   * USAGE sur le schema (sans aucun droit sur ses tables : app.secrets
--     reste totalement inaccessible) ;
--   * EXECUTE sur les seules fonctions utilisees par les politiques, qui ne
--     renvoient qu'un booleen ou un statut concernant l'appelant lui-meme.
--
-- Le schema `app` n'est de toute facon pas expose par PostgREST : meme une
-- fonction executable ici n'est pas joignable depuis l'API REST.

grant usage on schema app to anon, authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

grant execute on function app.is_at_least(public.app_role)   to anon, authenticated;
grant execute on function app.current_role_level()           to anon, authenticated;
grant execute on function app.current_profile_status()       to anon, authenticated;
grant execute on function app.is_blocked_between(uuid, uuid) to anon, authenticated;
grant execute on function app.profile_is_listable(uuid)      to anon, authenticated;
grant execute on function app.hides_likes(uuid)              to anon, authenticated;

-- Tout le reste (app.pseudonymize, app.enforce_rate_limit,
-- app.request_fingerprint, app.require_active_account,
-- app.username_rejection_reason, app.compute_age_band...) reste appelable
-- uniquement depuis les fonctions SECURITY DEFINER du schema public.
