-- ============================================================================
-- 0002 — Storage bucket + email_confirmed_at auto-sync trigger
-- ============================================================================
-- Run ONCE in Supabase SQL Editor → New Query.
-- What it does:
--   1. Creates the `avatars` storage bucket (public read) for passport photos.
--   2. Adds an RLS policy so any authenticated user can upload their own avatar.
--   3. Adds a DB trigger on auth.users to sync email_confirmed_at to
--      public.profiles immediately when an email is confirmed — so the Admin
--      Dashboard shows "Verified" without waiting for the user to log in.
-- ============================================================================

-- ── 1. Avatars storage bucket ────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow any authenticated user to upload to their own folder
drop policy if exists avatars_user_upload on storage.objects;
create policy avatars_user_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow any authenticated user to update (overwrite) their own avatar
drop policy if exists avatars_user_update on storage.objects;
create policy avatars_user_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (bucket is public, but also add policy for SELECT)
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

-- ── 2. Sync email_confirmed_at to profiles on confirmation ──────────────────
create or replace function public.sync_email_confirmed_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only act when email_confirmed_at transitions from NULL to a timestamp
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles
    set email_confirmed_at = new.email_confirmed_at
    where id = new.id;
  end if;
  return new;
exception
  when others then
    -- Never block auth flow on a profile sync failure
    return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update on auth.users
  for each row
  when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.sync_email_confirmed_at();

-- ── 3. One-time backfill for any already-confirmed users ────────────────────
update public.profiles p
set email_confirmed_at = u.email_confirmed_at
from auth.users u
where p.id = u.id
  and u.email_confirmed_at is not null
  and p.email_confirmed_at is null;

-- ============================================================================
-- Done. Verify:
--   select id, name, public from storage.buckets where id = 'avatars';
--   select id, email, email_confirmed_at from public.profiles limit 10;
-- ============================================================================
