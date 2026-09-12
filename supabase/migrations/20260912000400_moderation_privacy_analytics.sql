-- =============================================================================
-- LIKEMM — 04 · Moderation, anti-fraude, consentements, RGPD, analytics
-- =============================================================================

-- -----------------------------------------------------------------------------
-- blocks — §22
-- -----------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

-- -----------------------------------------------------------------------------
-- rate_limit_hits — §27 : limitation cote serveur
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limit_hits (
  id          bigint generated always as identity primary key,
  identity    text not null,
  action      text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_lookup_idx
  on public.rate_limit_hits (identity, action, occurred_at desc);

-- -----------------------------------------------------------------------------
-- reports — §21 / §31
-- -----------------------------------------------------------------------------
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete set null,
  target_user_id  uuid not null references public.profiles (id) on delete cascade,
  category        public.report_category not null,
  description     text check (description is null or char_length(description) <= 1000),
  status          public.report_status not null default 'pending',
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles (id) on delete set null,
  -- §45 : la decision de moderation est justifiee et conservee.
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  constraint reports_not_self check (reporter_id is null or reporter_id <> target_user_id)
);

create index if not exists reports_target_idx  on public.reports (target_user_id, created_at desc);
create index if not exists reports_status_idx  on public.reports (status, created_at desc);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

-- Un meme utilisateur ne peut pas empiler des signalements identiques en
-- attente sur la meme cible (anti-spam de moderation).
create unique index if not exists reports_no_duplicate_pending_idx
  on public.reports (reporter_id, target_user_id, category)
  where status in ('pending', 'reviewing');

-- -----------------------------------------------------------------------------
-- sanctions — §45 : moderation transparente et tracable
-- -----------------------------------------------------------------------------
create table if not exists public.sanctions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  type           public.sanction_type not null,
  reason         text not null check (char_length(reason) between 3 and 2000),
  rule_violated  text check (rule_violated is null or char_length(rule_violated) <= 200),
  issued_by      uuid references public.profiles (id) on delete set null,
  report_id      uuid references public.reports (id) on delete set null,
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz,
  revoked_at     timestamptz,
  revoked_by     uuid references public.profiles (id) on delete set null,
  appealable     boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint sanctions_duration check (ends_at is null or ends_at > starts_at)
);

create index if not exists sanctions_user_idx on public.sanctions (user_id, created_at desc);
create index if not exists sanctions_active_idx on public.sanctions (user_id)
  where revoked_at is null;

-- -----------------------------------------------------------------------------
-- appeals — §24 / §33
-- -----------------------------------------------------------------------------
create table if not exists public.appeals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  sanction_id  uuid not null references public.sanctions (id) on delete cascade,
  message      text not null check (char_length(message) between 10 and 4000),
  status       public.appeal_status not null default 'pending',
  decision     text check (decision is null or char_length(decision) <= 2000),
  handled_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  -- Un seul appel par sanction : on ne fait pas semblant d'en accepter dix.
  constraint appeals_one_per_sanction unique (sanction_id)
);

create index if not exists appeals_status_idx on public.appeals (status, created_at desc);
create index if not exists appeals_user_idx   on public.appeals (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- admin_actions — §23 : journal administratif
-- -----------------------------------------------------------------------------
create table if not exists public.admin_actions (
  id             bigint generated always as identity primary key,
  admin_id       uuid references public.profiles (id) on delete set null,
  action         text not null check (char_length(action) between 2 and 80),
  target_user_id uuid references public.profiles (id) on delete set null,
  reason         text check (reason is null or char_length(reason) <= 2000),
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_actions_target_idx on public.admin_actions (target_user_id, created_at desc);
create index if not exists admin_actions_admin_idx  on public.admin_actions (admin_id, created_at desc);

comment on table public.admin_actions is
  'Qui a fait quoi, sur quel compte, pourquoi et quand (§23). Aucune action de '
  'moderation ne passe sans une ligne ici : les RPC de moderation l''ecrivent.';

-- -----------------------------------------------------------------------------
-- fraud_signals — §25 / §29
-- -----------------------------------------------------------------------------
create table if not exists public.fraud_signals (
  id             bigint generated always as identity primary key,
  user_id        uuid references public.profiles (id) on delete cascade,
  signal_type    public.fraud_signal_type not null,
  severity       smallint not null default 1 check (severity between 1 and 5),
  details        jsonb not null default '{}'::jsonb,
  -- Empreinte HMAC non reversible. JAMAIS une preuve a elle seule (§29).
  fingerprint    text,
  detected_at    timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.profiles (id) on delete set null,
  review_outcome text check (review_outcome is null or review_outcome in ('confirmed', 'dismissed'))
);

create index if not exists fraud_signals_user_idx on public.fraud_signals (user_id, detected_at desc);
create index if not exists fraud_signals_open_idx on public.fraud_signals (detected_at desc)
  where reviewed_at is null;

comment on table public.fraud_signals is
  'Signaux, pas verdicts. Un signal seul ne justifie aucune sanction (§29) : '
  'la decision est prise par un humain via les RPC de moderation.';

-- -----------------------------------------------------------------------------
-- Consentements — §17 / §38 (ameliorations) / §37
-- -----------------------------------------------------------------------------
create table if not exists public.consents (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  consent_type   public.consent_type not null,
  status         public.consent_status not null,
  policy_version text not null check (char_length(policy_version) <= 40),
  updated_at     timestamptz not null default now(),
  primary key (user_id, consent_type)
);

-- §17 : « Conserver la preuve du consentement lorsque necessaire. »
-- Journal en append-only : on n'ecrase jamais un consentement passe.
create table if not exists public.consent_log (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  consent_type   public.consent_type not null,
  status         public.consent_status not null,
  policy_version text not null,
  occurred_at    timestamptz not null default now()
);

create index if not exists consent_log_user_idx on public.consent_log (user_id, occurred_at desc);

-- §39 : savoir quelle version des documents s'appliquait a l'acceptation.
create table if not exists public.legal_acceptances (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  document       text not null check (document in ('terms', 'privacy', 'community_guidelines')),
  policy_version text not null check (char_length(policy_version) <= 40),
  accepted_at    timestamptz not null default now()
);

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances (user_id, document, accepted_at desc);

-- -----------------------------------------------------------------------------
-- privacy_requests — §14 (droits RGPD)
-- -----------------------------------------------------------------------------
create table if not exists public.privacy_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  type          public.privacy_request_type not null,
  message       text check (message is null or char_length(message) <= 2000),
  status        public.privacy_request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  handled_at    timestamptz,
  handled_by    uuid references public.profiles (id) on delete set null,
  response_note text check (response_note is null or char_length(response_note) <= 4000)
);

create index if not exists privacy_requests_user_idx   on public.privacy_requests (user_id, created_at desc);
create index if not exists privacy_requests_status_idx on public.privacy_requests (status, created_at desc);

-- -----------------------------------------------------------------------------
-- private_profile_links — §32 : lien d'acces securise et revocable
-- -----------------------------------------------------------------------------
-- Le token en clair n'est JAMAIS stocke : seule son empreinte SHA-256 l'est.
-- Une URL previsible du type /@alex/private ne constitue pas un mecanisme de
-- securite, c'est pourquoi le token est genere avec gen_random_bytes.
create table if not exists public.private_profile_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token_hash   text not null unique,
  label        text check (label is null or char_length(label) <= 60),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  use_count    integer not null default 0 check (use_count >= 0)
);

create index if not exists private_links_user_idx on public.private_profile_links (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Analytics — §1 (ameliorations) / §36
-- -----------------------------------------------------------------------------
-- Liste blanche des evenements : un nom absent de cette table est refuse.
-- Cela empeche l'invention d'evenements et documente le plan de mesure.
create table if not exists public.analytics_event_types (
  name        text primary key check (name ~ '^[a-z0-9_]{3,60}$'),
  description text not null
);

insert into public.analytics_event_types (name, description) values
  ('session_started',        'Debut de session'),
  ('session_ended',          'Fin de session'),
  ('user_signed_up',         'Compte cree'),
  ('login',                  'Connexion'),
  ('logout',                 'Deconnexion'),
  ('profile_completed',      'Onboarding termine'),
  ('profile_viewed',         'Consultation d''un profil'),
  ('shared_profile_viewed',  'Consultation d''un profil via un lien partage'),
  ('leaderboard_viewed',     'Consultation du classement general'),
  ('leaderboard_24h_viewed', 'Consultation du classement 24H'),
  ('own_rank_viewed',        'Consultation de son propre rang'),
  ('rank_progress_viewed',   'Consultation de sa progression'),
  ('neighbor_profile_viewed','Consultation d''un profil voisin au classement'),
  ('like_given',             'Like donne'),
  ('like_removed',           'Like retire'),
  ('search_performed',       'Recherche effectuee'),
  ('share_clicked',          'Ouverture du partage'),
  ('share_completed',        'Partage effectue'),
  ('profile_link_copied',    'Lien de profil copie'),
  ('signup_from_share',      'Inscription issue d''un lien partage'),
  ('like_from_shared_profile','Like donne depuis un profil ouvert via un partage'),
  ('notification_opened',    'Notification ouverte'),
  ('report_created',         'Signalement envoye'),
  ('appeal_created',         'Contestation envoyee'),
  ('account_deleted',        'Compte supprime'),
  ('data_export_requested',  'Export de donnees demande'),
  ('consent_updated',        'Choix de consentement enregistre')
on conflict (name) do nothing;

comment on table public.analytics_event_types is
  'Liste blanche. public.track_event refuse tout nom absent : impossible '
  'd''inventer un evenement ou d''en fabriquer en masse.';

-- §13 (ameliorations) : ne pas collecter inutilement d'informations
-- personnelles. Un evenement porte un identifiant INTERNE (user_id ou un
-- identifiant anonyme genere par le navigateur), un nom, un horodatage et des
-- metadonnees non personnelles. Ni IP, ni user-agent, ni email.
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  anon_id     text check (anon_id is null or char_length(anon_id) <= 64),
  session_id  text check (session_id is null or char_length(session_id) <= 64),
  event_name  text not null references public.analytics_event_types (name),
  metadata    jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists analytics_events_name_time_idx on public.analytics_events (event_name, occurred_at desc);
create index if not exists analytics_events_user_idx      on public.analytics_events (user_id, occurred_at desc);
create index if not exists analytics_events_time_idx      on public.analytics_events (occurred_at desc);

-- -----------------------------------------------------------------------------
-- account_deletions — §13 / §34
-- -----------------------------------------------------------------------------
-- Apres suppression, plus aucune donnee personnelle n'est conservee. Seule une
-- reference PSEUDONYMISEE (HMAC non reversible) est gardee, uniquement pour la
-- securite et l'anti-fraude : reperer qu'un compte banni se recree, sans
-- pouvoir remonter a la personne.
create table if not exists public.account_deletions (
  id                uuid primary key default gen_random_uuid(),
  pseudonymous_ref  text not null,
  had_active_ban    boolean not null default false,
  deletion_reason   text check (deletion_reason is null or deletion_reason in ('user_request', 'moderation')),
  occurred_at       timestamptz not null default now()
);

create index if not exists account_deletions_ref_idx on public.account_deletions (pseudonymous_ref);

comment on table public.account_deletions is
  'Aucune donnee personnelle. pseudonymous_ref est un HMAC non reversible de '
  'l''identifiant interne, conserve pour la securite et l''anti-fraude.';
