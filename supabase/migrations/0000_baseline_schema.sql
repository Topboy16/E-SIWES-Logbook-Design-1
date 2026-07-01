-- ============================================================================
-- Baseline schema — canonical table definitions for the e-SIWES logbook
-- ============================================================================
-- This is the reproducible source of truth for the database structure. It uses
-- CREATE TABLE IF NOT EXISTS, so it is safe to run against the existing project
-- (it will NOT alter or drop tables that already exist — it only fills in what
-- is missing) and it fully provisions a fresh project.
--
-- Run order: this file (0000) first, then 0001_profile_provisioning.sql, which
-- layers on the auth trigger, backfill, role guard, and Row Level Security.
--
-- Modelled from the application's service layer and TypeScript types
-- (logbookService, feedbackService, notificationService, adminService,
-- AuthContext). If your existing tables differ (e.g. `role` is an enum rather
-- than text), the IF NOT EXISTS guard leaves them untouched — this file then
-- only documents the intended shape and provisions fresh environments.
--
-- Requires the pgcrypto extension for gen_random_uuid() (enabled by default on
-- Supabase). Included here for completeness on non-Supabase Postgres.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. id mirrors auth.users.id (populated by the
-- handle_new_user() trigger in 0001, not auto-generated here).
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null,
  role                text not null default 'student'
                        check (role in ('student', 'supervisor', 'admin')),
  full_name           text not null default '',
  department          text,
  supervisor_id       uuid references public.profiles (id) on delete set null,
  matric_number       text,
  organization        text,
  staff_id            text,
  passport_photo_url  text,
  email_confirmed_at  timestamptz,
  profile_completed   boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists profiles_role_idx          on public.profiles (role);
create index if not exists profiles_supervisor_id_idx on public.profiles (supervisor_id);

-- ── logbook_entries ─────────────────────────────────────────────────────────
create table if not exists public.logbook_entries (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  title         text not null default '',
  description   text not null default '',
  entry_date    date not null,
  hours_worked  numeric not null default 0,
  status        text not null default 'Pending'
                  check (status in ('Pending', 'Approved', 'Rejected')),
  attachments   jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists logbook_entries_student_id_idx on public.logbook_entries (student_id);
create index if not exists logbook_entries_status_idx     on public.logbook_entries (status);
create index if not exists logbook_entries_entry_date_idx on public.logbook_entries (entry_date);

-- ── feedback ────────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid not null references public.logbook_entries (id) on delete cascade,
  supervisor_id  uuid not null references public.profiles (id) on delete cascade,
  comment        text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists feedback_entry_id_idx      on public.feedback (entry_id);
create index if not exists feedback_supervisor_id_idx on public.feedback (supervisor_id);

-- ── notifications ───────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default '',
  message     text not null default '',
  type        text not null default 'info'
                check (type in ('approval', 'rejection', 'feedback', 'assignment', 'info')),
  read        boolean not null default false,
  entry_id    uuid references public.logbook_entries (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_read_idx    on public.notifications (user_id, read);

-- ============================================================================
-- Next: run 0001_profile_provisioning.sql for triggers, backfill, and RLS.
-- ============================================================================
