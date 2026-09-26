import type { SQLiteDatabase } from 'expo-sqlite';

// Each entry upgrades the phone database by one version.
// Never edit an old entry after release — add a new one at the end.
const MIGRATIONS: string[] = [
  // v1: app settings + businesses
  `
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    gst_registered INTEGER NOT NULL DEFAULT 0,
    gstin TEXT,
    pan TEXT,
    state_code TEXT NOT NULL,
    address TEXT,
    city TEXT,
    pincode TEXT,
    business_type TEXT NOT NULL DEFAULT 'retail',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id);
  `,
];

export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
