-- ============================================================================
-- Profile provisioning + access control
-- ============================================================================
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is idempotent — safe to re-run.
--
-- What it does:
--   1. Ensures the columns the app expects exist on `profiles`.
--   2. Adds an is_admin() helper (used by RLS without recursion).
--   3. Creates a trigger so every new auth user gets a profiles row automatically
--      (works even with email confirmation ON, where the client has no session).
--   4. Backfills a profiles row for existing auth users that have none, marked
--      profile_completed = false so they finish setup on next login.
--   5. Promotes the admin account.
--   6. Enables Row Level Security with policies matching the app's access patterns.
--
-- ASSUMPTIONS: tables live in the `public` schema; `profiles.id` = auth user id.
-- If `profiles.role` is an ENUM (not text), the literal values used below
-- ('student' / 'supervisor' / 'admin') must be valid labels of that enum.
-- ============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists profile_completed boolean not null default false;
alter table public.profiles
  add column if not exists email_confirmed_at timestamptz;

-- ── 1b. Ensure the notifications table exists ───────────────────────────────
-- The app's notificationService expects this table. If it was never created,
-- every notification call has been silently falling back to localStorage. This
-- also prevents the RLS section below from failing on a missing relation.
-- (profiles / logbook_entries / feedback are assumed to already exist.)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  message text not null default '',
  type text not null default 'info',
  read boolean not null default false,
  entry_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_id_idx on public.notifications (user_id);

-- ── 2. Helpers (SECURITY DEFINER: they bypass RLS internally, so policies that
--       call them do not recurse) ────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.my_supervisor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select supervisor_id from public.profiles where id = auth.uid();
$$;

-- ── 3. Auto-create a profile for every new auth user ────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
begin
  -- Never let signup metadata self-assign a privileged role.
  if v_role not in ('student', 'supervisor') then
    v_role := 'student';
  end if;

  insert into public.profiles (
    id, email, role, full_name, department, matric_number,
    organization, staff_id, email_confirmed_at, profile_completed
  )
  values (
    new.id,
    new.email,
    v_role,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'department',
    new.raw_user_meta_data->>'matric_number',
    new.raw_user_meta_data->>'organization',
    new.raw_user_meta_data->>'staff_id',
    new.email_confirmed_at,
    -- Complete only if signup supplied the essentials; legacy/blank signups finish
    -- via the Complete Profile page.
    ((new.raw_user_meta_data->>'role') is not null
      and nullif(new.raw_user_meta_data->>'full_name', '') is not null)
  )
  on conflict (id) do nothing;

  return new;
exception
  -- Never block auth signup because of a profile hiccup.
  when others then
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 4. Guard against role escalation on profiles (INSERT/UPDATE) ────────────
create or replace function public.enforce_profile_role_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Privileged contexts (service role, SQL editor, DB triggers) have no auth.uid();
  -- allow them to set roles freely (needed for backfill + admin provisioning).
  if auth.uid() is null then
    return new;
  end if;

  -- Admins may set any role.
  if public.is_admin() then
    return new;
  end if;

  -- A non-admin can never assign the admin role.
  if new.role = 'admin' then
    new.role := case when tg_op = 'UPDATE' then old.role else 'student' end;
  end if;

  -- Once a profile is completed, a non-admin cannot change its role.
  if tg_op = 'UPDATE'
     and coalesce(old.profile_completed, false)
     and new.role is distinct from old.role then
    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_role_rules on public.profiles;
create trigger enforce_profile_role_rules
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role_rules();

-- ── 5. Backfill existing auth users that have no profile ────────────────────
insert into public.profiles (id, email, role, full_name, email_confirmed_at, profile_completed)
select
  u.id,
  u.email,
  'student',                                   -- placeholder; user picks real role on completion
  split_part(u.email, '@', 1),
  u.email_confirmed_at,
  false
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ── 6. Promote the admin ────────────────────────────────────────────────────
update public.profiles
set role = 'admin',
    full_name = coalesce(nullif(full_name, ''), 'System Administrator'),
    profile_completed = true
where id = (select id from auth.users where lower(email) = lower('watkinsp540@gmail.com'));

-- Optional: if the admin has not confirmed their email yet, uncomment to let them
-- sign in immediately (otherwise confirm it via Authentication → Users).
-- update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
-- where lower(email) = lower('watkinsp540@gmail.com');

-- ── 7. Row Level Security ───────────────────────────────────────────────────

-- profiles ------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select using (public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_supervisor_select_students on public.profiles;
create policy profiles_supervisor_select_students on public.profiles
  for select using (supervisor_id = auth.uid());

drop policy if exists profiles_student_select_supervisor on public.profiles;
create policy profiles_student_select_supervisor on public.profiles
  for select using (id = public.my_supervisor_id());

-- logbook_entries -----------------------------------------------------------
alter table public.logbook_entries enable row level security;

drop policy if exists le_student_all on public.logbook_entries;
create policy le_student_all on public.logbook_entries
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists le_supervisor_select on public.logbook_entries;
create policy le_supervisor_select on public.logbook_entries
  for select using (
    student_id in (select id from public.profiles where supervisor_id = auth.uid())
  );

drop policy if exists le_supervisor_update on public.logbook_entries;
create policy le_supervisor_update on public.logbook_entries
  for update using (
    student_id in (select id from public.profiles where supervisor_id = auth.uid())
  ) with check (true);

drop policy if exists le_admin_select on public.logbook_entries;
create policy le_admin_select on public.logbook_entries
  for select using (public.is_admin());

-- feedback ------------------------------------------------------------------
alter table public.feedback enable row level security;

drop policy if exists fb_supervisor_all on public.feedback;
create policy fb_supervisor_all on public.feedback
  for all using (supervisor_id = auth.uid()) with check (supervisor_id = auth.uid());

drop policy if exists fb_student_select on public.feedback;
create policy fb_student_select on public.feedback
  for select using (
    entry_id in (select id from public.logbook_entries where student_id = auth.uid())
  );

drop policy if exists fb_admin_select on public.feedback;
create policy fb_admin_select on public.feedback
  for select using (public.is_admin());

-- notifications -------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists nt_owner_select on public.notifications;
create policy nt_owner_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists nt_owner_update on public.notifications;
create policy nt_owner_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Any signed-in user may create a notification for another user (e.g. a supervisor
-- notifying a student on approval). The edge function uses the service role and
-- bypasses RLS. Tighten later if abuse is a concern.
drop policy if exists nt_insert_authenticated on public.notifications;
create policy nt_insert_authenticated on public.notifications
  for insert to authenticated with check (true);

-- ============================================================================
-- Done. Verify:
--   select count(*) from public.profiles;                 -- should now be ~11
--   select email, role, profile_completed from public.profiles order by role;
-- ============================================================================
