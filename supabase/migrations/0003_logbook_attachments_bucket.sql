-- ============================================================================
-- 0003 — logbook-attachments storage bucket + RLS policies
-- ============================================================================
-- Run ONCE in Supabase SQL Editor → New Query.
-- What it does:
--   1. Creates the `logbook-attachments` storage bucket (public read) for
--      logbook entry file attachments (images, PDFs, DOC/DOCX).
--   2. Adds RLS policies so authenticated students can upload to their own
--      folder path, update/delete their own files, and everyone can read.
--   3. Ensures the logbook_entries table has an `attachments` JSONB column.
-- ============================================================================

-- ── 1. logbook-attachments storage bucket ────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('logbook-attachments', 'logbook-attachments', true)
on conflict (id) do nothing;

-- Allow any authenticated user to upload to their own student folder
drop policy if exists logbook_attachments_upload on storage.objects;
create policy logbook_attachments_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logbook-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow update (overwrite) of own files
drop policy if exists logbook_attachments_update on storage.objects;
create policy logbook_attachments_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logbook-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow delete of own files
drop policy if exists logbook_attachments_delete on storage.objects;
create policy logbook_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logbook-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (bucket is public but add policy too)
drop policy if exists logbook_attachments_read on storage.objects;
create policy logbook_attachments_read on storage.objects
  for select using (bucket_id = 'logbook-attachments');

-- ── 2. Ensure logbook_entries has an attachments column ──────────────────────
alter table public.logbook_entries
  add column if not exists attachments jsonb default '[]'::jsonb;

-- ============================================================================
-- Verify:
--   select id, name, public from storage.buckets;
--   select column_name, data_type from information_schema.columns
--     where table_name = 'logbook_entries' and column_name = 'attachments';
-- ============================================================================
