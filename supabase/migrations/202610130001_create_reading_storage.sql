-- KU Phase 1: server-only storage for the existing Google HttpOnly login.
-- Run the WHOLE file in the Supabase SQL Editor as postgres.
-- No records are inserted, migrated, updated or deleted by this migration.
-- Existing localStorage snapshots are NOT imported automatically.
-- References: https://supabase.com/docs/guides/database/secure-data
-- https://supabase.com/docs/guides/getting-started/api-keys

begin;

-- Fail without altering an existing table or its permissions. Do not use
-- IF NOT EXISTS: an unrelated/pre-existing table must never be silently adopted.
do $$
begin
  if to_regclass('public.users') is not null
    or to_regclass('public.reading_sessions') is not null
    or to_regclass('public.reading_notes') is not null then
    raise exception 'KU migration stopped: one or more target tables already exist. Inspect the schema before proceeding.';
  end if;
end
$$;

-- AuthUser.id in server/auth.ts is the verified Google ID token sub.
-- This is NOT auth.users.id or a Supabase Auth UUID. Email is display data,
-- not an ownership key: one Google sub uniquely identifies a KU account.
create table public.users (
  google_sub text primary key check (length(btrim(google_sub)) between 1 and 255),
  name text not null default '',
  email text not null default '',
  picture text not null default '',
  grade text,
  reading_level text not null default '중급'
    check (reading_level in ('입문', '중급', '심화')),
  reading_level_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mirrors SavedSession in src/sessionHistory.ts. Text IDs also support the
-- existing timestamp/random fallback IDs, not only crypto.randomUUID().
-- snapshot retains book/session, messages, summary, checks, TAO and gaze reports.
-- Recommendation snapshots can also be stored without changing their shape.
create table public.reading_sessions (
  user_sub text not null references public.users(google_sub) on delete cascade,
  id text not null check (length(btrim(id)) between 1 and 255),
  kind text not null check (kind in ('reading', 'recommendation')),
  title text not null default '',
  snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(snapshot) = 'object'),
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_sub, id)
);

-- Reading notes are markdown strings (session.readingNote for reading;
-- currentDocument.markdown for recommendation). At most one current note per
-- account/session; updates use the composite key to avoid duplicate saves.
-- The composite FK prevents a note owned by B from referencing A's session.
create table public.reading_notes (
  user_sub text not null,
  session_id text not null,
  markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_sub, session_id),
  foreign key (user_sub, session_id)
    references public.reading_sessions(user_sub, id) on delete cascade
);

create index reading_sessions_user_saved_at_idx
  on public.reading_sessions (user_sub, saved_at desc, id);
-- Note lookup and FK enforcement already use the reading_notes composite PK.

comment on column public.users.google_sub is
  'Verified Google sub from the existing KU HttpOnly login; never accept ownership from request body/query.';
comment on column public.reading_sessions.snapshot is
  'Existing KU SessionSnapshot JSON; may contain book photos/heatmaps, never webcam video. No automatic localStorage import.';
comment on column public.reading_notes.markdown is
  'Existing readingNote/currentDocument.markdown text. Server keeps it consistent with the session snapshot.';
comment on column public.users.updated_at is 'Server must set updated_at on every update.';
comment on column public.reading_sessions.updated_at is 'Server must set updated_at on every update.';
comment on column public.reading_notes.updated_at is 'Server must set updated_at on every update.';

-- No browser policies: anon and authenticated must have ZERO access.
-- RLS defaults to deny when no policy exists. FORCE also protects normal table
-- owners, but PostgreSQL BYPASSRLS roles (service_role) still bypass it.
alter table public.users enable row level security;
alter table public.users force row level security;
alter table public.reading_sessions enable row level security;
alter table public.reading_sessions force row level security;
alter table public.reading_notes enable row level security;
alter table public.reading_notes force row level security;

-- Scope changes to these new tables only; leave schema defaults, other tables
-- and the "Automatically expose new tables" setting untouched.
revoke all privileges on table public.users, public.reading_sessions, public.reading_notes
  from public, anon, authenticated, service_role;
grant usage on schema public to service_role;
grant select, insert, update, delete
  on table public.users, public.reading_sessions, public.reading_notes
  to service_role;

-- SUPABASE_SECRET_KEY is Express-only and maps to service_role. Its RLS bypass
-- means this SQL CANNOT authenticate KU cookies or enforce per-user filters.
-- Every server SELECT/UPDATE/DELETE must filter user_sub using the sub resolved
-- from the valid ku_session cookie; users queries must filter google_sub.
-- INSERT/upsert must overwrite incoming ownership with that same verified sub.
-- Never use auth.uid() for this custom Google authentication flow.
-- Mutations of a session and its note should be atomic; deletion cascades notes.
-- DB failure must leave login/localStorage/AI features operational.

-- Explicit grants above opt only these tables into server Data API access even
-- when automatic exposure is off. Data API itself must be enabled and public
-- must be an exposed schema; do NOT enable browser grants or auto-exposure.
notify pgrst, 'reload schema';

commit;
