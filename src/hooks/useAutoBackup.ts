import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { maybeAutoBackup } from '../lib/backup';

// Mount once inside the SQLiteProvider tree (see app/_layout.tsx).
// When the app goes to the background, a cloud backup runs at most once per
// 24h — and only if the user switched auto-backup on in Settings.
export function AutoBackup() {
  const db = useSQLiteContext();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        // Fire and forget: maybeAutoBackup never throws.
        void maybeAutoBackup(db);
      }
    });
    return () => sub.remove();
  }, [db]);

  return null;
}
