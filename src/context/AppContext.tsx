import { useSQLiteContext } from 'expo-sqlite';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getFirstBusinessForUser } from '../db/businesses';
import { getMeta, setMeta } from '../db/meta';
import { Language, STRINGS, StringKey } from '../i18n/strings';
import { logoutGoogle } from '../lib/auth';
import { autoRestoreAfterLogin } from '../lib/cloudRestore';
import { pushChanges, resetSyncState, syncEnabled } from '../sync/engine';

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
  logout: () => Promise<void>;
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
      const previous = await getMeta(db, 'user_id');
      if (previous !== userId) await resetSyncState(db);
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

  const logout = useCallback(async () => {
    // Last chance to send unsaved changes to the cloud (skipped if offline).
    if (syncEnabled() && state.userId) {
      await Promise.race([pushChanges(db, state.userId).catch(() => 0), new Promise((r) => setTimeout(r, 8000))]);
    }
    await resetSyncState(db);
    await logoutGoogle();
    await setMeta(db, 'user_id', null);
    await setMeta(db, 'email', null);
    await setMeta(db, 'active_business_id', null);
    setState((s) => ({ ...s, userId: null, email: null, businessId: null }));
  }, [db, state.userId]);

  const value = useMemo(
    () => ({ ...state, t, chooseLanguage, completeLogin, setActiveBusiness, logout }),
    [state, t, chooseLanguage, completeLogin, setActiveBusiness, logout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
