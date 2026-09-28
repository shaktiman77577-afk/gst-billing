// Row-level cloud sync (Supabase table public.sync_rows).
//
// PUSH — every local change is merged into the cloud a few seconds later:
//   rows whose updated_at is newer than the last push are sent to the
//   sync_push RPC in chunks. Soft deletes travel as normal rows (deleted_at
//   set); permanent deletes travel as tombstones (table sync_tombstones).
//   The server keeps the newest version of each row.
// PULL — used when a phone logs in with an empty database: every row of the
//   user is downloaded and written locally (parents before children).
//
// One phone per account is active (see device.ts), so there are no
// two-phone conflicts: the server refuses uploads from a replaced phone.
import type { SQLiteDatabase } from 'expo-sqlite';
import { getMeta, setMeta } from '../db/meta';
import { getDeviceId } from '../lib/deviceId';
import { supabase } from '../lib/supabase';
import { isDeviceReplacedError, reportDeviceReplaced } from './device';

/** Synced tables, parents first (also the order used when writing a pull). */
export const SYNC_TABLES = [
  'businesses',
  'parties',
  'items',
  'invoices',
  'invoice_items',
  'payments',
  'purchases',
  'purchase_items',
  'expenses',
] as const;
type SyncTable = (typeof SYNC_TABLES)[number];

/** app_meta keys that belong to the user's data and must follow them. */
const SYNC_META_KEYS = ['expense_categories'] as const;

const CHUNK = 200;
const PAGE = 1000;
const DEBOUNCE_MS = 5 * 1000;

type PushRow = { tbl: string; id: string; updated_at: string; deleted: boolean; data: Record<string, unknown> };

export type SyncErrorCode = 'no_session' | 'no_network' | 'replaced' | 'failed';
export class SyncError extends Error {
  code: SyncErrorCode;
  constructor(code: SyncErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: unknown })?.message ?? e ?? '');
  return /network|fetch|timed? ?out|offline|failed to connect/i.test(msg);
}

function toError(e: unknown): SyncError {
  if (e instanceof SyncError) return e;
  if (isDeviceReplacedError(e)) return new SyncError('replaced');
  return new SyncError(isNetworkError(e) ? 'no_network' : 'failed', String((e as { message?: unknown })?.message ?? e));
}

async function currentUserId(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new SyncError('no_session');
    return id;
  } catch (e) {
    throw toError(e);
  }
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

async function collectChanges(db: SQLiteDatabase): Promise<{ rows: PushRow[]; maxTs: string | null; tombs: number }> {
  const since = await getMeta(db, 'sync_pushed_at');
  const rows: PushRow[] = [];
  let maxTs = since;

  for (const tbl of SYNC_TABLES) {
    const list = since
      ? await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${tbl} WHERE updated_at > ?`, since)
      : await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${tbl}`);
    for (const r of list) {
      const ts = String(r.updated_at ?? '');
      if (!r.id || !ts) continue;
      rows.push({ tbl, id: String(r.id), updated_at: ts, deleted: false, data: r });
      if (!maxTs || ts > maxTs) maxTs = ts;
    }
  }

  const tombs = await db.getAllAsync<{ tbl: string; row_id: string; deleted_at: string }>(
    'SELECT tbl, row_id, deleted_at FROM sync_tombstones',
  );
  for (const t of tombs) {
    rows.push({ tbl: t.tbl, id: t.row_id, updated_at: t.deleted_at, deleted: true, data: {} });
  }

  // Nothing changed in the data → skip the small extras as well.
  if (rows.length === 0) return { rows, maxTs, tombs: 0 };

  const now = new Date().toISOString();
  // Bill number counters: the server keeps the biggest next_seq.
  const series = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM invoice_series');
  for (const s of series) {
    rows.push({
      tbl: 'invoice_series',
      id: `${s.business_id}|${s.fy}|${s.kind}`,
      updated_at: now,
      deleted: false,
      data: s,
    });
  }
  for (const key of SYNC_META_KEYS) {
    const value = await getMeta(db, key);
    if (value !== null) rows.push({ tbl: 'app_meta', id: key, updated_at: now, deleted: false, data: { key, value } });
  }
  return { rows, maxTs, tombs: tombs.length };
}

/** Sends every local change to the cloud. Returns the number of rows sent. */
export async function pushChanges(db: SQLiteDatabase): Promise<number> {
  await currentUserId();
  const deviceId = await getDeviceId();
  const { rows, maxTs, tombs } = await collectChanges(db);
  if (rows.length === 0) return 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    let error: unknown = null;
    try {
      const res = await supabase.rpc('sync_push', { p_rows: chunk, p_device_id: deviceId });
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      const err = toError(error);
      if (err.code === 'replaced') reportDeviceReplaced();
      throw err;
    }
  }

  if (maxTs) await setMeta(db, 'sync_pushed_at', maxTs);
  if (tombs) await db.runAsync('DELETE FROM sync_tombstones');
  await setMeta(db, 'sync_last_ok', new Date().toISOString());
  await setMeta(db, 'sync_last_error', null);
  return rows.length;
}

/** Local changes not yet in the cloud? */
export async function hasUnsyncedChanges(db: SQLiteDatabase): Promise<boolean> {
  const since = await getMeta(db, 'sync_pushed_at');
  const tomb = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_tombstones');
  if ((tomb?.n ?? 0) > 0) return true;
  for (const tbl of SYNC_TABLES) {
    const r = since
      ? await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tbl} WHERE updated_at > ?`, since)
      : await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tbl}`);
    if ((r?.n ?? 0) > 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Debounced push (called from markDirty after every save)
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingDb: SQLiteDatabase | null = null;
let running: Promise<void> | null = null;

async function runPush(db: SQLiteDatabase): Promise<void> {
  if (running) {
    // A push is already going: run once more after it, to catch late changes.
    pendingDb = db;
    return;
  }
  running = (async () => {
    try {
      // Not logged in (login screen, after logout): nothing to upload.
      if (!(await getMeta(db, 'user_id'))) return;
      await pushChanges(db);
    } catch (e) {
      const code = toError(e).code;
      if (code !== 'replaced') {
        pendingDb = db; // retried on the next change / app foreground
        try {
          await setMeta(db, 'sync_last_error', code);
        } catch {
          // ignore
        }
      }
    } finally {
      running = null;
    }
  })();
  await running;
}

/** Upload changes ~5s after the last save. Never throws. */
export function scheduleSync(db: SQLiteDatabase): void {
  try {
    pendingDb = db;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const target = pendingDb;
      pendingDb = null;
      if (target) void runPush(target);
    }, DEBOUNCE_MS);
  } catch {
    // never disturb a save
  }
}

/** Upload right now (app going to background, logout). Never throws. */
export async function flushSyncNow(db?: SQLiteDatabase): Promise<void> {
  try {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const target = db ?? pendingDb;
    pendingDb = null;
    if (target) await runPush(target);
  } catch {
    // ignore
  }
}

/** Retry a failed upload (app back in foreground). Never throws. */
export function retrySync(): void {
  if (timer || !pendingDb) return;
  const target = pendingDb;
  pendingDb = null;
  void runPush(target);
}

/** Forget queued work (logout / wipe). */
export function cancelSync(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingDb = null;
}

// ---------------------------------------------------------------------------
// Pull (restore on a phone with an empty database)
// ---------------------------------------------------------------------------

type RemoteRow = { tbl: string; row_id: string; updated_at: string; deleted: boolean; data: Record<string, unknown>; seq: number };

const columnCache = new Map<string, Set<string>>();
async function tableColumns(db: SQLiteDatabase, tbl: string): Promise<Set<string>> {
  let cols = columnCache.get(tbl);
  if (!cols) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tbl})`);
    cols = new Set(info.map((c) => c.name));
    columnCache.set(tbl, cols);
  }
  return cols;
}

async function upsertRow(db: SQLiteDatabase, tbl: SyncTable, data: Record<string, unknown>, remoteTs: string) {
  const cols = await tableColumns(db, tbl);
  const keys = Object.keys(data).filter((k) => cols.has(k));
  if (!keys.includes('id')) return false;
  const local = await db.getFirstAsync<{ updated_at: string | null }>(
    `SELECT updated_at FROM ${tbl} WHERE id = ?`,
    String(data.id),
  );
  if (local?.updated_at && Date.parse(local.updated_at) >= Date.parse(remoteTs)) return false;
  const values = keys.map((k) => {
    const v = data[k];
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v !== null && typeof v === 'object') return JSON.stringify(v);
    return v as string | number | null;
  });
  const set = keys.filter((k) => k !== 'id').map((k) => `${k} = excluded.${k}`);
  await db.runAsync(
    `INSERT INTO ${tbl} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})` +
      (set.length ? ` ON CONFLICT(id) DO UPDATE SET ${set.join(', ')}` : ' ON CONFLICT(id) DO NOTHING'),
    ...values,
  );
  return true;
}

export type PullResult = { rows: number; businesses: number };

/** Downloads every cloud row of the user and writes it locally. */
export async function pullAll(db: SQLiteDatabase): Promise<PullResult> {
  const userId = await currentUserId();
  const all: RemoteRow[] = [];
  let after = 0;
  for (;;) {
    let res;
    try {
      res = await supabase
        .from('sync_rows')
        .select('tbl, row_id, updated_at, deleted, data, seq')
        .eq('user_id', userId)
        .gt('seq', after)
        .order('seq', { ascending: true })
        .limit(PAGE);
    } catch (e) {
      throw toError(e);
    }
    if (res.error) throw toError(res.error);
    const page = (res.data ?? []) as RemoteRow[];
    all.push(...page);
    if (page.length < PAGE) break;
    after = page[page.length - 1].seq;
  }
  if (all.length === 0) return { rows: 0, businesses: 0 };

  const order = new Map<string, number>(SYNC_TABLES.map((t, i) => [t, i]));
  all.sort((a, b) => (order.get(a.tbl) ?? 99) - (order.get(b.tbl) ?? 99));

  let written = 0;
  let maxTs = null as string | null;
  let maxSeq = 0;
  // Rows arrive in any order (credit note before its bill, etc.), so foreign
  // keys are checked only after everything is written.
  await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await db.withTransactionAsync(async () => {
      for (const r of all) {
        maxSeq = Math.max(maxSeq, Number(r.seq) || 0);
        if (order.has(r.tbl)) {
          const tbl = r.tbl as SyncTable;
          if (r.deleted) {
            await db.runAsync(`DELETE FROM ${tbl} WHERE id = ?`, r.row_id);
            continue;
          }
          if (await upsertRow(db, tbl, r.data, r.updated_at)) written++;
          const ts = String(r.data.updated_at ?? '');
          if (ts && (!maxTs || ts > maxTs)) maxTs = ts;
        } else if (r.tbl === 'invoice_series' && !r.deleted) {
          const d = r.data;
          await db.runAsync(
            `INSERT INTO invoice_series (business_id, fy, kind, next_seq) VALUES (?, ?, ?, ?)
             ON CONFLICT(business_id, fy, kind) DO UPDATE SET next_seq = MAX(next_seq, excluded.next_seq)`,
            String(d.business_id),
            String(d.fy),
            String(d.kind),
            Number(d.next_seq) || 0,
          );
        } else if (r.tbl === 'app_meta' && !r.deleted) {
          const key = r.row_id as (typeof SYNC_META_KEYS)[number];
          if ((SYNC_META_KEYS as readonly string[]).includes(key)) {
            await setMeta(db, key, r.data.value == null ? null : String(r.data.value));
          }
        }
      }
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON');
  }

  await setMeta(db, 'sync_pulled_seq', String(maxSeq));
  // Rows that came from the cloud do not need to be uploaded again.
  const pushed = await getMeta(db, 'sync_pushed_at');
  if (maxTs && (!pushed || maxTs > pushed)) await setMeta(db, 'sync_pushed_at', maxTs);
  await setMeta(db, 'sync_last_ok', new Date().toISOString());

  const biz = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM businesses WHERE user_id = ? AND deleted_at IS NULL',
    userId,
  );
  return { rows: written, businesses: biz?.n ?? 0 };
}

/** Does the cloud hold synced rows for this user? */
export async function cloudHasSyncData(): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const userId = await currentUserId();
    const { data, error } = await supabase.from('sync_rows').select('row_id').eq('user_id', userId).limit(1);
    if (error) return 'unknown';
    return data && data.length > 0 ? 'yes' : 'no';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Wipe (logout / phone replaced)
// ---------------------------------------------------------------------------

const WIPE_ORDER = [
  'purchase_items',
  'purchases',
  'payments',
  'invoice_items',
  'invoices',
  'expenses',
  'items',
  'parties',
  'invoice_series',
  'businesses',
  'sync_tombstones',
];

const WIPE_META = [
  'user_id',
  'email',
  'active_business_id',
  'last_backup_at',
  'last_backup_error',
  'sync_pushed_at',
  'sync_pulled_seq',
  'sync_last_ok',
  'sync_last_error',
  'backup_auto',
  'backup_last_auto',
  'expense_categories',
] as const;

/** Removes all business data from this phone (the cloud keeps it). */
export async function wipeLocalData(db: SQLiteDatabase): Promise<void> {
  cancelSync();
  await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await db.withTransactionAsync(async () => {
      for (const t of WIPE_ORDER) await db.runAsync(`DELETE FROM ${t}`);
      for (const k of WIPE_META) await setMeta(db, k, null);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON');
  }
}
