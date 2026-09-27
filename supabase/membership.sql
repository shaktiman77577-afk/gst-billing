-- ============================================================================
-- GST Billing — Supabase backend for Pro membership / subscriptions
-- ----------------------------------------------------------------------------
-- HOW TO USE: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. It is safe to run more than once (all statements are
-- IF NOT EXISTS / ON CONFLICT / DROP IF EXISTS guarded).
--
-- What it creates:
--   1. public.plans        — subscription plans (Pro Monthly / Pro Yearly).
--                            Prices live here; the edge functions ALWAYS read
--                            the price server-side, never from the client.
--   2. public.memberships   — one ACTIVE row per user at most (partial unique
--                            index). Rows are written ONLY via service_role
--                            (the verify-payment edge function), never by the
--                            client — there are deliberately no
--                            insert/update/delete policies.
--   3. Row Level Security: plans are publicly readable when active; a
--      logged-in user can only READ their own membership rows.
--
-- Razorpay flow:
--   app → edge fn create-order (authenticated) → Razorpay order (INR, paise)
--   app → Razorpay checkout → edge fn verify-payment (authenticated)
--       → signature checked + order re-fetched from Razorpay (amount re-checked
--       server-side) → membership row upserted (expires_at extended)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. plans table
-- ----------------------------------------------------------------------------
create table if not exists public.plans (
  id text primary key,                          -- 'pro_monthly' | 'pro_yearly'
  name text not null,                          -- 'Pro Monthly'
  price_paise integer not null,                 -- integer paise, e.g. 9900 = ₹99
  duration_days integer not null,               -- 30 / 365
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- Seed / refresh. Re-running updates prices and re-activates plans, but never
-- deletes or creates extra rows.
insert into public.plans (id, name, price_paise, duration_days, is_active)
values
  ('pro_monthly', 'Pro Monthly', 9900, 30, true),
  ('pro_yearly', 'Pro Yearly', 79900, 365, true)
on conflict (id) do update set
  name = excluded.name,
  price_paise = excluded.price_paise,
  duration_days = excluded.duration_days,
  is_active = true;

-- ----------------------------------------------------------------------------
-- 2. memberships table
-- ----------------------------------------------------------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                        -- = auth.uid() (Supabase Auth user id)
  plan_id text not null references public.plans(id),
  status text not null default 'active',        -- 'active' | 'expired'
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  razorpay_payment_id text,                    -- e.g. 'pay_N3...' (last payment)
  razorpay_order_id text,                      -- e.g. 'order_N2...' (last order)
  created_at timestamptz not null default now()
);

-- At most ONE active membership row per user. Extensions PATCH the existing
-- row; a second active row can never be created (prevents double-credit).
create unique index if not exists memberships_one_active_per_user
  on public.memberships (user_id) where status = 'active';

-- A Razorpay payment id must never credit two membership rows (replay safety).
create unique index if not exists memberships_payment_unique
  on public.memberships (razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists memberships_user_id_idx on public.memberships (user_id);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.memberships enable row level security;

-- Plans: public (even logged-out) read of ACTIVE plans only — the app needs
-- the price list before login. Prices are still re-verified server-side in the
-- edge functions, so this leak is harmless.
drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read"
  on public.plans
  for select
  to anon, authenticated
  using (is_active = true);

-- Memberships: a logged-in user can only READ their own rows.
-- DELIBERATE: there are NO insert/update/delete policies. Client writes would
-- be an instant self-grant hole, so writes happen only with the service_role
-- key from the verify-payment edge function (service_role bypasses RLS).
drop policy if exists "memberships_owner_read" on public.memberships;
create policy "memberships_owner_read"
  on public.memberships
  for select
  to authenticated
  using (auth.uid() = user_id);
