// Silent cloud restore after login / on app start ("invisible cloud").
//
// The user never sees backup/restore UI. When they log in with Google on a
// fresh install (or open the app while logged in but with no local business),
// we silently bring their data back:
//
//   1. GATE — only when the local DB has NO business at all. Existing local
//      data is NEVER touched.
//   2. Full restore — the newest row in public.backups is downloaded and the
//      whole SQLite file is swapped in (reuses restoreBackup from backup.ts).
//      This brings back everything: business, parties, items, bills.
//   3. Fast path — public.business_profiles (one row per user; the table may
//      not exist yet — any failure is ignored). Only the business row comes
//      back; used when no full backup exists.
//
// The full restore is tried FIRST on purpose: restoring only the business
// row first would trip the gate above, and the full backup (bills etc.)
// would then never be restored.
//
// Completely silent: no dialogs, no toasts — internal logging only via the
// returned status. Any error -> 'failed'.
//
// IMPORTANT for callers: a 'restored' full restore closes the passed `db`
// handle and asks the app to remount its SQLiteProvider (see backup.ts).
// After 'restored', do NOT use `db` again — navigate immediately and let the
// remount rebuild the tree from the new file. (The fast path does not swap
// the file; it also stamps active_business_id so the caller can re-read it
// with the same handle.)
import type { SQLiteDatabase } from 'expo-sqlite';
import { setMeta } from '../db/meta';
import { CloudBackupRow, restoreBackup } from './backup';
import { pullBusinessProfileIfMissing } from './businessProfile';
import { supabase } from './supabase';

export type AutoRestoreResult = 'restored' | 'nothing-found' | 'failed';

async function localBusinessExists(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM businesses WHERE deleted_at IS NULL LIMIT 1',
  );
  return !!row;
}

export async function autoRestoreAfterLogin(
  db: SQLiteDatabase,
): Promise<AutoRestoreResult> {
  try {
    // GATE: never touch a phone that already has a business set up.
    if (await localBusinessExists(db)) return 'nothing-found';

    let userId: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user?.id;
    } catch {
      return 'failed'; // e.g. offline
    }
    if (!userId) return 'failed';

    // 1) Full restore from the newest cloud backup (brings back everything).
    try {
      const { data: rows, error } = await supabase
        .from('backups')
        .select('id, created_at, file_path, size_bytes, device_name, app_version')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!error && rows && rows.length > 0) {
        await restoreBackup(db, rows[0] as CloudBackupRow);
        // The restored file carries its own app_meta (active_business_id,
        // user_id, email). The caller must navigate; the provider remount
        // re-reads everything from the new file.
        return 'restored';
      }
    } catch {
      // fall through to the fast path
    }

    // 2) Fast path: business profile only (the table may not exist yet).
    try {
      const pulledId = await pullBusinessProfileIfMissing(db, userId);
      if (pulledId) {
        await setMeta(db, 'active_business_id', pulledId);
        return 'restored';
      }
    } catch {
      // ignore — table missing / offline
    }
    return 'nothing-found';
  } catch {
    return 'failed';
  }
}
