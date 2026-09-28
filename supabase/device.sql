-- ============================================================
-- GST Billing — one active phone per account (Step 1b)
-- Run AFTER sync.sql. Logging in on a new phone makes it the
-- active phone; the old phone is logged out on its next check,
-- and the server refuses its sync uploads.
-- ============================================================

-- 1. Which phone is active for each user
create table if not exists public.active_devices (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  device_id   text not null,
  device_name text,
  claimed_at  timestamptz not null default now()
);

alter table public.active_devices enable row level security;

drop policy if exists "active_devices_select_own" on public.active_devices;
create policy "active_devices_select_own" on public.active_devices
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.active_devices from anon;
grant select on public.active_devices to authenticated;

-- 2. Login on a phone: make it the active one
create or replace function public.claim_device(p_device_id text, p_device_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.active_devices (user_id, device_id, device_name, claimed_at)
  values (auth.uid(), p_device_id, p_device_name, now())
  on conflict (user_id) do update
    set device_id = excluded.device_id,
        device_name = excluded.device_name,
        claimed_at = now();
end;
$$;

-- 3. Is this phone still the active one? 'active' | 'replaced' | 'none' | 'no_session'
create or replace function public.device_status(p_device_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'no_session'
    when not exists (select 1 from public.active_devices where user_id = auth.uid()) then 'none'
    when exists (select 1 from public.active_devices
                 where user_id = auth.uid() and device_id = p_device_id) then 'active'
    else 'replaced'
  end;
$$;

revoke all on function public.claim_device(text, text) from public, anon;
revoke all on function public.device_status(text) from public, anon;
grant execute on function public.claim_device(text, text) to authenticated;
grant execute on function public.device_status(text) to authenticated;

-- 4. sync_push now also needs the phone id; an old phone is refused
drop function if exists public.sync_push(jsonb);

create or replace function public.sync_push(p_rows jsonb, p_device_id text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.active_devices
             where user_id = auth.uid() and device_id <> p_device_id) then
    raise exception 'DEVICE_REPLACED';
  end if;

  insert into public.sync_rows as s
    (user_id, tbl, row_id, updated_at, deleted, data, seq, server_at)
  select
    auth.uid(),
    r->>'tbl',
    r->>'id',
    (r->>'updated_at')::timestamptz,
    coalesce((r->>'deleted')::boolean, false),
    coalesce(r->'data', '{}'::jsonb),
    nextval('public.sync_rows_seq'),
    now()
  from jsonb_array_elements(p_rows) as r
  on conflict (user_id, tbl, row_id) do update
    set updated_at = excluded.updated_at,
        deleted    = excluded.deleted,
        data       = excluded.data,
        seq        = excluded.seq,
        server_at  = now()
    where case
      when s.tbl = 'invoice_series'
        then coalesce((excluded.data->>'next_seq')::bigint, 0)
             > coalesce((s.data->>'next_seq')::bigint, 0)
      else excluded.updated_at >= s.updated_at
    end;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- security invoker + RLS: the caller also needs read access to active_devices (granted above)
revoke all on function public.sync_push(jsonb, text) from public, anon;
grant execute on function public.sync_push(jsonb, text) to authenticated;
