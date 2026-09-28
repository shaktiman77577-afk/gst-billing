-- ============================================================
-- GST Billing — row-level cloud sync (Step 1, already run)
-- One table holds every synced row of every user.
-- sync_push is replaced by device.sql (adds the active-phone check).
-- ============================================================
create table if not exists public.sync_rows (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  tbl        text        not null,
  row_id     text        not null,
  updated_at timestamptz not null,
  deleted    boolean     not null default false,
  data       jsonb       not null default '{}'::jsonb,
  seq        bigint      not null,
  server_at  timestamptz not null default now(),
  primary key (user_id, tbl, row_id)
);
create sequence if not exists public.sync_rows_seq;
create index if not exists sync_rows_user_seq_idx on public.sync_rows (user_id, seq);

alter table public.sync_rows enable row level security;
drop policy if exists "sync_rows_select_own" on public.sync_rows;
create policy "sync_rows_select_own" on public.sync_rows
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "sync_rows_insert_own" on public.sync_rows;
create policy "sync_rows_insert_own" on public.sync_rows
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "sync_rows_update_own" on public.sync_rows;
create policy "sync_rows_update_own" on public.sync_rows
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.sync_rows from anon;
grant select, insert, update on public.sync_rows to authenticated;
grant usage, select on sequence public.sync_rows_seq to authenticated;
