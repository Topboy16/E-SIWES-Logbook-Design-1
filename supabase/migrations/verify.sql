-- ============================================================================
-- Schema verification script — e-SIWES Logbook
-- ============================================================================
-- Paste this into Supabase SQL Editor → New Query and click Run.
-- All rows should show status = 'OK'. Any 'MISSING' row needs attention.
-- ============================================================================

-- ── Tables ────────────────────────────────────────────────────────────────────
select 'TABLE' as kind, table_name as name,
  case when table_name in (
    select table_name from information_schema.tables
    where table_schema = 'public'
  ) then 'OK' else 'MISSING' end as status
from (values
  ('profiles'),
  ('logbook_entries'),
  ('feedback'),
  ('notifications')
) t(table_name);

-- ── Required columns ─────────────────────────────────────────────────────────
select 'COLUMN' as kind,
  table_name || '.' || column_name as name,
  case when column_name in (
    select column_name from information_schema.columns c2
    where c2.table_schema = 'public' and c2.table_name = t.table_name
  ) then 'OK' else 'MISSING' end as status
from (values
  ('profiles',        'role'),
  ('profiles',        'full_name'),
  ('profiles',        'supervisor_id'),
  ('profiles',        'profile_completed'),
  ('profiles',        'email_confirmed_at'),
  ('profiles',        'passport_photo_url'),
  ('logbook_entries', 'student_id'),
  ('logbook_entries', 'title'),
  ('logbook_entries', 'status'),
  ('logbook_entries', 'hours_worked'),
  ('logbook_entries', 'attachments'),
  ('feedback',        'comment'),
  ('notifications',   'user_id'),
  ('notifications',   'read')
) t(table_name, column_name);

-- ── RLS enabled ───────────────────────────────────────────────────────────────
select 'RLS' as kind, relname as name,
  case when relrowsecurity then 'OK' else 'MISSING — run 0001 migration' end as status
from pg_class
where relname in ('profiles','logbook_entries','feedback','notifications')
  and relnamespace = 'public'::regnamespace;

-- ── Key policies ──────────────────────────────────────────────────────────────
select 'POLICY' as kind, tablename || '/' || policyname as name, 'OK' as status
from pg_policies
where schemaname = 'public'
  and policyname in (
    'profiles_select_own',
    'profiles_admin_select',
    'profiles_admin_update',
    'le_student_select',
    'le_student_insert',
    'le_student_update',
    'le_student_delete',
    'le_supervisor_select',
    'le_supervisor_update',
    'le_admin_select',
    'fb_supervisor_all',
    'fb_student_select',
    'nt_owner_select',
    'nt_owner_update',
    'nt_insert_supervisor_or_admin'
  )
order by tablename, policyname;

-- ── Triggers ──────────────────────────────────────────────────────────────────
select 'TRIGGER' as kind, trigger_name as name,
  case when trigger_name in (
    select trigger_name from information_schema.triggers
    where trigger_schema = 'public' or event_object_schema = 'auth'
  ) then 'OK' else 'MISSING' end as status
from (values
  ('on_auth_user_created'),
  ('on_auth_user_email_confirmed'),
  ('enforce_profile_role_rules'),
  ('enforce_profile_safe_columns'),
  ('enforce_supervisor_entry_columns')
) t(trigger_name);

-- ── Storage buckets ───────────────────────────────────────────────────────────
select 'BUCKET' as kind, id as name,
  case
    when id = 'avatars'              and public = true  then 'OK (public)'
    when id = 'logbook-attachments'  and public = false then 'OK (private)'
    when id = 'avatars'              and public = false then 'WRONG — should be public'
    when id = 'logbook-attachments'  and public = true  then 'WRONG — should be private'
    else 'UNEXPECTED'
  end as status
from storage.buckets
where id in ('avatars', 'logbook-attachments');

-- ── Helper functions ──────────────────────────────────────────────────────────
select 'FUNCTION' as kind, routine_name as name, 'OK' as status
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('is_admin','my_supervisor_id','handle_new_user',
                       'enforce_profile_role_rules','enforce_profile_safe_columns',
                       'enforce_supervisor_entry_columns','sync_email_confirmed_at');
