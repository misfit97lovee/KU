-- Prepared from the live PostgREST schema on 2026-10-27. Not executed.
-- Reuse topics, user_sub -> users.google_sub, and the existing read_books table.
-- Review supabase/inspect_personalization.sql results before server integration.
-- No table creation, record writes, ownership changes, grants or RLS changes.
begin;

-- Stop on an unexpected schema rather than silently adopting incompatible data.
do $$
declare
  column_name text;
begin
  if to_regclass('public.user_preferences') is null then
    raise exception 'Existing public.user_preferences table is required.';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.user_preferences'::regclass
      and attname = 'topics' and atttypid = 'text[]'::regtype
      and not attisdropped
  ) then
    raise exception 'Inspect the existing topics column before proceeding.';
  end if;
  foreach column_name in array array['genres', 'favorite_authors', 'favorite_books'] loop
    if exists (
      select 1 from pg_attribute
      where attrelid = 'public.user_preferences'::regclass
        and attname = column_name and not attisdropped
        and atttypid <> 'text[]'::regtype
    ) then
      raise exception 'Existing preference column % must be reviewed.', column_name;
    end if;
  end loop;
end
$$;

-- Nullable, without a default or backfill: existing preferences remain intact.
-- The server should normalize NULL to [] for these optional selections.
alter table public.user_preferences
  add column if not exists genres text[],
  add column if not exists favorite_authors text[],
  add column if not exists favorite_books text[];

comment on column public.user_preferences.genres is 'Optional preferred genres; recommendation bonuses, never mandatory filters.';
comment on column public.user_preferences.favorite_authors is 'Optional favorite author names supplied by the user.';
comment on column public.user_preferences.favorite_books is 'Optional memorable or favorite book titles supplied by the user; actual reading history remains in read_books.';

notify pgrst, 'reload schema';
commit;
