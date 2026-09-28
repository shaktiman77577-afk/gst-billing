-- ============================================================
-- GST Billing — remote app settings (force update + paid launch)
-- One row (id = 1). Readable by everyone, editable only from the
-- Supabase dashboard (Table Editor → app_config).
-- ============================================================
create table if not exists public.app_config (
  id                  integer primary key default 1 check (id = 1),
  min_version_code    integer not null default 0,   -- builds below this are BLOCKED ("Please update")
  latest_version_code integer not null default 0,   -- builds below this get an "Update available" popup
  update_message      text,                         -- optional custom text for both screens
  paid_launch_at      timestamptz,                  -- v1.1+: free trial counts from this date for older users
  updated_at          timestamptz not null default now()
);

insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists "app_config_read_all" on public.app_config;
create policy "app_config_read_all" on public.app_config
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;

-- Check:
-- select * from public.app_config;
