import { useSQLiteContext } from 'expo-sqlite';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getFirstBusinessForUser } from '../db/businesses';
import { getMeta, setMeta } from '../db/meta';
import { Language, STRINGS, StringKey } from '../i18n/strings';
import { logoutGoogle } from '../lib/auth';

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
  completeLogin: (userId: string, email: string) => Promise<void>;
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
      const businessId = await getMeta(db, 'active_business_id');
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
      await setMeta(db, 'user_id', userId);
      await setMeta(db, 'email', email);
      // Same user logging in again on this phone: reopen their business.
      const existing = await getFirstBusinessForUser(db, userId);
      await setMeta(db, 'active_business_id', existing?.id ?? null);
      setState((s) => ({ ...s, userId, email, businessId: existing?.id ?? null }));
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
    await logoutGoogle();
    await setMeta(db, 'user_id', null);
    await setMeta(db, 'email', null);
    await setMeta(db, 'active_business_id', null);
    setState((s) => ({ ...s, userId: null, email: null, businessId: null }));
  }, [db]);

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
