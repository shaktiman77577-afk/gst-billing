import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '../lib/id';
import { getMeta, setMeta } from './meta';

// Tables saved in a backup, in the order they are restored.
const TABLES = ['businesses', 'parties', 'items', 'invoices', 'invoice_items', 'payments'] as const;
type Table = (typeof TABLES)[number];

export const BACKUP_APP = 'gst-billing';
export const BACKUP_FORMAT = 1;

export type BackupFile = {
  app: string;
  format: number;
  schema: number; // database version the backup came from
  created_at: string;
  email: string | null;
  tables: Record<Table, Record<string, unknown>[]>;
};

export type BackupSummary = {
  createdAt: string;
  email: string | null;
  businesses: string[];
  parties: number;
  items: number;
  bills: number;
};

async function schemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/** Everything belonging to this user's businesses (deleted rows too, for future sync). */
export async function exportBackup(db: SQLiteDatabase, userId: string): Promise<BackupFile> {
  const businesses = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM businesses WHERE user_id = ?', userId);
  const ids = businesses.map((b) => String(b.id));
  const inList = ids.map(() => '?').join(',') || "''";
  const byBusiness = (table: string) =>
    db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table} WHERE business_id IN (${inList})`, ...ids);
  const invoices = await byBusiness('invoices');
  const invoiceIds = invoices.map((i) => String(i.id));
  const lines: Record<string, unknown>[] = [];
  // Chunked to stay under SQLite's parameter limit.
  for (let i = 0; i < invoiceIds.length; i += 500) {
    const chunk = invoiceIds.slice(i, i + 500);
    lines.push(
      ...(await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM invoice_items WHERE invoice_id IN (${chunk.map(() => '?').join(',')})`,
        ...chunk,
      )),
    );
  }
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schema: await schemaVersion(db),
    created_at: nowIso(),
    email: await getMeta(db, 'email'),
    tables: {
      businesses,
      parties: await byBusiness('parties'),
      items: await byBusiness('items'),
      invoices,
      invoice_items: lines,
      payments: await byBusiness('payments'),
    },
  };
}

export type ParseResult = { ok: true; data: BackupFile; summary: BackupSummary } | { ok: false; reason: 'invalid' | 'newer' };

export async function parseBackup(db: SQLiteDatabase, text: string): Promise<ParseResult> {
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!data || data.app !== BACKUP_APP || typeof data.tables !== 'object' || !Array.isArray(data.tables.businesses)) {
    return { ok: false, reason: 'invalid' };
  }
  // A backup from a newer app version may have data this app doesn't understand.
  if (data.format > BACKUP_FORMAT || data.schema > (await schemaVersion(db))) return { ok: false, reason: 'newer' };
  const live = (rows: Record<string, unknown>[] | undefined) => (rows ?? []).filter((r) => !r.deleted_at);
  return {
    ok: true,
    data,
    summary: {
      createdAt: data.created_at,
      email: data.email,
      businesses: live(data.tables.businesses).map((b) => String(b.name)),
      parties: live(data.tables.parties).length,
      items: live(data.tables.items).length,
      bills: live(data.tables.invoices).length,
    },
  };
}

/**
 * Replaces all data on this phone with the backup.
 * Businesses are given to the logged-in user. Returns the business to open.
 */
export async function restoreBackup(db: SQLiteDatabase, data: BackupFile, userId: string): Promise<string | null> {
  await db.withTransactionAsync(async () => {
    for (const table of [...TABLES].reverse()) await db.runAsync(`DELETE FROM ${table}`);
    for (const table of TABLES) {
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      const known = new Set(cols.map((c) => c.name));
      for (const row of data.tables[table] ?? []) {
        const r = table === 'businesses' ? { ...row, user_id: userId } : row;
        const keys = Object.keys(r).filter((k) => known.has(k));
        if (!keys.length) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          ...keys.map((k) => (r[k] ?? null) as string | number | null),
        );
      }
    }
  });
  const first = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM businesses WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1',
    userId,
  );
  await setMeta(db, 'last_backup_at', data.created_at);
  return first?.id ?? null;
}

export async function lastBackupAt(db: SQLiteDatabase): Promise<string | null> {
  return getMeta(db, 'last_backup_at');
}

export async function markBackedUp(db: SQLiteDatabase): Promise<void> {
  await setMeta(db, 'last_backup_at', nowIso());
}

/** Show a reminder if there is data worth saving and no backup in 7 days. */
export async function needsBackupReminder(db: SQLiteDatabase, businessId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM invoices WHERE business_id = ? AND deleted_at IS NULL',
    businessId,
  );
  if ((row?.n ?? 0) < 3) return false;
  const last = await lastBackupAt(db);
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > 7 * 24 * 60 * 60 * 1000;
}
