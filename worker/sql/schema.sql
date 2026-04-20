-- Phase 2 schema for the ig-workout clip library.
-- Runs in a dedicated `workout` schema so it never collides with
-- anything else in this Supabase project.
--
-- Apply with: `psql "$SUPABASE_DB_URL" -f worker/sql/schema.sql`
--   or paste into Supabase SQL editor.

create schema if not exists workout;

-- -----------------------------------------------------------------------------
-- clips: one row per hand-cut exercise clip shown on the gallery.
-- -----------------------------------------------------------------------------
create table if not exists workout.clips (
  id                         text primary key,
  exercise_name              text not null,
  category                   text not null
    check (category in ('core','legs','upper','full_body','mobility')),
  muscle_group               text,
  equipment                  text[]   not null default '{}',
  form_cues                  text[]   not null default '{}',
  rep_count                  int,

  -- storage: R2 object keys, NOT full URLs.
  -- The site joins them to the R2 public base at build time
  -- (PUBLIC_R2_BASE env), so swapping buckets / domains is a no-op migration.
  clip_key                   text not null,
  thumb_key                  text not null,

  -- provenance
  source_url                 text,         -- IG post URL (carousel or reel)
  source_segment_index       int,          -- which slide / which segment
  source_segment_start_sec   real,         -- NULL for full-slide clips
  source_segment_end_sec     real,

  -- Gemini confidence scores (Phase 3+)
  exercise_name_confidence   real,
  boundary_confidence        real,

  hidden                     boolean not null default false,  -- user soft-delete via bot

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists clips_category_idx    on workout.clips (category)    where not hidden;
create index if not exists clips_created_at_idx  on workout.clips (created_at desc) where not hidden;

-- -----------------------------------------------------------------------------
-- ingest_jobs: one row per IG post the Telegram bot receives.
-- Lets Phase 5 show "processing…" / "done" / "failed" back in the chat.
-- -----------------------------------------------------------------------------
create table if not exists workout.ingest_jobs (
  id                 uuid primary key default gen_random_uuid(),
  source_url         text not null,
  telegram_chat_id   bigint,
  telegram_msg_id    bigint,
  status             text not null
    check (status in ('queued','downloading','analyzing','encoding','uploading','done','failed')),
  error              text,
  clip_ids           text[] not null default '{}',  -- ids of produced workout.clips rows
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists ingest_jobs_status_idx on workout.ingest_jobs (status, created_at desc);

-- -----------------------------------------------------------------------------
-- Trigger to bump updated_at on UPDATE.
-- -----------------------------------------------------------------------------
create or replace function workout.touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clips_touch_updated_at on workout.clips;
create trigger clips_touch_updated_at
  before update on workout.clips
  for each row execute function workout.touch_updated_at();

drop trigger if exists ingest_jobs_touch_updated_at on workout.ingest_jobs;
create trigger ingest_jobs_touch_updated_at
  before update on workout.ingest_jobs
  for each row execute function workout.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row-level security: the site is a static build (anon read-only via service_role
-- server-side fetch), so RLS here exists mostly to block the Supabase anon key
-- from exposing everything if we ever wire it up client-side.
-- -----------------------------------------------------------------------------
alter table workout.clips       enable row level security;
alter table workout.ingest_jobs enable row level security;

-- Read-only public policy for future client-side use.
-- Build-time fetch uses service_role which bypasses RLS anyway.
drop policy if exists clips_public_read on workout.clips;
create policy clips_public_read on workout.clips
  for select using (not hidden);
