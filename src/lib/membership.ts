// Membership / subscription core (non-UI).
//
// - Plans, the user's active membership, and billing history come from
//   Supabase (tables `plans` / `memberships`, edge functions
//   `create-order` / `verify-payment`). The server is the source of truth
//   for prices and payment verification — the client never trusts its own
//   amounts.
// - Money is integer paise everywhere.
// - All network calls are wrapped in try/catch with graceful fallbacks:
//   offline -> cached membership / fallback plans, never a crash.
// - The Razorpay native module is lazy-imported inside startUpgrade so a
//   missing native module can never crash the app at startup.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme';
import {
  FALLBACK_PLANS,
  FN_CREATE_ORDER,
  FN_VERIFY_PAYMENT,
  MEM_CACHE_KEY,
  RAZORPAY_KEY_ID_PLACEHOLDER,
  TRIAL_DAYS,
} from './membershipConfig';
import { supabase } from './supabase';

export type Plan = {
  id: string;
  name: string;
  price_paise: number;
  duration_days: number;
};

export type MembershipRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  expires_at: string;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  created_at: string;
};

export type Entitlement = 'pro' | 'trial' | 'free';

/** Plan id of the Yearly plan (see supabase/membership.sql). */
export const YEARLY_PLAN_ID = 'pro_yearly';

/** Yearly-only features (recycle bin restore) check this. */
export function isYearlyPlan(planId: string | null | undefined): boolean {
  return planId === YEARLY_PLAN_ID;
}

function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: unknown })?.message ?? e ?? '');
  return /network|fetch|failed to fetch|network request failed|timed out|timeout/i.test(msg);
}

/**
 * Pulls a human-readable message out of anything thrown. Supabase and
 * Razorpay reject with oddly-shaped objects (nested `message` /
 * `description` / `error` fields, sometimes objects inside objects); a naive
 * String(obj) renders as "[object Object]" — which is exactly what users saw
 * in the Membership alert. This never returns "[object Object]".
 */
function readableError(e: unknown, depth = 0): string {
  if (typeof e === 'string') {
    const s = e.trim();
    return s === '[object Object]' ? '' : s;
  }
  if (typeof e === 'number' || typeof e === 'boolean') return String(e);
  if (e && typeof e === 'object' && depth < 3) {
    const o = e as Record<string, unknown>;
    for (const key of ['message', 'description', 'msg', 'error', 'details']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim() && v.trim() !== '[object Object]') return v.trim();
    }
    for (const key of ['message', 'error', 'cause']) {
      const inner = readableError(o[key], depth + 1);
      if (inner) return inner;
    }
    try {
      const j = JSON.stringify(o);
      if (j && j !== '{}') return j;
    } catch {
      /* not serializable — fall through to '' */
    }
  }
  return '';
}

function errMessage(e: unknown, fallback: string): string {
  return readableError(e) || fallback;
}

/** Active plans, cheapest first. Falls back to FALLBACK_PLANS offline. */
export async function fetchPlans(): Promise<Plan[]> {
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, price_paise, duration_days')
      .eq('is_active', true)
      .order('price_paise', { ascending: true });
    if (error) throw error;
    const rows = (data ?? [])
      .map((r) => ({
        id: String((r as Record<string, unknown>).id ?? ''),
        name: String((r as Record<string, unknown>).name ?? ''),
        price_paise: Number((r as Record<string, unknown>).price_paise ?? NaN),
        duration_days: Number((r as Record<string, unknown>).duration_days ?? NaN),
      }))
      .filter((p) => p.id && p.name && Number.isFinite(p.price_paise) && Number.isFinite(p.duration_days));
    return rows.length > 0 ? rows : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
}

/**
 * The user's active membership row (RLS returns only their own row).
 * Returns null when logged out, when there is no active membership,
 * or when the network is unreachable.
 */
export async function fetchMembership(): Promise<MembershipRow | null> {
  try {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw error;
    return (data as MembershipRow | null) ?? null;
  } catch {
    return null;
  }
}

/** Newest-first billing history (latest 20 rows). Empty array offline. */
export async function fetchMembershipHistory(): Promise<MembershipRow[]> {
  try {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data as MembershipRow[] | null) ?? [];
  } catch {
    return [];
  }
}

export type CreateOrderResult = {
  order_id: string;
  amount_paise: number;
  key_id: string;
  plan_id: string;
};

/**
 * Asks the server to create a Razorpay order for the plan. The amount and
 * key id in the response come from the server — never from client input.
 * Throws when there is no session or the function reports an error.
 */
export async function createOrder(planId: string): Promise<CreateOrderResult> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('not_logged_in');
  let data: Record<string, unknown> | null = null;
  try {
    const res = await supabase.functions.invoke(FN_CREATE_ORDER, {
      body: { plan_id: planId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.error) throw res.error;
    data = (res.data ?? null) as Record<string, unknown> | null;
  } catch (e) {
    throw new Error(isNetworkError(e) ? 'no_network' : errMessage(e, 'order_failed'));
  }
  const fnError = data?.error;
  if (fnError) throw new Error(readableError(fnError) || 'order_failed');
  const order_id = String(data?.order_id ?? data?.id ?? '');
  if (!order_id) throw new Error('order_failed');
  return {
    order_id,
    amount_paise: Number(data?.amount_paise ?? data?.amount ?? 0),
    key_id: String(data?.key_id ?? data?.key ?? ''),
    plan_id: String(data?.plan_id ?? planId),
  };
}

export type VerifyPaymentParams = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan_id: string;
};

/**
 * Asks the server to verify the Razorpay signature and activate the plan.
 * Throws when verification fails; the caller maps that to a payment error.
 */
export async function verifyPayment(p: VerifyPaymentParams): Promise<{ ok: boolean; expires_at: string }> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('not_logged_in');
  let data: Record<string, unknown> | null = null;
  try {
    const res = await supabase.functions.invoke(FN_VERIFY_PAYMENT, {
      body: {
        razorpay_order_id: p.razorpay_order_id,
        razorpay_payment_id: p.razorpay_payment_id,
        razorpay_signature: p.razorpay_signature,
        plan_id: p.plan_id,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.error) throw res.error;
    data = (res.data ?? null) as Record<string, unknown> | null;
  } catch (e) {
    throw new Error(isNetworkError(e) ? 'no_network' : errMessage(e, 'verify_failed'));
  }
  const fnError = data?.error;
  if (fnError || data?.ok === false) throw new Error(readableError(fnError) || 'verify_failed');
  return { ok: true, expires_at: String(data?.expires_at ?? '') };
}

/**
 * Pure entitlement derivation, no I/O:
 * pro   — an active membership row whose expiry is in the future;
 * trial — no pro, but the account is younger than TRIAL_DAYS;
 * free  — otherwise.
 */
export function computeEntitlement(
  m: MembershipRow | null,
  userCreatedAtISO: string | null,
  nowMs: number = Date.now(),
): Entitlement {
  if (m) {
    const exp = new Date(m.expires_at).getTime();
    if (!Number.isNaN(exp) && exp > nowMs) return 'pro';
  }
  if (userCreatedAtISO) {
    const created = new Date(userCreatedAtISO).getTime();
    if (!Number.isNaN(created) && nowMs - created < TRIAL_DAYS * 86400000) return 'trial';
  }
  return 'free';
}

/**
 * Bills created this calendar month (local month `yyyyMM`, e.g. '2026-09').
 * Counts exactly what the sales reports count as a live sale bill:
 * kind='invoice', both sale doc types, never cancelled or soft-deleted.
 * (Predicate verified against src/lib/reports.ts LIVE_SALE and the
 * InvoiceKind/DocType unions in src/db/invoices.ts.)
 */
export async function countBillsThisMonth(
  db: any,
  businessId: string,
  yyyyMM: string,
): Promise<number> {
  try {
    const row = await db.getFirstAsync(
      `SELECT COUNT(*) AS c FROM invoices
       WHERE business_id = ?
         AND kind = 'invoice'
         AND doc_type IN ('tax_invoice', 'bill_of_supply')
         AND cancelled_at IS NULL
         AND deleted_at IS NULL
         AND substr(invoice_date, 1, 7) = ?`,
      businessId,
      yyyyMM,
    );
    const c = Number((row as { c?: unknown } | null)?.c ?? 0);
    return Number.isFinite(c) && c >= 0 ? Math.floor(c) : 0;
  } catch {
    return 0;
  }
}

export type UpgradeResult = { success: boolean; cancelled?: boolean; error?: string };

/**
 * Full upgrade flow: create order (server) -> Razorpay checkout ->
 * verify payment (server). The Razorpay module is imported lazily so a
 * missing native module can never crash the app at startup.
 */
export async function startUpgrade(plan: Plan): Promise<UpgradeResult> {
  try {
    const order = await createOrder(plan.id);

    let RP: typeof import('react-native-razorpay').default;
    try {
      RP = (await import('react-native-razorpay')).default;
    } catch {
      return { success: false, error: 'checkout unavailable' };
    }
    if (!RP || typeof RP.open !== 'function') {
      return { success: false, error: 'checkout unavailable' };
    }

    let email: string | undefined;
    try {
      email = (await supabase.auth.getUser()).data.user?.email ?? undefined;
    } catch {
      email = undefined;
    }

    const paid = await RP.open({
      key: order.key_id || RAZORPAY_KEY_ID_PLACEHOLDER,
      order_id: order.order_id,
      amount: String(order.amount_paise),
      currency: 'INR',
      name: 'GST Billing Pro',
      description: plan.name,
      prefill: email ? { email } : {},
      theme: { color: colors.primary },
    });

    await verifyPayment({
      razorpay_order_id: paid.razorpay_order_id,
      razorpay_payment_id: paid.razorpay_payment_id,
      razorpay_signature: paid.razorpay_signature,
      plan_id: plan.id,
    });
    return { success: true };
  } catch (e: unknown) {
    const code = (e as { code?: unknown })?.code;
    const msg = errMessage(e, 'payment failed');
    // Razorpay rejects with code 2 when the user cancels the checkout.
    if (code === 2 || /cancel/i.test(msg)) return { success: false, cancelled: true };
    return { success: false, error: msg };
  }
}

export type MembershipCache = { m: MembershipRow | null; at: number };

/** Last known membership (stale-while-revalidate). Null when never cached. */
export async function readMembershipCache(): Promise<MembershipCache | null> {
  try {
    const raw = await AsyncStorage.getItem(MEM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MembershipCache> | null;
    if (!parsed || typeof parsed.at !== 'number') return null;
    const m = (parsed.m ?? null) as MembershipRow | null;
    if (m !== null && (typeof m !== 'object' || typeof m.expires_at !== 'string')) return null;
    return { m, at: parsed.at };
  } catch {
    return null;
  }
}

/** Persist the latest membership fetch (or null) with a timestamp. */
export async function writeMembershipCache(m: MembershipRow | null): Promise<void> {
  try {
    const payload: MembershipCache = { m, at: Date.now() };
    await AsyncStorage.setItem(MEM_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // cache write failure must never break the membership flow
  }
}
