import { useSQLiteContext } from 'expo-sqlite';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getFirstBusinessForUser } from '../db/businesses';
import { getMeta, setMeta } from '../db/meta';
import { Language, STRINGS, StringKey } from '../i18n/strings';
import { logoutGoogle } from '../lib/auth';
import { autoRestoreAfterLogin } from '../lib/cloudRestore';
import { claimThisDevice } from '../sync/device';
import { cancelSync, flushSyncNow, hasUnsyncedChanges, wipeLocalData } from '../sync/engine';

type AppState = {
  ready: boolean;
  language: Language | null;
  userId: string | null;
  email: string | null;
  businessId: string | null;
};

type AppContextValue = AppState & {
  t: (key: StringKey) => string;
  chooseLanguage: (lang: Language) => Promise<void>;
  completeLogin: (userId: string, email: string) => Promise<string | null>;
  setActiveBusiness: (id: string) => Promise<void>;
  /** Normal logout. Returns 'unsynced' (and does nothing) when changes could
   *  not reach the cloud and `force` is not set — ask the user first. */
  logout: (force?: boolean) => Promise<'ok' | 'unsynced'>;
  /** Another phone logged in: log out and wipe this phone without asking. */
  forceLogout: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

// Login state is kept in the phone database, so the app opens
// normally without internet after the first login.
export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [state, setState] = useState<AppState>({
    ready: false,
    language: null,
    userId: null,
    email: null,
    businessId: null,
  });

  useEffect(() => {
    (async () => {
      const language = (await getMeta(db, 'language')) as Language | null;
      const userId = await getMeta(db, 'user_id');
      const email = await getMeta(db, 'email');
      let businessId = await getMeta(db, 'active_business_id');
      // App start: a Supabase session may exist while the local business table
      // is empty (fresh install, or a restore that failed while offline).
      // Silently pull the cloud BEFORE first paint — local rows are never
      // overwritten. If a full backup is restored the DB file is swapped and
      // this handle is closed; the SQLiteProvider remount then re-runs this
      // effect on the new file.
      if (userId && !businessId) {
        try {
          if ((await autoRestoreAfterLogin(db)) === 'restored') {
            try {
              businessId = await getMeta(db, 'active_business_id');
            } catch {
              return; // file swapped — the remount re-runs this effect
            }
          }
        } catch {
          // silent — the app just keeps working locally
        }
      }
      setState({ ready: true, language, userId, email, businessId });
    })();
  }, [db]);

  const t = useCallback(
    (key: StringKey) => STRINGS[state.language ?? 'en'][key],
    [state.language],
  );

  const chooseLanguage = useCallback(
    async (lang: Language) => {
      await setMeta(db, 'language', lang);
      setState((s) => ({ ...s, language: lang }));
    },
    [db],
  );

  const completeLogin = useCallback(
    async (userId: string, email: string) => {
      // A different account's data must never mix with this one.
      const other = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM businesses WHERE user_id IS NOT ? LIMIT 1',
        userId,
      );
      if (other) await wipeLocalData(db);
      // This phone becomes the account's only active phone; any other phone
      // is logged out on its next check.
      await claimThisDevice();
      await setMeta(db, 'user_id', userId);
      await setMeta(db, 'email', email);
      // Silent cloud restore right after login. Gated on "no local business":
      // existing local data is never overwritten. When a full backup restores,
      // the DB file is swapped and this handle is closed — the provider remount
      // rebuilds state from the new file, so the caller must navigate
      // immediately without touching `db` again.
      let restored = false;
      try {
        restored = (await autoRestoreAfterLogin(db)) === 'restored';
      } catch {
        // silent
      }
      if (restored) {
        try {
          const active = await getMeta(db, 'active_business_id');
          if (active) {
            // Fast path: the profile was pulled into the live DB.
            setState((s) => ({ ...s, userId, email, businessId: active }));
            return active;
          }
        } catch {
          // Closed handle after a full restore — the remount rebuilds state.
        }
        setState((s) => ({ ...s, userId, email, businessId: null }));
        return null;
      }
      const existing = await getFirstBusinessForUser(db, userId);
      await setMeta(db, 'active_business_id', existing?.id ?? null);
      setState((s) => ({ ...s, userId, email, businessId: existing?.id ?? null }));
      return existing?.id ?? null;
    },
    [db],
  );

  const setActiveBusiness = useCallback(
    async (id: string) => {
      await setMeta(db, 'active_business_id', id);
      setState((s) => ({ ...s, businessId: id }));
    },
    [db],
  );

  // Logout wipes this phone's business data (it stays in the cloud and comes
  // back on the next login). Changes are uploaded first; if that fails
  // (offline), the caller is told so it can warn the user.
  const logout = useCallback(
    async (force = false): Promise<'ok' | 'unsynced'> => {
      if (state.userId) {
        await Promise.race([flushSyncNow(db), new Promise((r) => setTimeout(r, 8000))]);
        if (!force) {
          let pending = false;
          try {
            pending = await hasUnsyncedChanges(db);
          } catch {
            pending = false;
          }
          if (pending) return 'unsynced';
        }
      }
      cancelSync();
      await logoutGoogle();
      await wipeLocalData(db);
      setState((s) => ({ ...s, userId: null, email: null, businessId: null }));
      return 'ok';
    },
    [db, state.userId],
  );

  const forceLogout = useCallback(async () => {
    cancelSync();
    try {
      await logoutGoogle();
    } catch {
      // ignore
    }
    try {
      await wipeLocalData(db);
    } catch {
      // ignore
    }
    setState((s) => ({ ...s, userId: null, email: null, businessId: null }));
  }, [db]);

  const value = useMemo(
    () => ({ ...state, t, chooseLanguage, completeLogin, setActiveBusiness, logout, forceLogout }),
    [state, t, chooseLanguage, completeLogin, setActiveBusiness, logout, forceLogout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

// Current app language for components that may render outside the provider
// (falls back to English instead of throwing). Used by the font wrappers.
export function useLanguage(): Language {
  const ctx = useContext(AppContext);
  return ctx?.language ?? 'en';
}
