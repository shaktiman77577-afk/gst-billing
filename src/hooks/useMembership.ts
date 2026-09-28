// Membership entitlement for the UI: pro / trial / free / unknown.
//
// - Stale-while-revalidate: the cached membership is shown first, then the
//   network result updates it.
// - Fail-open: while the status is 'unknown' (loading, offline with no
//   cache, logged out) bills can always be created. A cached membership is
//   only downgraded when the network positively reports no active
//   membership (a fresh cache contradicting a null is treated as an
//   offline blip, not as an expiry).
// - Logged-out users are 'unknown' -> never blocked; the Membership screen
//   prompts them to log in.
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  MembershipRow,
  computeEntitlement,
  countBillsThisMonth,
  fetchMembership,
  isYearlyPlan,
  readMembershipCache,
  writeMembershipCache,
} from '../lib/membership';
import { CACHE_TTL_MS, FREE_BILLS_PER_MONTH, TRIAL_DAYS } from '../lib/membershipConfig';
import { supabase } from '../lib/supabase';

export type MembershipState = {
  status: 'pro' | 'trial' | 'free' | 'unknown';
  loading: boolean;
  membership: MembershipRow | null;
  planId: string | null;
  /** Active Pro membership on the Yearly plan (trial / monthly / free → false). */
  isYearly: boolean;
  expiresAt: string | null;
  trialDaysLeft: number;
  billsUsed: number;
  billsLimit: number;
  canCreateBill: boolean;
  refresh: () => Promise<void>;
};

/** Local calendar month as 'YYYY-MM' (no date-fns needed). */
function localYYYYMM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function trialDaysLeftFor(userCreatedAtISO: string | null, nowMs: number): number {
  if (!userCreatedAtISO) return 0;
  const created = new Date(userCreatedAtISO).getTime();
  if (Number.isNaN(created)) return 0;
  const left = Math.ceil((created + TRIAL_DAYS * 86400000 - nowMs) / 86400000);
  return left > 0 ? left : 0;
}

export function useMembership(): MembershipState {
  const db = useSQLiteContext();
  const { businessId } = useApp();

  const [status, setStatus] = useState<MembershipState['status']>('unknown');
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [billsUsed, setBillsUsed] = useState(0);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const applyState = (
      m: MembershipRow | null,
      userCreatedAtISO: string | null,
      atMs: number,
    ) => {
      if (!mounted.current) return;
      const ent = computeEntitlement(m, userCreatedAtISO, atMs);
      setMembership(m);
      setStatus(ent);
      setTrialDaysLeft(ent === 'trial' ? trialDaysLeftFor(userCreatedAtISO, atMs) : 0);
    };

    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      // Logged out -> 'unknown', fail-open. Login is prompted on the
      // Membership screen; never block billing here.
      if (!user) {
        if (!mounted.current) return;
        setStatus('unknown');
        setMembership(null);
        setTrialDaysLeft(0);
        setBillsUsed(0);
        return;
      }
      const userCreatedAt = user.created_at ?? null;

      // 1) Stale-while-revalidate: show the cache first.
      let cached: { m: MembershipRow | null; at: number } | null = null;
      try {
        cached = await readMembershipCache();
      } catch {
        cached = null;
      }
      if (cached) applyState(cached.m, userCreatedAt, Date.now());

      // 2) Local bill count for this month (works fully offline).
      if (businessId) {
        try {
          const used = await countBillsThisMonth(db, businessId, localYYYYMM(new Date()));
          if (mounted.current) setBillsUsed(used);
        } catch {
          // keep previous count; never fail the whole load
        }
      } else if (mounted.current) {
        setBillsUsed(0);
      }

      // 3) Network revalidation. fetchMembership never throws: null means
      //    "no active row" OR "offline" — a fresh cache contradicting a
      //    null is treated as an offline blip (fail-open), not an expiry.
      const m = await fetchMembership();
      const nowMs = Date.now();
      const cacheFresh = !!cached && nowMs - cached.at < CACHE_TTL_MS;
      if (m) {
        await writeMembershipCache(m);
        applyState(m, userCreatedAt, nowMs);
      } else if (!cached || !cacheFresh) {
        await writeMembershipCache(null);
        applyState(null, userCreatedAt, nowMs);
      }
      // else: ambiguous null with a fresh cache -> keep showing the cache.
    } catch {
      // getUser itself failed -> stay fail-open 'unknown'.
      if (!mounted.current) return;
      setStatus('unknown');
    }
  }, [db, businessId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => {})
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, [load]);

  const refresh = useCallback(async () => {
    if (mounted.current) setLoading(true);
    try {
      await load();
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [load]);

  // Fail-open: only a positively-known free tier at/over the limit blocks.
  const canCreateBill = status !== 'free' || billsUsed < FREE_BILLS_PER_MONTH;

  return {
    status,
    loading,
    membership,
    planId: membership?.plan_id ?? null,
    isYearly: status === 'pro' && isYearlyPlan(membership?.plan_id),
    expiresAt: membership?.expires_at ?? null,
    trialDaysLeft,
    billsUsed,
    billsLimit: FREE_BILLS_PER_MONTH,
    canCreateBill,
    refresh,
  };
}
