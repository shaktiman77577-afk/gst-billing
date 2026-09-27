-- ============================================================================
-- GST Billing — Supabase backend for cloud data backup
-- ----------------------------------------------------------------------------
-- HOW TO USE: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. It is safe to run more than once (all statements are
-- IF NOT EXISTS / ON CONFLICT / DROP IF EXISTS guarded).
--
-- What it creates:
--   1. public.backups  — one row per uploaded database snapshot
--   2. public.devices   — one row per phone/tablet (used by the future
--                         "1 user per account" feature; the app registers the
--                         device on every cloud backup, no enforcement yet)
--   3. storage bucket "backups" (PRIVATE) holding the .db snapshot files
--   4. Row Level Security: a logged-in user can only see/touch their OWN rows
--      and their OWN files under backups/<their-user-id>/...
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. backups table
-- ----------------------------------------------------------------------------
create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                 -- = auth.uid() (Supabase Auth user id)
  created_at timestamptz not null default now(),
  file_path text not null,               -- storage path, e.g. "<uid>/backup-....db"
  size_bytes integer not null,
  device_name text,                      -- free text, e.g. "Pixel 6a"
  app_version text                       -- e.g. "0.10.0"
);

create index if not exists backups_user_id_created_idx
  on public.backups (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 2. devices table (registration only for now; enforcement comes later)
-- ----------------------------------------------------------------------------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id text not null,               -- random id generated once per install
  device_name text,
  last_seen timestamptz not null default now()
);

-- One row per (user, phone). Guarded so re-running never errors.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'devices_user_device_unique'
  ) then
    alter table public.devices
      add constraint devices_user_device_unique unique (user_id, device_id);
  end if;
end $$;

create index if not exists devices_user_id_idx on public.devices (user_id);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security — users only ever see their own rows
-- ----------------------------------------------------------------------------
alter table public.backups enable row level security;
alter table public.devices enable row level security;

drop policy if exists "backups_owner_all" on public.backups;
create policy "backups_owner_all"
  on public.backups
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "devices_owner_all" on public.devices;
create policy "devices_owner_all"
  on public.devices
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. Private storage bucket "backups"
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- Users may upload / read / delete only inside their own folder:
--   backups/<their-user-id>/...
drop policy if exists "backup_upload_own" on storage.objects;
create policy "backup_upload_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "backup_read_own" on storage.objects;
create policy "backup_read_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "backup_delete_own" on storage.objects;
create policy "backup_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
