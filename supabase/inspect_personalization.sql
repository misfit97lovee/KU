-- READ ONLY. Run in Supabase SQL Editor to inspect details that PostgREST's
-- OpenAPI schema cannot prove. Does not return user IDs or reading records.
begin read only;

-- Existing columns, ownership foreign keys and uniqueness constraints.
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('users', 'user_preferences', 'read_books')
order by table_name, ordinal_position;

select c.relname as table_name, k.conname, k.contype,
       pg_get_constraintdef(k.oid) as definition
from pg_constraint k
join pg_class c on c.oid = k.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('users', 'user_preferences', 'read_books')
order by c.relname, k.conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('users', 'user_preferences', 'read_books')
order by tablename, indexname;

-- Confirm one preference row per account without exposing any account IDs.
-- If duplicates exist, do not add a UNIQUE constraint or delete/merge data.
select count(*) as accounts_with_multiple_preference_rows
from (
  select user_sub from public.user_preferences
  group by user_sub having count(*) > 1
) duplicate_accounts;

-- Custom KU Google cookies are not Supabase Auth JWTs. auth.uid() policies
-- alone do not authenticate KU users. Express must scope every operation by
-- the verified session's Google sub, even if RLS is enabled.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('users', 'user_preferences', 'read_books');

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('users', 'user_preferences', 'read_books')
order by tablename, policyname;

select t.table_name, r.role_name,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'SELECT') as can_select,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'INSERT') as can_insert,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'UPDATE') as can_update,
       has_table_privilege(r.role_name, 'public.' || t.table_name, 'DELETE') as can_delete
from (values ('users'), ('user_preferences'), ('read_books')) t(table_name)
cross join (values ('anon'), ('authenticated'), ('service_role')) r(role_name)
order by t.table_name, r.role_name;

select rolname, rolbypassrls from pg_roles
where rolname in ('anon', 'authenticated', 'service_role');

commit;
