-- =============================================================================
-- LIKEMM — 02 · Profils, roles, donnees sensibles, statistiques
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — la partie PUBLIQUE du profil, et rien d'autre.
-- -----------------------------------------------------------------------------
-- Aucune donnee sensible ici : ni email, ni date de naissance, ni role, ni
-- donnee technique. Ces informations vivent dans des tables separees, parce
-- que la Row Level Security filtre des lignes et non des colonnes.
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,

  -- §5 : unicite garantie par la BASE, pas par le JavaScript.
  -- Normalisation : minuscules uniquement, 3 a 20 caracteres, [a-z0-9_].
  username            text not null unique
                        check (username = lower(username)
                               and username ~ '^[a-z0-9_]{3,20}$'
                               and username !~ '^_'
                               and username !~ '_$'
                               and username !~ '__'),

  avatar_url          text check (avatar_url is null or char_length(avatar_url) <= 500),
  cover_url           text check (cover_url  is null or char_length(cover_url)  <= 500),
  bio                 text check (bio is null or char_length(bio) <= 160),

  -- Liens externes : [{ "label": "tiktok", "url": "https://..." }, ...]
  -- Le format est verifie par un trigger (5 liens max, https obligatoire).
  external_links      jsonb not null default '[]'::jsonb,

  -- §32 (profil prive) / §19 : les comptes mineurs sont prives par defaut.
  is_private          boolean not null default false,
  -- §21 : masquer la liste des profils que je like. Le like continue de compter.
  hide_likes          boolean not null default false,

  status              public.profile_status not null default 'active',

  -- Deux drapeaux distincts, aux roles differents :
  --   * setup_complete  : le compte est REELLEMENT constitue — username
  --     definitif choisi ET date de naissance renseignee. Tant qu'il est faux,
  --     le profil n'apparait ni au classement ni dans la recherche et le
  --     compte ne peut pas agir. C'est indispensable pour les connexions
  --     Google/Apple, qui ne fournissent ni username ni age.
  --   * profile_completed : l'onboarding produit (§23) a ete parcouru.
  setup_complete      boolean not null default false,
  profile_completed   boolean not null default false,

  -- Trace administrative d'une mesure de moderation masquant le profil (§22).
  hidden_by_moderation boolean not null default false,

  username_changed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is
  'Partie publique du profil. Toute colonne ajoutee ici devient visible par les '
  'autres utilisateurs : les donnees sensibles vont dans profile_private.';

create index if not exists profiles_username_prefix_idx
  on public.profiles (username text_pattern_ops);
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops);
create index if not exists profiles_status_idx
  on public.profiles (status) where status = 'active';
create index if not exists profiles_created_at_idx
  on public.profiles (created_at);
-- Les profils « listables » (classement, recherche) : actifs, publics, non masques.
create index if not exists profiles_listable_idx
  on public.profiles (id)
  where status = 'active' and is_private = false
    and hidden_by_moderation = false and setup_complete = true;

-- -----------------------------------------------------------------------------
-- profile_private — donnees personnelles, lisibles par leur seul proprietaire
-- -----------------------------------------------------------------------------
create table if not exists public.profile_private (
  user_id                   uuid primary key references public.profiles (id) on delete cascade,

  -- §19 / §38 : l'age minimum est 13 ans, verifie a l'inscription.
  -- Nullable uniquement pour le cas Google/Apple, ou le fournisseur ne donne
  -- pas la date de naissance : elle est alors demandee a l'etape suivante, et
  -- le compte ne peut rien faire tant qu'elle manque (setup_complete = false).
  birth_date                date check (birth_date is null or birth_date <= current_date),
  age_band                  public.age_band,

  -- §43 : pour les moins de 15 ans en France, lorsque le consentement est la
  -- base legale, un consentement parental est requis. On stocke le fait qu'il
  -- est requis et la preuve de son recueil — jamais de piece d'identite (§19).
  parental_consent_required boolean not null default false,
  parental_consent_at       timestamptz,
  parental_consent_proof    text,

  -- §3 (ameliorations) : provenance approximative du nouvel utilisateur.
  -- Uniquement des categories et des parametres d'URL, aucune donnee tierce.
  acquisition_channel       text check (acquisition_channel is null or acquisition_channel in
                              ('share', 'social', 'campaign', 'search', 'direct')),
  acquisition_ref           text check (acquisition_ref is null or char_length(acquisition_ref) <= 64),
  acquisition_utm           jsonb not null default '{}'::jsonb,

  -- §20 (parametres) : preferences de notification
  notify_likes              boolean not null default true,
  notify_rank               boolean not null default true,
  notify_email_security     boolean not null default true,
  -- §29 / §46 : les emails marketing sont SEPARES des emails necessaires et
  -- desactives par defaut.
  notify_email_marketing    boolean not null default false,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on column public.profile_private.birth_date is
  'Donnee personnelle. Jamais exposee a un autre utilisateur, jamais envoyee '
  'dans un evenement analytique.';

-- -----------------------------------------------------------------------------
-- user_roles — §32 / §34 : permissions basees sur des roles
-- -----------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       public.app_role not null default 'user',
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);

create index if not exists user_roles_role_idx on public.user_roles (role)
  where role <> 'user';

-- -----------------------------------------------------------------------------
-- profile_stats — compteur derive, reconciliable
-- -----------------------------------------------------------------------------
-- §10 : la source de verite reste la table `likes`. Ce compteur est maintenu
-- par trigger pour la performance et peut etre integralement recalcule
-- (public.recompute_like_counts). Le frontend ne peut PAS l'ecrire.
create table if not exists public.profile_stats (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  likes_total  integer not null default 0 check (likes_total >= 0),
  best_rank    integer check (best_rank is null or best_rank > 0),
  best_rank_at timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists profile_stats_likes_total_idx
  on public.profile_stats (likes_total desc, user_id);

-- -----------------------------------------------------------------------------
-- Regles de nommage — §5 : usernames reserves et termes interdits
-- -----------------------------------------------------------------------------
create table if not exists public.reserved_usernames (
  username text primary key check (username = lower(username)),
  reason   text not null
);

insert into public.reserved_usernames (username, reason) values
  ('admin', 'reserve'), ('administrator', 'reserve'), ('moderator', 'reserve'),
  ('moderation', 'reserve'), ('mod', 'reserve'), ('staff', 'reserve'),
  ('support', 'reserve'), ('help', 'reserve'), ('contact', 'reserve'),
  ('likemm', 'marque'), ('likemmapp', 'marque'), ('likemmofficial', 'marque'),
  ('official', 'usurpation'), ('team', 'reserve'), ('root', 'reserve'),
  ('system', 'reserve'), ('security', 'reserve'), ('legal', 'reserve'),
  ('privacy', 'reserve'), ('api', 'technique'), ('www', 'technique'),
  ('app', 'technique'), ('assets', 'technique'), ('static', 'technique'),
  ('login', 'route'), ('signup', 'route'), ('logout', 'route'),
  ('settings', 'route'), ('notifications', 'route'), ('explorer', 'route'),
  ('leaderboard', 'route'), ('classement', 'route'), ('profile', 'route'),
  ('profil', 'route'), ('admin panel', 'reserve'), ('terms', 'route'),
  ('cgu', 'route'), ('cookies', 'route'), ('report', 'route'),
  ('appeal', 'route'), ('onboarding', 'route'), ('me', 'route'),
  ('null', 'technique'), ('undefined', 'technique'), ('anonymous', 'reserve')
on conflict (username) do nothing;

-- Motifs interdits (usurpation evidente, contenu interdit). `pattern` est une
-- expression POSIX evaluee en minuscules.
create table if not exists public.username_blocklist (
  pattern text primary key,
  reason  text not null
);

insert into public.username_blocklist (pattern, reason) values
  ('(^|_)likemm(_|$)',            'usurpation de la marque'),
  ('^likemm',                     'usurpation de la marque'),
  ('(admin|moderat|support|staff)', 'usurpation d''un compte officiel'),
  ('(^|_)official(_|$)',          'usurpation d''un compte officiel')
on conflict (pattern) do nothing;

-- §6 : limitation anti-abus des changements repetes de username
create table if not exists public.username_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  old_username text not null,
  new_username text not null,
  changed_at   timestamptz not null default now()
);

create index if not exists username_history_user_idx
  on public.username_history (user_id, changed_at desc);

-- -----------------------------------------------------------------------------
-- Validation des liens externes (§6 : TikTok, Instagram, Discord, Snapchat...)
-- -----------------------------------------------------------------------------
create or replace function app.validate_external_links()
returns trigger
language plpgsql
set search_path = app, public, pg_temp
as $$
declare
  v_link jsonb;
  v_url  text;
begin
  if new.external_links is null then
    new.external_links := '[]'::jsonb;
  end if;

  if jsonb_typeof(new.external_links) <> 'array' then
    raise exception 'external_links doit etre un tableau JSON'
      using errcode = '22023';
  end if;

  if jsonb_array_length(new.external_links) > 5 then
    raise exception '5 liens externes maximum'
      using errcode = '22023';
  end if;

  for v_link in select * from jsonb_array_elements(new.external_links) loop
    if jsonb_typeof(v_link) <> 'object' then
      raise exception 'Chaque lien doit etre un objet { label, url }'
        using errcode = '22023';
    end if;

    v_url := v_link ->> 'url';

    if v_url is null or char_length(v_url) > 300 then
      raise exception 'URL de lien externe manquante ou trop longue'
        using errcode = '22023';
    end if;

    -- https uniquement : pas de javascript:, data:, http: en clair.
    if v_url !~* '^https://[a-z0-9.-]+\.[a-z]{2,}(/|$)' then
      raise exception 'Les liens externes doivent commencer par https:// et pointer vers un domaine valide'
        using errcode = '22023';
    end if;

    if char_length(coalesce(v_link ->> 'label', '')) > 30 then
      raise exception 'Libelle de lien trop long (30 caracteres maximum)'
        using errcode = '22023';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_validate_links on public.profiles;
create trigger profiles_validate_links
  before insert or update of external_links on public.profiles
  for each row execute function app.validate_external_links();

-- -----------------------------------------------------------------------------
-- updated_at automatique
-- -----------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

drop trigger if exists profile_private_touch on public.profile_private;
create trigger profile_private_touch before update on public.profile_private
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Historisation + garde-fou sur le changement de username
-- -----------------------------------------------------------------------------
create or replace function app.log_username_change()
returns trigger
language plpgsql
set search_path = app, public, pg_temp
as $$
begin
  if new.username is distinct from old.username then
    insert into public.username_history (user_id, old_username, new_username)
    values (old.id, old.username, new.username);
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_history on public.profiles;
create trigger profiles_username_history
  before update of username on public.profiles
  for each row execute function app.log_username_change();
