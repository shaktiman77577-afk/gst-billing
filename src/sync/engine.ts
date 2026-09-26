// Cloud sync: send changed rows to the server, and download them on a new phone.
// Every row has a unique id and an updated_at time, so sending twice is harmless
// and the newest copy always wins.
import { getAuth } from '@react-native-firebase/auth';
import type { SQLiteDatabase } from 'expo-sqlite';
import { SYNC_URL } from '../config';
import { getMeta, setMeta } from '../db/meta';

const TABLES = ['businesses', 'parties', 'items', 'invoices', 'invoice_items', 'payments'] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown> & { id: string; updated_at: string };
type Remote = { tbl: Table; id: string; updated_at: string; data: Record<string, unknown> };

const CHUNK = 200;
const TIMEOUT_MS = 20000;

export const syncEnabled = () => SYNC_URL.trim().length > 0;

export class OfflineError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('not logged in');
  const token = await user.getIdToken().catch(() => {
    throw new OfflineError('token');
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${SYNC_URL.replace(/\/$/, '')}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new OfflineError('network');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`server ${res.status}`);
  return (await res.json()) as T;
}

// Rows that belong to this user's businesses.
async function scopedRows(db: SQLiteDatabase, userId: string, table: Table, since: string): Promise<Row[]> {
  if (table === 'businesses') {
    return db.getAllAsync<Row>('SELECT * FROM businesses WHERE user_id = ? AND updated_at > ?', userId, since);
  }
  const mine = 'SELECT id FROM businesses WHERE user_id = ?';
  if (table === 'invoice_items') {
    return db.getAllAsync<Row>(
      `SELECT ii.* FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.business_id IN (${mine}) AND ii.updated_at > ?`,
      userId,
      since,
    );
  }
  return db.getAllAsync<Row>(`SELECT * FROM ${table} WHERE business_id IN (${mine}) AND updated_at > ?`, userId, since);
}

/** Is there anything changed locally that the cloud doesn't have yet? */
export async function hasPending(db: SQLiteDatabase, userId: string): Promise<boolean> {
  const since = (await getMeta(db, 'sync_pushed_at')) ?? '';
  for (const t of TABLES) {
    if ((await scopedRows(db, userId, t, since)).length) return true;
  }
  return false;
}

/** Sends every row changed since the last successful push. */
export async function pushChanges(db: SQLiteDatabase, userId: string): Promise<number> {
  const since = (await getMeta(db, 'sync_pushed_at')) ?? '';
  const all: Remote[] = [];
  let newest = since;
  for (const t of TABLES) {
    for (const r of await scopedRows(db, userId, t, since)) {
      all.push({ tbl: t, id: r.id, updated_at: r.updated_at, data: r });
      if (r.updated_at > newest) newest = r.updated_at;
    }
  }
  for (let i = 0; i < all.length; i += CHUNK) {
    await call('/sync/push', { method: 'POST', body: JSON.stringify({ records: all.slice(i, i + CHUNK) }) });
  }
  if (newest !== since) await setMeta(db, 'sync_pushed_at', newest);
  await setMeta(db, 'sync_last_ok', new Date().toISOString());
  return all.length;
}

const columnCache: Partial<Record<Table, Set<string>>> = {};
async function columns(db: SQLiteDatabase, t: Table): Promise<Set<string>> {
  if (!columnCache[t]) {
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`);
    columnCache[t] = new Set(cols.map((c) => c.name));
  }
  return columnCache[t]!;
}

/** Downloads cloud rows newer than what this phone has. Returns rows applied. */
export async function pullChanges(db: SQLiteDatabase, userId: string): Promise<number> {
  let cursor = Number((await getMeta(db, 'sync_pulled_seq')) ?? 0);
  let applied = 0;
  let newest = (await getMeta(db, 'sync_pushed_at')) ?? '';
  for (let page = 0; page < 1000; page++) {
    const res = await call<{ records: Remote[]; cursor: number; more: boolean }>(`/sync/pull?since=${cursor}`);
    // Parents first so screens never see a bill line without its bill.
    const ordered = [...res.records].sort((a, b) => TABLES.indexOf(a.tbl) - TABLES.indexOf(b.tbl));
    await db.withTransactionAsync(async () => {
      for (const r of ordered) {
        if (!TABLES.includes(r.tbl)) continue;
        const local = await db.getFirstAsync<{ updated_at: string }>(
          `SELECT updated_at FROM ${r.tbl} WHERE id = ?`,
          r.id,
        );
        if (local && local.updated_at >= r.updated_at) continue; // phone already has this or newer
        const known = await columns(db, r.tbl);
        const data = r.tbl === 'businesses' ? { ...r.data, user_id: userId } : r.data;
        const keys = Object.keys(data).filter((k) => known.has(k));
        if (!keys.length) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO ${r.tbl} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          ...keys.map((k) => (data[k] ?? null) as string | number | null),
        );
        applied++;
        if (r.updated_at > newest) newest = r.updated_at;
      }
    });
    cursor = res.cursor;
    await setMeta(db, 'sync_pulled_seq', String(cursor));
    if (!res.more) break;
  }
  // Downloaded rows don't need to be sent back.
  await setMeta(db, 'sync_pushed_at', newest || null);
  await setMeta(db, 'sync_last_ok', new Date().toISOString());
  return applied;
}

/** Push local changes, then pull anything new. */
export async function syncAll(db: SQLiteDatabase, userId: string): Promise<void> {
  await pushChanges(db, userId);
  await pullChanges(db, userId);
}

/** Forget sync progress (used on logout / new login on this phone). */
export async function resetSyncState(db: SQLiteDatabase): Promise<void> {
  await setMeta(db, 'sync_pushed_at', null);
  await setMeta(db, 'sync_pulled_seq', null);
  await setMeta(db, 'sync_last_ok', null);
}
