import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { maybeAutoBackup, retryPendingBackup, flushPendingBackupNow } from '../lib/backup';

// Mount once inside the SQLiteProvider tree (see app/_layout.tsx).
// - When the app goes to the background, any pending change-triggered backup
//   is flushed immediately (the 60s debounce timer may never fire while
//   suspended), then the legacy at-most-once-per-24h auto-backup runs if the
//   user enabled it in Settings.
// - When the app comes back to the foreground, a change-triggered backup that
//   failed earlier (offline / logged out) is retried immediately.
export function AutoBackup() {
  const db = useSQLiteContext();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        // Fire and forget: flushPendingBackupNow never throws.
        flushPendingBackupNow();
        // Fire and forget: maybeAutoBackup never throws.
        void maybeAutoBackup(db);
      } else if (s === 'active') {
        // Fire and forget: retryPendingBackup never throws.
        retryPendingBackup();
      }
    });
    return () => sub.remove();
  }, [db]);

  return null;
}
