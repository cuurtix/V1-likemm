-- =============================================================================
-- LIKEMM — 01 · Extensions, schema interne et types
-- =============================================================================
-- Principes appliques dans toute la base :
--   * `public` ne contient QUE ce qui doit etre joignable par l'API (PostgREST).
--   * `app` est un schema interne, non expose a l'API : aucun role client n'y a
--     le moindre droit. Il contient les helpers et les secrets techniques.
--   * Les donnees sensibles sont isolees dans des tables dediees, car les RLS
--     de PostgreSQL filtrent des LIGNES, pas des COLONNES : mettre la date de
--     naissance dans `profiles` reviendrait a l'exposer avec le profil public.
-- =============================================================================

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Schema interne. Volontairement non ajoute a la search_path de l'API.
create schema if not exists app;

revoke all on schema app from public;
revoke all on schema app from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.profile_status as enum ('active', 'suspended', 'banned', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  -- §32 / §34 du cahier des charges : permissions basees sur des roles.
  create type public.app_role as enum ('user', 'moderator', 'admin', 'owner');
exception when duplicate_object then null; end $$;

do $$ begin
  -- §19 / §38 : trois tranches d'age, car le droit applicable differe.
  create type public.age_band as enum ('minor_13_14', 'minor_15_17', 'adult');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ranking_type as enum ('general', 'h24');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Chaque type correspond a un evenement REEL du produit. Aucun type
  -- decoratif : une notification ne peut pas exister sans son evenement.
  create type public.notification_type as enum (
    'like_received',      -- quelqu'un vous a like
    'rank_up',            -- votre classement a progresse
    'overtaken',          -- quelqu'un vous a depasse
    'milestone_top'       -- entree dans un palier (Top 100, Top 10...)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_category as enum (
    'photo', 'profile', 'username', 'bio', 'behavior', 'impersonation',
    'illegal_content', 'minor_safety', 'spam', 'fraud', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('pending', 'reviewing', 'resolved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sanction_type as enum ('warning', 'limit', 'suspension', 'ban');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appeal_status as enum ('pending', 'reviewing', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_type as enum ('analytics', 'advertising', 'personalization', 'marketing_email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_status as enum ('granted', 'denied', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.privacy_request_type as enum (
    'access', 'rectification', 'erasure', 'restriction', 'objection',
    'portability', 'consent_withdrawal'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.privacy_request_status as enum ('pending', 'in_progress', 'completed', 'refused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fraud_signal_type as enum (
    'like_velocity',        -- likes trop rapides
    'like_volume',          -- volume anormal sur une periode
    'reciprocal_pattern',   -- echanges reciproques massifs
    'signup_burst',         -- creation de comptes en rafale
    'client_cluster',       -- nombreux comptes au comportement identique
    'automation'            -- signes d'activite automatisee
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Secret technique interne
-- -----------------------------------------------------------------------------
-- Sert a pseudonymiser (HMAC) les rares references conservees apres suppression
-- de compte, et a hacher les empreintes techniques utilisees par l'anti-fraude.
-- Il n'est lisible que par les fonctions SECURITY DEFINER : ni `anon` ni
-- `authenticated` n'ont de droit sur le schema `app`.
create table if not exists app.secrets (
  name  text primary key,
  value bytea not null
);

insert into app.secrets (name, value)
values ('pseudonymization_key', extensions.gen_random_bytes(32))
on conflict (name) do nothing;

create or replace function app.pseudonymize(p_input text)
returns text
language sql
stable
security definer
set search_path = app, extensions, pg_temp
as $$
  select case
    when p_input is null then null
    else encode(
      extensions.hmac(convert_to(p_input, 'UTF8'),
              (select value from app.secrets where name = 'pseudonymization_key'),
              'sha256'),
      'hex'
    )
  end;
$$;

comment on function app.pseudonymize(text) is
  'HMAC-SHA256 avec une cle interne. Utilise pour conserver une reference non '
  'reversible (anti-fraude, comptes supprimes) sans stocker de donnee personnelle.';
