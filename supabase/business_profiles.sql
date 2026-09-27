-- ============================================================================
-- GST Billing — Supabase backend for the business profile cloud sync
-- ----------------------------------------------------------------------------
-- HOW TO USE: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. It is safe to run more than once (all statements are
-- IF NOT EXISTS / DROP IF EXISTS guarded).
--
-- What it creates:
--   1. public.business_profiles — one row per user (user_id = auth.uid()),
--      mirroring the local SQLite "businesses" table so the business details
--      come back automatically when the user logs in on another phone.
--      Local data always wins: the app only PULLS this row when its own
--      business table is empty, and PUSHES an upsert on every business save.
--   2. Row Level Security: a logged-in user can only read/insert/update
--      their OWN row (auth.uid() = user_id).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. business_profiles table
-- ----------------------------------------------------------------------------
create table if not exists public.business_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- local business id, so a re-pulled profile keeps the same id
  local_id text not null,
  -- business details (same names as the local SQLite "businesses" columns)
  name text not null,
  phone text,
  gst_registered boolean not null default false,
  gstin text,
  pan text,
  state_code text,
  address text,
  city text,
  pincode text,
  business_type text not null default 'retail',
  -- bill-design settings (template / logo / signature / bank details)
  invoice_prefix text,
  template text,
  theme_color text,
  logo text,        -- data URI (base64 image)
  signature text,   -- data URI
  bank_account_name text,
  bank_account_no text,
  bank_ifsc text,
  bank_name text,
  upi_id text,
  terms text,
  tagline text,
  -- bookkeeping
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Row Level Security — users only ever see/touch their OWN row
-- ----------------------------------------------------------------------------
alter table public.business_profiles enable row level security;

drop policy if exists "profiles_owner_select" on public.business_profiles;
create policy "profiles_owner_select"
  on public.business_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_owner_insert" on public.business_profiles;
create policy "profiles_owner_insert"
  on public.business_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles_owner_update" on public.business_profiles;
create policy "profiles_owner_update"
  on public.business_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
