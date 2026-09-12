-- =============================================================================
-- LIKEMM — 03 · Likes, compteurs, classements, historique, notifications
-- =============================================================================

-- -----------------------------------------------------------------------------
-- likes — le coeur du produit (§9)
-- -----------------------------------------------------------------------------
-- La contrainte UNIQUE (from_user_id, to_user_id) est la garantie, au niveau de
-- la base, qu'un utilisateur ne peut pas avoir deux likes actifs vers la meme
-- personne. Aucun code applicatif ne peut la contourner.
create table if not exists public.likes (
  id           bigint generated always as identity primary key,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),

  constraint likes_unique_pair unique (from_user_id, to_user_id)
);

-- Le self-like est AUTORISE par le produit (§9 : « un utilisateur peut liker
-- son propre profil »). Il reste soumis aux regles anti-abus generales, donc
-- aucune contrainte ne l'interdit ici.

-- Classement general : likes recus par utilisateur.
create index if not exists likes_to_user_idx
  on public.likes (to_user_id, created_at desc);
-- Classement 24H : fenetre glissante sur les vrais timestamps (§12).
create index if not exists likes_created_at_idx
  on public.likes (created_at desc);
-- Likes donnes : « qui ai-je like », anti-fraude, suppression de compte.
create index if not exists likes_from_user_idx
  on public.likes (from_user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Maintien du compteur derive
-- -----------------------------------------------------------------------------
create or replace function app.sync_like_counter()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profile_stats (user_id, likes_total, updated_at)
    values (new.to_user_id, 1, now())
    on conflict (user_id) do update
      set likes_total = public.profile_stats.likes_total + 1,
          updated_at  = now();
    return new;

  elsif tg_op = 'DELETE' then
    update public.profile_stats
       set likes_total = greatest(0, likes_total - 1),
           updated_at  = now()
     where user_id = old.to_user_id;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists likes_sync_counter on public.likes;
create trigger likes_sync_counter
  after insert or delete on public.likes
  for each row execute function app.sync_like_counter();

-- Reconciliation complete : recalcule tous les compteurs a partir des vrais
-- likes. A appeler apres une operation de masse (suppression de likes
-- frauduleux, suppression de compte) ou en cas de doute.
create or replace function public.recompute_like_counts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  if not app.is_at_least('admin') then
    raise exception 'Reserve aux administrateurs' using errcode = '42501';
  end if;

  with real_counts as (
    select p.id as user_id, count(l.id)::integer as total
      from public.profiles p
      left join public.likes l on l.to_user_id = p.id
     group by p.id
  )
  insert into public.profile_stats (user_id, likes_total, updated_at)
  select user_id, total, now() from real_counts
  on conflict (user_id) do update
    set likes_total = excluded.likes_total,
        updated_at  = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- -----------------------------------------------------------------------------
-- rank_history — §14 : l'historique provient de vraies mesures enregistrees
-- -----------------------------------------------------------------------------
create table if not exists public.rank_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  ranking_type public.ranking_type not null,
  rank         integer not null check (rank > 0),
  likes_count  integer not null check (likes_count >= 0),
  recorded_at  timestamptz not null default now()
);

create index if not exists rank_history_user_idx
  on public.rank_history (user_id, ranking_type, recorded_at desc);
create index if not exists rank_history_recorded_idx
  on public.rank_history (recorded_at desc);

-- -----------------------------------------------------------------------------
-- Cache de classement — §49 : rester performant a grande echelle
-- -----------------------------------------------------------------------------
-- Strategie assumee et documentee :
--   * En dessous de app.live_ranking_threshold() profils actifs, le classement
--     est calcule EN DIRECT a chaque requete : il est donc toujours exact.
--   * Au-dela, la lecture paginee se fait sur ce cache, rafraichi par
--     public.refresh_leaderboards() (a planifier avec pg_cron).
--   * Dans les DEUX cas, le rang personnel de l'utilisateur (get_my_rank) est
--     calcule exactement a la demande : il n'est jamais approxime.
create table if not exists public.leaderboard_cache (
  ranking_type public.ranking_type not null,
  -- `board_position` est le rang d'AFFICHAGE (unique, sans trou) ; `rank` est
  -- le rang affiche a l'utilisateur, qui peut etre partage entre ex aequo
  -- (§13). Les deux sont necessaires : avec des egalites, les valeurs
  -- diffèrent. (« position » est un mot reserve : d'ou le prefixe.)
  board_position integer not null check (board_position > 0),
  rank         integer not null check (rank > 0),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  likes_count  integer not null check (likes_count >= 0),
  refreshed_at timestamptz not null default now(),
  primary key (ranking_type, board_position),
  constraint leaderboard_cache_one_row_per_user unique (ranking_type, user_id)
);

create or replace function app.live_ranking_threshold()
returns integer
language sql
immutable
as $$ select 20000; $$;

comment on function app.live_ranking_threshold() is
  'Nombre de profils actifs en dessous duquel le classement est calcule en '
  'direct. Au-dela, la lecture paginee passe par leaderboard_cache.';

-- -----------------------------------------------------------------------------
-- notifications — §19 (V1) : chaque notification vient d'un evenement reel
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         public.notification_type not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  -- §10 / §21 : si l'auteur du like a active « masquer mes likes », son
  -- identite n'est pas revelee. Le like continue de compter normalement.
  actor_hidden boolean not null default false,
  payload      jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

-- Notification de like : declenchee par l'insertion reelle du like.
create or replace function app.notify_like_received()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_wants_notif boolean;
  v_hidden      boolean;
begin
  -- Pas de notification pour un self-like : il n'y a personne a prevenir.
  if new.from_user_id = new.to_user_id then
    return new;
  end if;

  select coalesce(pp.notify_likes, true) into v_wants_notif
    from public.profile_private pp
   where pp.user_id = new.to_user_id;

  if v_wants_notif is not true then
    return new;
  end if;

  select coalesce(p.hide_likes, false) into v_hidden
    from public.profiles p
   where p.id = new.from_user_id;

  insert into public.notifications (user_id, type, actor_id, actor_hidden, payload)
  values (
    new.to_user_id,
    'like_received',
    new.from_user_id,
    coalesce(v_hidden, false),
    jsonb_build_object('like_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists likes_notify on public.likes;
create trigger likes_notify
  after insert on public.likes
  for each row execute function app.notify_like_received();
