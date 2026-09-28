// Cloud restore after login ("Loading your data" screen, app/restoring.tsx).
//
// Order: row-level sync data first (src/sync/engine.ts pullAll), then the
// newest daily full-file backup, then the business-profile-only fast path.
//
// Everything is written INTO the live database with the same `db` handle —
// no file swap, no app reload — so the loading screen can simply move on
// to Home when it finishes.
//
// Result:
//   restored      — a business exists now; businessId is set.
//   nothing-found — every cloud check worked and the account has no data:
//                   a genuinely new user → business setup.
//   failed        — something could not be checked or downloaded (offline,
//                   server error). The data may exist: never start fresh.
import type { SQLiteDatabase } from 'expo-sqlite';
import { setMeta } from '../db/meta';
import { CloudBackupRow, restoreBackupInPlace } from './backup';
import { pullBusinessProfileIfMissing } from './businessProfile';
import { cloudHasSyncData, pullAll } from '../sync/engine';
import { supabase } from './supabase';

export type AutoRestoreStatus = 'restored' | 'nothing-found' | 'failed';
export type AutoRestoreResult = { status: AutoRestoreStatus; businessId: string | null };

async function firstBusinessId(db: SQLiteDatabase, userId?: string): Promise<string | null> {
  const row = userId
    ? await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM businesses WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1',
        userId,
      )
    : await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM businesses WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1',
      );
  return row?.id ?? null;
}

async function done(db: SQLiteDatabase, id: string): Promise<AutoRestoreResult> {
  await setMeta(db, 'active_business_id', id);
  return { status: 'restored', businessId: id };
}

export async function autoRestoreAfterLogin(db: SQLiteDatabase): Promise<AutoRestoreResult> {
  try {
    let userId: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user?.id;
    } catch {
      return { status: 'failed', businessId: null };
    }
    if (!userId) return { status: 'failed', businessId: null };

    // Already on this phone (e.g. an earlier attempt finished) → just use it.
    const local = await firstBusinessId(db, userId);
    if (local) return done(db, local);

    let hadError = false;

    // 0) Row-level sync — the primary copy.
    try {
      const pulled = await pullAll(db);
      if (pulled.businesses > 0) {
        const id = await firstBusinessId(db, userId);
        if (id) return done(db, id);
      }
    } catch {
      hadError = true;
    }

    // 1) Newest daily full-file backup — the safety copy.
    try {
      const { data: rows, error } = await supabase
        .from('backups')
        .select('id, created_at, file_path, size_bytes, device_name, app_version')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (rows && rows.length > 0) {
        await restoreBackupInPlace(db, rows[0] as CloudBackupRow);
        const id = await firstBusinessId(db, userId);
        if (id) return done(db, id);
      }
    } catch {
      hadError = true;
    }

    // 2) Business profile only (the table may not exist — ignore errors).
    try {
      const pulledId = await pullBusinessProfileIfMissing(db, userId);
      if (pulledId) return done(db, pulledId);
    } catch {
      // ignore
    }

    return { status: hadError ? 'failed' : 'nothing-found', businessId: null };
  } catch {
    return { status: 'failed', businessId: null };
  }
}

/**
 * Does this user already have a backup in the cloud?
 * 'unknown' when it could not be checked (offline / no session).
 * Used before creating a NEW business, so a phone whose restore failed can
 * never start fresh and overwrite the user's real data in the cloud
 * (the cloud keeps only the newest backup).
 */
export async function cloudBackupExists(): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return 'unknown';
    const sync = await cloudHasSyncData();
    if (sync === 'yes') return 'yes';
    const { data: rows, error } = await supabase.from('backups').select('id').eq('user_id', userId).limit(1);
    if (error || sync === 'unknown') return rows && rows.length > 0 ? 'yes' : 'unknown';
    return rows && rows.length > 0 ? 'yes' : 'no';
  } catch {
    return 'unknown';
  }
}
