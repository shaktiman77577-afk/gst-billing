// Cloud backup: full SQLite file snapshot -> Supabase Storage (private bucket).
//
// Design notes:
// - Snapshot is taken with `VACUUM INTO`, so it is a consistent point-in-time
//   copy even while the live database is open. Never copy the live .db file
//   directly (WAL sidecars / half-written pages can corrupt it).
// - One storage object per backup: backups/<supabase-uid>/backup-<stamp>.db,
//   plus one row in the public.backups table (RLS keeps every user to their
//   own rows/files).
// - Restore downloads to a temp file, verifies it (SQLite magic header +
//   PRAGMA integrity_check + schema version), then closes the live DB, swaps
//   the files, deletes stale WAL sidecars, and asks the app to remount the
//   SQLiteProvider (see app/_layout.tsx) so the new file is reopened.
// - No new native modules are used: expo-sqlite, expo-file-system (File/Paths
//   API), expo-crypto and expo-constants are all already in the app.
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { getMeta, setMeta } from '../db/meta';
import { supabase } from './supabase';

export const DB_NAME = 'gstbilling.db';
const BUCKET = 'backups';
const SNAP_PREFIX = 'cloud-backup-snap';
const TMP_RESTORE_NAME = 'cloud-backup-restore-tmp.db';
// SQLite magic header: "SQLite format 3\0"
const SQLITE_MAGIC = 'SQLite format 3\0';

export type BackupErrorCode =
  | 'no_session' // not logged in with Google
  | 'no_network' // request failed because the phone is offline
  | 'empty' // nothing to back up yet (no business on this phone)
  | 'invalid' // downloaded file is not a valid SQLite database
  | 'newer' // backup is from a newer app version
  | 'failed'; // anything else (message carries the detail)

export class BackupError extends Error {
  code: BackupErrorCode;
  constructor(code: BackupErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

export type CloudBackupRow = {
  id: string;
  created_at: string;
  file_path: string;
  size_bytes: number;
  device_name: string | null;
  app_version: string | null;
};

type ReloadListener = () => void;
const reloadListeners = new Set<ReloadListener>();

/** app/_layout.tsx subscribes: after a restore swaps the DB file, the
 *  SQLiteProvider is remounted so it reopens the new file. */
export function onDbReloadRequest(cb: ReloadListener): () => void {
  reloadListeners.add(cb);
  return () => {
    reloadListeners.delete(cb);
  };
}

function requestDbReload(): void {
  reloadListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore a broken listener; the user can restart the app manually
    }
  });
}

function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: unknown })?.message ?? e ?? '');
  return /network|fetch|failed to fetch|network request failed|timed out|timeout/i.test(msg);
}

function sqliteDir(): Directory {
  return new Directory(Paths.document, 'SQLite');
}

function deviceLabel(): { device_name: string; app_version: string | null } {
  const device_name =
    (Constants as unknown as { deviceName?: string }).deviceName ?? 'Android phone';
  const app_version = Constants.expoConfig?.version ?? null;
  return { device_name, app_version };
}

/** Stable per-install id, used for the devices table (future 1-user feature). */
async function installDeviceId(db: SQLiteDatabase): Promise<string> {
  let id = await getMeta(db, 'device_id');
  if (!id) {
    id = Crypto.randomUUID();
    await setMeta(db, 'device_id', id);
  }
  return id;
}

/** Best-effort device registration (no enforcement yet — that comes later). */
async function touchDevice(db: SQLiteDatabase, userId: string): Promise<void> {
  try {
    const device_id = await installDeviceId(db);
    const { device_name } = deviceLabel();
    await supabase.from('devices').upsert(
      {
        user_id: userId,
        device_id,
        device_name,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' },
    );
  } catch {
    // never let device bookkeeping break a backup
  }
}

/** Consistent snapshot of the live DB into the app cache dir. */
async function snapshotDb(db: SQLiteDatabase): Promise<File> {
  const snap = new File(Paths.cache, `${SNAP_PREFIX}-${Date.now()}.db`);
  if (snap.exists) await snap.delete();
  // VACUUM INTO needs a filesystem path, not a file:// URI.
  const rawPath = snap.uri.replace(/^file:\/\//, '').replace(/'/g, "''");
  await db.execAsync(`VACUUM INTO '${rawPath}'`);
  return snap;
}

async function requireUserId(): Promise<string> {
  let userId: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id;
  } catch (e) {
    throw new BackupError(isNetworkError(e) ? 'no_network' : 'no_session');
  }
  if (!userId) throw new BackupError('no_session');
  return userId;
}

/**
 * Uploads a fresh snapshot of the whole database to the user's private
 * Supabase Storage folder and records it in public.backups.
 * Throws BackupError with a machine-readable code.
 */
export async function backupNow(
  db: SQLiteDatabase,
): Promise<{ id: string; createdAt: string; sizeBytes: number }> {
  const userId = await requireUserId();

  const biz = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM businesses');
  if (!biz || biz.n === 0) throw new BackupError('empty');

  const snap = await snapshotDb(db);
  try {
    const bytes = await snap.bytes();
    if (bytes.length === 0) throw new BackupError('failed', 'snapshot is empty');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const storagePath = `${userId}/backup-${stamp}.db`;

    let upErr: { message: string } | null = null;
    try {
      const res = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
        contentType: 'application/x-sqlite3',
        upsert: false,
      });
      upErr = res.error;
    } catch (e) {
      throw new BackupError(isNetworkError(e) ? 'no_network' : 'failed', String(e));
    }
    if (upErr) {
      throw new BackupError(isNetworkError(upErr) ? 'no_network' : 'failed', upErr.message);
    }

    const { device_name, app_version } = deviceLabel();
    const { data: row, error: dbErr } = await supabase
      .from('backups')
      .insert({
        user_id: userId,
        file_path: storagePath,
        size_bytes: bytes.length,
        device_name,
        app_version,
      })
      .select('id, created_at')
      .single();
    if (dbErr || !row) {
      // Keep storage tidy when the row insert fails.
      try {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      } catch {
        // ignore cleanup failure
      }
      throw new BackupError(isNetworkError(dbErr) ? 'no_network' : 'failed', dbErr?.message);
    }

    await touchDevice(db, userId);
    const now = new Date().toISOString();
    await setMeta(db, 'last_backup_at', now);
    return { id: row.id as string, createdAt: row.created_at as string, sizeBytes: bytes.length };
  } finally {
    if (snap.exists) await snap.delete();
  }
}

/** Newest-first list of this user's cloud backups. */
export async function listBackups(): Promise<CloudBackupRow[]> {
  await requireUserId();
  let data: CloudBackupRow[] | null = null;
  let err: { message: string } | null = null;
  try {
    const res = await supabase
      .from('backups')
      .select('id, created_at, file_path, size_bytes, device_name, app_version')
      .order('created_at', { ascending: false });
    data = res.data as CloudBackupRow[] | null;
    err = res.error;
  } catch (e) {
    throw new BackupError(isNetworkError(e) ? 'no_network' : 'failed', String(e));
  }
  if (err) throw new BackupError(isNetworkError(err) ? 'no_network' : 'failed', err.message);
  return data ?? [];
}

/** Deletes one cloud backup (storage object + table row). */
export async function deleteBackup(row: CloudBackupRow): Promise<void> {
  await requireUserId();
  try {
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([row.file_path]);
    if (sErr) throw sErr;
    const { error: dErr } = await supabase.from('backups').delete().eq('id', row.id);
    if (dErr) throw dErr;
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError(isNetworkError(e) ? 'no_network' : 'failed', String(e));
  }
}

/**
 * Downloads a cloud backup, verifies it, and replaces the live database file.
 * The app is asked to remount its SQLiteProvider afterwards (registered via
 * onDbReloadRequest in app/_layout.tsx). The caller should show a "restored"
 * message; the UI tree rebuilds itself from the restored database.
 */
export async function restoreBackup(db: SQLiteDatabase, row: CloudBackupRow): Promise<void> {
  await requireUserId();

  let bytes: Uint8Array;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(row.file_path);
    if (error || !data) {
      throw new BackupError(isNetworkError(error) ? 'no_network' : 'failed', error?.message);
    }
    bytes = new Uint8Array(await data.arrayBuffer());
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError(isNetworkError(e) ? 'no_network' : 'failed', String(e));
  }

  // Cheap first check: SQLite magic header.
  let header = '';
  for (let i = 0; i < SQLITE_MAGIC.length && i < bytes.length; i++) {
    header += String.fromCharCode(bytes[i]);
  }
  if (header !== SQLITE_MAGIC) throw new BackupError('invalid');

  const dir = sqliteDir();
  const tmp = new File(dir, TMP_RESTORE_NAME);
  if (tmp.exists) await tmp.delete();
  await tmp.write(bytes);

  // Strong check: open the download and run integrity_check + schema version.
  const probe = await openDatabaseAsync(TMP_RESTORE_NAME);
  try {
    const chk = await probe.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    if (!chk || chk.integrity_check !== 'ok') throw new BackupError('invalid');
    const ver = await probe.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const cur = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((ver?.user_version ?? 0) > (cur?.user_version ?? 0)) throw new BackupError('newer');
  } finally {
    await probe.closeAsync();
  }

  // Swap the files. The live connection must be closed first, and stale
  // WAL sidecars must go or they will corrupt reads of the new file.
  await db.closeAsync();
  for (const suffix of ['', '-wal', '-shm']) {
    const f = new File(dir, `${DB_NAME}${suffix}`);
    if (f.exists) await f.delete();
  }
  const live = new File(dir, DB_NAME);
  await tmp.move(live);

  requestDbReload();
}

// ---------------------------------------------------------------------------
// Change-triggered cloud backup (debounced)
//
// Domain write functions (src/db/*) call markDirty(db) after a successful
// save. A full snapshot upload runs ~60s after the LAST change — the timer
// resets on every call, so 20 quick bill saves produce a single upload.
// Fire-and-forget: never throws, never blocks the caller.
//
// If the upload fails (offline, logged out), the dirty flag is kept and the
// upload is retried on the next markDirty() or when the app comes back to
// the foreground (see retryPendingBackup, wired in useAutoBackup).
// ---------------------------------------------------------------------------

const DIRTY_DEBOUNCE_MS = 60 * 1000;

let dirtyDb: SQLiteDatabase | null = null;
let dirtyTimer: ReturnType<typeof setTimeout> | null = null;

async function flushDirtyBackup(db: SQLiteDatabase): Promise<void> {
  try {
    await backupNow(db);
    // A change-triggered upload also counts for the daily safety net below.
    await setMeta(db, 'backup_last_auto', new Date().toISOString());
  } catch {
    // Stay dirty: the next markDirty() or an app-foreground retry picks it up.
    dirtyDb = db;
  }
}

/**
 * Mark local data as changed and (re)start the ~60s debounce timer.
 * Safe to call from any domain write — never throws.
 */
export function markDirty(db: SQLiteDatabase): void {
  try {
    dirtyDb = db;
    if (dirtyTimer) clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => {
      dirtyTimer = null;
      const target = dirtyDb;
      dirtyDb = null;
      if (target) void flushDirtyBackup(target);
    }, DIRTY_DEBOUNCE_MS);
  } catch {
    // Backup bookkeeping must never disturb a save.
  }
}

/**
 * App-foreground retry point: runs the pending dirty backup now, but only
 * when its debounce timer already fired (i.e. a previous upload failed and
 * the flag is still set). When the timer is still pending, it fires on its
 * own — leave it alone.
 */
export function retryPendingBackup(): void {
  try {
    if (dirtyTimer || !dirtyDb) return;
    const target = dirtyDb;
    dirtyDb = null;
    void flushDirtyBackup(target);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Auto-backup (at most once per 24h, only when the user enabled it)
// ---------------------------------------------------------------------------

export async function isAutoBackupEnabled(db: SQLiteDatabase): Promise<boolean> {
  return (await getMeta(db, 'backup_auto')) === '1';
}

export async function setAutoBackupEnabled(db: SQLiteDatabase, on: boolean): Promise<void> {
  await setMeta(db, 'backup_auto', on ? '1' : null);
}

/**
 * Called when the app goes to the background. Never throws — a failed
 * background backup must not disturb the user.
 */
export async function maybeAutoBackup(
  db: SQLiteDatabase,
): Promise<'disabled' | 'skipped' | 'ok' | 'error'> {
  try {
    if (!(await isAutoBackupEnabled(db))) return 'disabled';
    const last = await getMeta(db, 'backup_last_auto');
    if (last && Date.now() - new Date(last).getTime() < 24 * 3600 * 1000) return 'skipped';
    await backupNow(db);
    await setMeta(db, 'backup_last_auto', new Date().toISOString());
    return 'ok';
  } catch (e) {
    // 'empty' just means the user has no business yet — not worth reporting.
    if (e instanceof BackupError && e.code === 'empty') return 'skipped';
    return 'error';
  }
}
