import { useSQLiteContext } from 'expo-sqlite';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from '../context/AppContext';
import { getMeta } from '../db/meta';
import { hasPending, OfflineError, pushChanges, syncAll, syncEnabled } from './engine';

export type SyncStatus = 'off' | 'synced' | 'pending' | 'syncing' | 'offline' | 'error';

type SyncValue = {
  status: SyncStatus;
  lastOk: string | null;
  syncNow: () => Promise<void>;
};

const SyncContext = createContext<SyncValue>({ status: 'off', lastOk: null, syncNow: async () => undefined });

const CHECK_EVERY_MS = 15000;

// Watches for local changes and uploads them within a few seconds while the app is open.
export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { userId } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEnabled() ? 'pending' : 'off');
  const [lastOk, setLastOk] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(
    async (full: boolean) => {
      if (!syncEnabled() || !userId || running.current) return;
      running.current = true;
      try {
        const pending = await hasPending(db, userId);
        if (!pending && !full) {
          setStatus((s) => (s === 'offline' || s === 'error' ? s : 'synced'));
          return;
        }
        setStatus('syncing');
        if (full) await syncAll(db, userId);
        else await pushChanges(db, userId);
        setStatus('synced');
        setLastOk(await getMeta(db, 'sync_last_ok'));
      } catch (e) {
        setStatus(e instanceof OfflineError ? 'offline' : 'error');
      } finally {
        running.current = false;
      }
    },
    [db, userId],
  );

  useEffect(() => {
    if (!syncEnabled() || !userId) {
      setStatus(syncEnabled() ? 'pending' : 'off');
      return;
    }
    getMeta(db, 'sync_last_ok').then(setLastOk);
    run(false);
    const timer = setInterval(() => run(false), CHECK_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run(false);
      // Leaving the app: try to send the latest bill right away.
      if (s === 'background') run(false);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [db, userId, run]);

  const syncNow = useCallback(() => run(true), [run]);

  return <SyncContext.Provider value={{ status, lastOk, syncNow }}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  return useContext(SyncContext);
}
