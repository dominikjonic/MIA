-- MIA core database schema, draft v0.1 (PostgreSQL 16+)
-- Scope: core tracking store. The community service (V2) lives in a separate database and trust zone.
-- Conventions:
--   * IDs are ULIDs generated on device (text, 26 chars) so offline writes have stable IDs.
--   * Every household-scoped table has household_id and is protected by RLS.
--   * Events are append-only revisions (bitemporal: occurred_* vs recorded_at).
--   * Columns ending in _enc hold application-layer encrypted bytes (per-household DEK, envelope encryption).

create extension if not exists pgcrypto;
create extension if not exists vector;   -- knowledge card retrieval

-- ─────────────────────────── Identity & household ───────────────────────────

create table account (
  id              text primary key,
  auth_subject    text not null unique,          -- from auth provider
  display_name    text not null,
  locale          text not null default 'de-AT',
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table household (
  id              text primary key,
  name            text,
  country         char(2) not null,              -- drives guidance jurisdiction
  timezone        text not null,                 -- IANA, e.g. Europe/Vienna
  dek_wrapped     bytea not null,                -- per-household data key, wrapped by KMS
  kms_key_id      text not null,
  created_at      timestamptz not null default now(),
  deletion_requested_at timestamptz
);

create type member_role as enum ('owner', 'co_parent', 'family_caregiver', 'babysitter', 'daycare');

create table household_member (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  account_id      text not null references account(id),
  role            member_role not null,
  scopes          text[] not null,               -- e.g. {log_care, view_history_30d, give_planned_meds, view_health}
  access_expires_at timestamptz,                 -- babysitter mode
  invited_by      text references household_member(id),
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (household_id, account_id)
);

create table on_duty (
  household_id    text not null references household(id) on delete cascade,
  member_id       text not null references household_member(id),
  since           timestamptz not null,
  until           timestamptz,
  primary key (household_id, member_id, since)
);

-- ─────────────────────────── Babies ───────────────────────────

create table baby (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  given_name      text not null,
  birth_date      date not null,
  sex             text check (sex in ('female','male','other','undisclosed')),
  gestational_age_weeks smallint,               -- optional; relevant for corrected age
  birth_weight_g  integer,
  feeding_method  text[] not null default '{}', -- {breast, formula, solids}
  color_key       text,                          -- UI color for multi-baby
  created_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create table baby_alias (                        -- nicknames, diminutives, STT variants
  baby_id         text not null references baby(id) on delete cascade,
  household_id    text not null references household(id) on delete cascade,
  alias           text not null,
  source          text not null check (source in ('user','learned_correction','phonetic')),
  primary key (baby_id, alias)
);

-- ─────────────────────────── Capture ───────────────────────────

create table utterance (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  member_id       text not null references household_member(id),
  channel         text not null,                 -- voice_app, text, widget, live_activity, intent, watch, notification_action, import, photo
  captured_at     timestamptz not null,          -- on-device capture time; anchor for time resolution
  device_tz       text not null,
  language        text,
  transcript_enc  bytea,                         -- encrypted; purged after retention window
  stt_confidence  real,
  route           text,                          -- fastpath | extract | extract-escalate
  extraction_json jsonb,                         -- proposed operations (pseudonymized), for audit; purged with transcript
  processed_at    timestamptz,
  retention_until timestamptz not null
);

-- ─────────────────────────── Event store ───────────────────────────

create type event_status as enum ('committed', 'unconfirmed', 'deleted');
create type time_precision as enum ('exact', 'approx', 'part_of_day', 'unknown');
create type provenance_kind as enum ('user_reported', 'observation', 'ai_inferred', 'imported', 'device');

-- One row per revision. The current state of an event is its highest revision.
create table event_revision (
  event_id        text not null,
  revision        integer not null,
  household_id    text not null references household(id) on delete cascade,
  baby_id         text references baby(id) on delete cascade,   -- null for household-level (e.g. some milk transitions)
  event_type      text not null,
  schema_version  smallint not null,
  occurred_start  timestamptz,
  occurred_end    timestamptz,                   -- sessions; null while open
  time_precision  time_precision not null,
  payload         jsonb not null,                -- non-sensitive typed payload (validated per event_type)
  payload_enc     bytea,                         -- sensitive payload parts (C3) encrypted
  status          event_status not null,
  provenance_kind provenance_kind not null,
  source_channel  text not null,
  utterance_id    text references utterance(id) on delete set null,
  evidence        text,                          -- short substring, kept after transcript purge
  extraction_route text,
  model_confidence real,
  final_confidence real,
  inferred_fields text[] not null default '{}',
  recorded_by     text not null references household_member(id),
  performed_by    text,                          -- member id or 'external:<label>'
  recorded_at     timestamptz not null default now(),
  primary key (household_id, event_id, revision)   -- partition key must be part of the PK
) partition by hash (household_id);

create table event_revision_p0 partition of event_revision for values with (modulus 4, remainder 0);
create table event_revision_p1 partition of event_revision for values with (modulus 4, remainder 1);
create table event_revision_p2 partition of event_revision for values with (modulus 4, remainder 2);
create table event_revision_p3 partition of event_revision for values with (modulus 4, remainder 3);

-- Current-state projection maintained by the domain service (or a trigger) for fast reads.
create table event_current (
  event_id        text primary key,
  revision        integer not null,
  household_id    text not null references household(id) on delete cascade,
  baby_id         text references baby(id) on delete cascade,
  event_type      text not null,
  occurred_start  timestamptz,
  occurred_end    timestamptz,
  time_precision  time_precision not null,
  payload         jsonb not null,
  status          event_status not null,
  recorded_by     text not null,
  updated_at      timestamptz not null
);
create index on event_current (household_id, baby_id, event_type, occurred_start desc);
create index open_sessions on event_current (household_id, baby_id, event_type)
  where occurred_end is null and event_type in ('sleep','breastfeed','pumping') and status <> 'deleted';

-- ─────────────────────────── Milk & formula ───────────────────────────

create table milk_portion (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  source_event_id text,                          -- pumping event
  expressed_at    timestamptz not null,
  volume_ml       numeric(6,1) not null,
  remaining_ml    numeric(6,1) not null,
  current_state   text not null,                 -- fresh, fridge, freezer, thawing, thawed_fridge, room, warmed, feeding_started, used, discarded
  label           text,                          -- short human label, e.g. '#14'
  use_by          timestamptz,                   -- computed by guidance engine
  use_by_ruleset  text,                          -- e.g. breastmilk_storage@AT/2026.1
  use_by_assumptions text[],
  created_at      timestamptz not null default now()
);

create table milk_portion_transition (
  id              text primary key,
  portion_id      text not null references milk_portion(id) on delete cascade,
  household_id    text not null references household(id) on delete cascade,
  from_state      text not null,
  to_state        text not null,
  at              timestamptz not null,
  event_id        text,                          -- linked feeding / transition event
  recorded_by     text not null references household_member(id)
);

create table formula_product (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  label           text not null,                 -- as the family calls it ("Pre")
  brand_text      text,
  stage_text      text,
  active          boolean not null default true
);

-- ─────────────────────────── Guidance & safety rules (global, not household-scoped) ───────────────────────────

create table guidance_ruleset (
  id              text primary key,              -- e.g. breastmilk_storage@AT/2026.1
  kind            text not null,                 -- breastmilk_storage, formula_prep, red_flags
  jurisdiction    text not null,                 -- AT, DE, CH, EU-default, US ...
  version         text not null,
  rules           jsonb not null,
  sources         jsonb not null,                -- [{publisher,title,url,published,accessed}]
  reviewed_by     text not null,
  reviewed_at     date not null,
  effective_from  date not null,
  retired_at      date
);

create table knowledge_card (
  id              text not null,
  version         integer not null,
  language        text not null,
  jurisdictions   text[] not null,
  title           text not null,
  body_md         text not null,
  risk_level      text not null check (risk_level in ('info','discuss_with_doctor','red_flag')),
  sources         jsonb not null,
  reviewed_by     text not null,
  reviewed_at     date not null,
  next_review     date not null,
  embedding       vector(1024),
  published       boolean not null default false,
  primary key (id, version, language)
);

-- ─────────────────────────── Reminders & medication ───────────────────────────

create table reminder (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  baby_id         text references baby(id) on delete cascade,
  category        text not null,                 -- supplement, appointment, pumping, supplies, custom, medication
  text            text not null,
  rrule           text,                          -- RFC 5545
  first_at        timestamptz not null,
  priority        text not null check (priority in ('urgent','important','helpful','optional')),
  medication_plan_id text,
  active          boolean not null default true,
  created_by      text not null references household_member(id),
  created_at      timestamptz not null default now()
);

create table medication_plan (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  baby_id         text not null references baby(id) on delete cascade,
  name_text_enc   bytea not null,                -- verbatim, as confirmed by parent
  dose_text_enc   bytea not null,                -- verbatim, as confirmed by parent; never computed
  schedule_rrule  text not null,
  starts_on       date not null,
  ends_on         date,
  source          text not null check (source in ('parent_input','document_confirmed')),
  source_document_id text,
  status          text not null check (status in ('draft','active','completed','cancelled')),
  confirmed_by    text references household_member(id),   -- required for status=active
  confirmed_at    timestamptz,
  field_confirmations jsonb,                     -- per-field confirmation record
  created_at      timestamptz not null default now(),
  check (status <> 'active' or (confirmed_by is not null and confirmed_at is not null))
);

-- ─────────────────────────── Baby Memory ───────────────────────────

create type memory_class as enum ('FACT', 'OBSERVATION', 'USER_REPORTED', 'AI_INFERENCE', 'MEDICAL');

create table memory_fact (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  baby_id         text not null references baby(id) on delete cascade,
  key             text not null,                 -- e.g. feeding.formula.product
  value_json      jsonb,                         -- non-sensitive
  value_enc       bytea,                         -- sensitive (MEDICAL and health-related)
  class           memory_class not null,
  source_type     text not null check (source_type in ('event','utterance','document','computation','profile')),
  source_ref      text not null,                 -- a fact without a source does not exist
  valid_from      timestamptz not null,
  valid_to        timestamptz,
  confidence      real,
  visibility      text not null default 'household' check (visibility in ('household','restricted_medical')),
  confirmed_by_parent boolean not null default false,
  last_verified_at timestamptz,
  created_at      timestamptz not null default now(),
  -- AI may never assert medical facts
  check (not (class = 'MEDICAL' and source_type = 'computation'))
);
create index on memory_fact (baby_id, key) where valid_to is null;

-- ─────────────────────────── Predictions ───────────────────────────

create table prediction (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  baby_id         text not null references baby(id) on delete cascade,
  kind            text not null,                 -- next_sleep, bedtime, next_feed
  model_version   text not null,
  computed_at     timestamptz not null,
  window_start    timestamptz,
  window_end      timestamptz,
  median_at       timestamptz,
  confidence      text not null check (confidence in ('high','medium','low')),
  reasons         jsonb not null,                -- template keys + values
  outcome_at      timestamptz,                   -- filled when actual event occurs (evaluation)
  hit             boolean
);
create index on prediction (baby_id, kind, computed_at desc);

-- ─────────────────────────── Media, documents, reports ───────────────────────────

create table attachment (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  baby_id         text references baby(id) on delete cascade,
  kind            text not null,                 -- health_photo, document, food_photo
  storage_key     text not null,                 -- object storage key; object is encrypted with household DEK
  mime_type       text not null,
  exif_stripped   boolean not null default true,
  linked_event_id text,
  created_by      text not null references household_member(id),
  created_at      timestamptz not null default now()
);

create table report (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  baby_id         text not null references baby(id) on delete cascade,
  range_start     date not null,
  range_end       date not null,
  sections        text[] not null,
  attachment_ids  text[] not null default '{}',
  status          text not null check (status in ('queued','rendering','ready','failed','expired')),
  storage_key     text,
  expires_at      timestamptz,
  created_by      text not null references household_member(id),
  created_at      timestamptz not null default now()
);

-- ─────────────────────────── Consent, audit, notifications ───────────────────────────

create table consent (
  id              text primary key,
  account_id      text not null references account(id),
  household_id    text references household(id) on delete cascade,
  purpose         text not null,                 -- core_service, health_data, improvement_program, server_stt, cohort_insights
  version         text not null,                 -- consent text version
  granted         boolean not null,
  at              timestamptz not null default now(),
  channel         text not null
);

create table audit_log (
  id              bigserial primary key,
  household_id    text,
  actor           text not null,                 -- member id, 'system', or 'admin:<id>'
  action          text not null,                 -- read_health, export, permission_change, delete, admin_access ...
  target          text,
  at              timestamptz not null default now(),
  meta            jsonb
);

create table device (
  id              text primary key,
  account_id      text not null references account(id) on delete cascade,
  platform        text not null check (platform in ('ios','android','watchos','wearos')),
  push_token      text,
  live_activity_tokens jsonb,
  app_version     text,
  last_seen_at    timestamptz
);

create table notification_log (
  id              text primary key,
  household_id    text not null references household(id) on delete cascade,
  member_id       text not null references household_member(id),
  type            text not null,
  priority        text not null,
  channel         text not null check (channel in ('local','push','in_app')),
  scheduled_for   timestamptz not null,
  delivered_at    timestamptz,
  outcome         text check (outcome in ('acted','dismissed','ignored','withdrawn','suppressed_budget','suppressed_quiet')),
  outcome_at      timestamptz
);

-- ─────────────────────────── Row-level security (pattern) ───────────────────────────
-- Applied to every household-scoped table. Shown for event_current; replicate per table.
-- Scope checks (e.g. view_health) are enforced in additional policies / API layer.

create or replace function app_member_households() returns setof text
language sql stable security definer as $$
  select household_id from household_member
  where account_id = current_setting('app.account_id', true)
    and revoked_at is null
    and (access_expires_at is null or access_expires_at > now())
$$;

alter table event_current enable row level security;
create policy household_isolation on event_current
  using (household_id in (select app_member_households()));
