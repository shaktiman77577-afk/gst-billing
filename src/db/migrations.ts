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

  // v2: parties (customers & suppliers). Money is stored in paise (integer).
  `
  CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    party_type TEXT NOT NULL DEFAULT 'customer',
    gstin TEXT,
    state_code TEXT,
    billing_address TEXT,
    shipping_address TEXT,
    same_shipping INTEGER NOT NULL DEFAULT 1,
    opening_balance_paise INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_parties_business ON parties(business_id, deleted_at);
  `,

  // v3: items (products & services).
  `
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'product',
    unit TEXT NOT NULL DEFAULT 'PCS',
    sales_price_paise INTEGER NOT NULL DEFAULT 0,
    sales_price_with_tax INTEGER NOT NULL DEFAULT 0,
    purchase_price_paise INTEGER,
    gst_rate REAL NOT NULL DEFAULT 0,
    hsn TEXT,
    opening_stock REAL NOT NULL DEFAULT 0,
    stock_qty REAL NOT NULL DEFAULT 0,
    low_stock_qty REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_items_business ON items(business_id, deleted_at);
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
