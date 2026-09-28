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
export type AutoRestoreResult = {
  status: AutoRestoreStatus;
  businessId: string | null;
  /** Short technical reason when status is 'failed' (shown small on screen). */
  detail?: string;
};

function errText(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  const msg = String((e as { message?: unknown })?.message ?? e ?? '');
  return `${typeof code === 'string' ? `${code}: ` : ''}${msg}`.slice(0, 160);
}

/**
 * Data restored from this account's own cloud may carry an older user id on
 * its business rows (e.g. created before a login change). It is the same
 * person's data, so it is re-linked to the current account.
 */
async function adoptBusinesses(db: SQLiteDatabase, userId: string): Promise<string | null> {
  const mine = await firstBusinessId(db, userId);
  if (mine) return mine;
  const any = await firstBusinessId(db);
  if (!any) return null;
  await db.runAsync('UPDATE businesses SET user_id = ? WHERE user_id IS NOT ?', userId, userId);
  return firstBusinessId(db, userId);
}

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
    const local = await adoptBusinesses(db, userId);
    if (local) return done(db, local);

    const errors: string[] = [];

    // 0) Row-level sync — the primary copy.
    try {
      const pulled = await pullAll(db);
      if (pulled.businesses > 0) {
        const id = await adoptBusinesses(db, userId);
        if (id) return done(db, id);
      }
    } catch (e) {
      errors.push(`sync: ${errText(e)}`);
    }

    // 1) Daily full-file backups — newest first; if one cannot be read, the
    //    next older one is tried (up to 3).
    try {
      const { data: rows, error } = await supabase
        .from('backups')
        .select('id, created_at, file_path, size_bytes, device_name, app_version')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      for (const row of rows ?? []) {
        try {
          await restoreBackupInPlace(db, row as CloudBackupRow);
          const id = await adoptBusinesses(db, userId);
          if (id) return done(db, id);
          errors.push(`file ${String(row.created_at).slice(0, 16)}: no business inside`);
        } catch (e) {
          errors.push(`file ${String(row.created_at).slice(0, 16)}: ${errText(e)}`);
        }
      }
    } catch (e) {
      errors.push(`backups: ${errText(e)}`);
    }

    // 2) Business profile only (the table may not exist — ignore errors).
    try {
      const pulledId = await pullBusinessProfileIfMissing(db, userId);
      if (pulledId) return done(db, pulledId);
    } catch {
      // ignore
    }

    return errors.length
      ? { status: 'failed', businessId: null, detail: errors.join(' | ') }
      : { status: 'nothing-found', businessId: null };
  } catch (e) {
    return { status: 'failed', businessId: null, detail: errText(e) };
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
