import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { flushPendingBackupNow, maybeDailyBackup, retryPendingBackup } from '../lib/backup';
import { scheduleSync } from '../sync/engine';

// Mount once inside the SQLiteProvider tree (see app/_layout.tsx).
// - App start: upload anything not yet in the cloud (e.g. data from before
//   sync existed) and take the daily backup if it is due.
// - Background: upload pending changes right away (timers may not run while
//   suspended) and take the daily backup if due.
// - Foreground: retry an upload that failed earlier (offline) + daily check.
export function AutoBackup() {
  const db = useSQLiteContext();

  useEffect(() => {
    scheduleSync(db);
    void maybeDailyBackup(db);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        flushPendingBackupNow(db);
        void maybeDailyBackup(db);
      } else if (s === 'active') {
        retryPendingBackup();
        void maybeDailyBackup(db);
      }
    });
    return () => sub.remove();
  }, [db]);

  return null;
}
