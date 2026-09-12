-- =============================================================================
-- LIKEMM — harnais de test LOCAL
-- =============================================================================
-- Ce fichier n'est PAS une migration et ne doit JAMAIS etre execute sur le
-- projet Supabase. Il recree, sur un PostgreSQL nu, le strict minimum fourni
-- par Supabase (roles, schema auth, schema storage, auth.uid()) afin de pouvoir
-- executer les migrations et les tests hors ligne :
--
--   createdb likemm_test
--   psql likemm_test -f supabase/tests/00_local_stubs.sql
--   for f in supabase/migrations/*.sql; do psql likemm_test -v ON_ERROR_STOP=1 -f "$f"; done
--   psql likemm_test -v ON_ERROR_STOP=1 -f supabase/tests/10_security_tests.sql
--
-- Sur Supabase, ces objets existent deja et sont geres par la plateforme.
-- =============================================================================

-- Roles utilises par PostgREST.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

-- --- auth ---------------------------------------------------------------------
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create table if not exists auth.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- auth.uid() lit la revendication `sub` du JWT. En local, on simule le JWT avec
-- le parametre de session `request.jwt.claims`, exactement comme PostgREST.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), 'anon');
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;

-- --- storage ------------------------------------------------------------------
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id) on delete cascade,
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 1)];
$$;

grant usage on schema storage to anon, authenticated;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;

-- --- aide de test : se faire passer pour un utilisateur ----------------------
create or replace function public.test_login(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
                     false);
  execute 'set role authenticated';
end;
$$;

create or replace function public.test_logout()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end;
$$;

create or replace function public.test_admin()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
end;
$$;

grant execute on function public.test_login(uuid) to anon, authenticated;
grant execute on function public.test_logout()   to anon, authenticated;
grant execute on function public.test_admin()    to anon, authenticated;
