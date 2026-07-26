-- ============================================================================
-- 0004 — Security Hardening (Findings 1, 2, 3, 4)
-- ============================================================================
-- Run ONCE in Supabase SQL Editor → New Query.
-- Safe to re-run (all statements are idempotent).
--
-- What it does:
--   Finding 1: Replace broad logbook RLS with workflow-aware policies so
--              students cannot edit/delete Approved or Rejected entries, and
--              supervisors can only update the status column.
--   Finding 2: Restrict notification inserts to supervisors and admins only.
--   Finding 3: Convert logbook-attachments bucket to private (signed URLs).
--              Avatars remain public (intentional product decision — displayed
--              in the supervisor/admin UI and need a stable URL).
--   Finding 4: Add a trigger that silently reverts unauthorised changes to
--              sensitive profile columns (supervisor_id, email_confirmed_at,
--              profile_completed demotion).
-- ============================================================================

-- ── Finding 1: Logbook workflow-aware RLS ─────────────────────────────────────

-- Remove the old blanket policies
drop policy if exists le_student_all    on public.logbook_entries;
drop policy if exists le_supervisor_update on public.logbook_entries;

-- Students can read their own entries (always)
drop policy if exists le_student_select on public.logbook_entries;
create policy le_student_select on public.logbook_entries
  for select
  using (student_id = auth.uid());

-- Students can create new entries (DB sets status = 'Pending' as default)
drop policy if exists le_student_insert on public.logbook_entries;
create policy le_student_insert on public.logbook_entries
  for insert to authenticated
  with check (student_id = auth.uid());

-- Students can EDIT only their own Pending entries.
-- The WITH CHECK prevents changing student_id or status via this path.
drop policy if exists le_student_update on public.logbook_entries;
create policy le_student_update on public.logbook_entries
  for update
  using  (student_id = auth.uid() and status = 'Pending')
  with check (student_id = auth.uid() and status = 'Pending');

-- Students can DELETE only their own Pending entries.
drop policy if exists le_student_delete on public.logbook_entries;
create policy le_student_delete on public.logbook_entries
  for delete
  using (student_id = auth.uid() and status = 'Pending');

-- Supervisors can SELECT entries belonging to their assigned students.
-- (le_supervisor_select policy already exists from 0001 — keep it)

-- Supervisors can UPDATE only the status and updated_at columns.
-- Enforced via a trigger below (RLS cannot restrict individual columns).
drop policy if exists le_supervisor_update on public.logbook_entries;
create policy le_supervisor_update on public.logbook_entries
  for update
  using (
    student_id in (
      select id from public.profiles where supervisor_id = auth.uid()
    )
  )
  with check (
    student_id in (
      select id from public.profiles where supervisor_id = auth.uid()
    )
  );

-- Trigger: supervisor can only change status + updated_at.
-- Any other column changes from a supervisor are silently reverted.
create or replace function public.enforce_supervisor_entry_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- Allow service-role / admin operations unrestricted
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  if v_role = 'supervisor' then
    -- Supervisors may only change status and updated_at
    new.student_id    := old.student_id;
    new.title         := old.title;
    new.description   := old.description;
    new.entry_date    := old.entry_date;
    new.hours_worked  := old.hours_worked;
    new.attachments   := old.attachments;
    new.created_at    := old.created_at;
    -- status and updated_at are NOT reset — supervisor may change those
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_supervisor_entry_columns on public.logbook_entries;
create trigger enforce_supervisor_entry_columns
  before update on public.logbook_entries
  for each row
  execute function public.enforce_supervisor_entry_columns();

-- ── Finding 2: Notification insert — supervisors/admins only ─────────────────

drop policy if exists nt_insert_authenticated on public.notifications;

-- Supervisors and admins may insert notifications for any user.
-- The Edge Function (send-reminder) uses the service-role key which bypasses
-- RLS entirely — that path is unaffected by this policy.
drop policy if exists nt_insert_supervisor_or_admin on public.notifications;
create policy nt_insert_supervisor_or_admin on public.notifications
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'supervisor'
    )
  );

-- ── Finding 3: logbook-attachments → private bucket ──────────────────────────

-- Make the bucket private (public = false).
-- Existing object URLs will stop working; the app now uses signed URLs.
update storage.buckets
set public = false
where id = 'logbook-attachments';

-- Drop the old public-read policy for this bucket (no longer needed)
drop policy if exists logbook_attachments_read on storage.objects;

-- Authenticated users can read objects within their own folder via the API
-- (signed URL generation uses the service role and bypasses RLS anyway,
--  but this policy allows direct authenticated reads as a fallback).
drop policy if exists logbook_attachments_authenticated_read on storage.objects;
create policy logbook_attachments_authenticated_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logbook-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins and supervisors can read any attachment (for logbook review)
drop policy if exists logbook_attachments_admin_sup_read on storage.objects;
create policy logbook_attachments_admin_sup_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logbook-attachments'
    and (
      public.is_admin()
      or exists (
        select 1 from public.profiles where id = auth.uid() and role = 'supervisor'
      )
    )
  );

-- Note: avatars bucket intentionally stays public.
-- Passport photos are displayed in supervisor/admin UI via stable public URLs.

-- ── Finding 4: Protect sensitive profile columns ──────────────────────────────

create or replace function public.enforce_profile_safe_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role and admin operations are unrestricted
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Only the admin may change supervisor_id (student assignment)
  if new.supervisor_id is distinct from old.supervisor_id then
    new.supervisor_id := old.supervisor_id;
  end if;

  -- Nobody (including the row owner) may write email_confirmed_at directly.
  -- It is updated only by the sync_email_confirmed_at trigger on auth.users.
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    new.email_confirmed_at := old.email_confirmed_at;
  end if;

  -- profile_completed can only go true→true or false→true, never true→false.
  if old.profile_completed = true and new.profile_completed = false then
    new.profile_completed := true;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_safe_columns on public.profiles;
create trigger enforce_profile_safe_columns
  before update on public.profiles
  for each row
  execute function public.enforce_profile_safe_columns();

-- ============================================================================
-- Done. Verify:
--   select policyname, cmd from pg_policies
--     where tablename in ('logbook_entries','notifications','profiles')
--     order by tablename, policyname;
--   select id, name, public from storage.buckets
--     where id in ('avatars','logbook-attachments');
-- ============================================================================
