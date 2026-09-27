// Membership system: single config Sundar can edit.
//
// Prices are in integer paise everywhere. The server (Supabase edge
// functions) is the source of truth for amounts — the client never trusts
// its own numbers when creating or verifying payments.
import type { Plan } from './membership';

/** Free trial length for new users (starts at account creation). */
export const TRIAL_DAYS = 7;

/** How many bills a free-tier user may create per calendar month. */
export const FREE_BILLS_PER_MONTH = 10;

/** Plans shown when the plans table can't be reached (offline / error). */
export const FALLBACK_PLANS: Plan[] = [
  { id: 'pro_monthly', name: 'Pro Monthly', price_paise: 9900, duration_days: 30 },
  { id: 'pro_yearly', name: 'Pro Yearly', price_paise: 79900, duration_days: 365 },
];

/** Supabase edge function names (deploy these separately). */
export const FN_CREATE_ORDER = 'create-order';
export const FN_VERIFY_PAYMENT = 'verify-payment';

/** AsyncStorage key for the cached membership row (stale-while-revalidate). */
export const MEM_CACHE_KEY = 'membership_cache_v1';
/** How long the cached membership is treated as fresh. */
export const CACHE_TTL_MS = 6 * 3600_000;

// The Razorpay key id is PUBLIC by design (Razorpay puts it in client-side
// checkout code). The app prefers the key_id returned by the create-order
// edge function; this constant is the fallback so checkout always has a key.
// NOTE: this is the TEST key. When going live, replace with the rzp_live_…
// key id from the Razorpay dashboard.
export const RAZORPAY_KEY_ID_PLACEHOLDER = 'rzp_test_TgsnTOSw8vXClD';
