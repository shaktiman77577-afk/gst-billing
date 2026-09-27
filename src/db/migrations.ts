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

  // v4: bills (invoices), bill lines, payments, and the bill number prefix.
  `
  ALTER TABLE businesses ADD COLUMN invoice_prefix TEXT NOT NULL DEFAULT 'INV';

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'tax_invoice',
    prefix TEXT NOT NULL,
    fy TEXT NOT NULL,
    seq INTEGER NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT,
    party_id TEXT,
    party_name TEXT NOT NULL,
    party_phone TEXT,
    party_gstin TEXT,
    party_state_code TEXT,
    billing_address TEXT,
    shipping_address TEXT,
    place_of_supply TEXT NOT NULL,
    is_igst INTEGER NOT NULL DEFAULT 0,
    discount_paise INTEGER NOT NULL DEFAULT 0,
    taxable_paise INTEGER NOT NULL DEFAULT 0,
    cgst_paise INTEGER NOT NULL DEFAULT 0,
    sgst_paise INTEGER NOT NULL DEFAULT 0,
    igst_paise INTEGER NOT NULL DEFAULT 0,
    charges_label TEXT,
    charges_paise INTEGER NOT NULL DEFAULT 0,
    round_off INTEGER NOT NULL DEFAULT 1,
    round_off_paise INTEGER NOT NULL DEFAULT 0,
    total_paise INTEGER NOT NULL DEFAULT 0,
    received_paise INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid',
    po_no TEXT,
    vehicle_no TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id, deleted_at, invoice_date);
  CREATE INDEX IF NOT EXISTS idx_invoices_party ON invoices(party_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_seq ON invoices(business_id, fy, seq);

  CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY NOT NULL,
    invoice_id TEXT NOT NULL,
    item_id TEXT,
    item_type TEXT NOT NULL DEFAULT 'product',
    name TEXT NOT NULL,
    hsn TEXT,
    unit TEXT NOT NULL,
    qty REAL NOT NULL,
    rate_paise INTEGER NOT NULL,
    rate_with_tax INTEGER NOT NULL DEFAULT 0,
    discount_type TEXT NOT NULL DEFAULT 'pct',
    discount_value REAL NOT NULL DEFAULT 0,
    gst_rate REAL NOT NULL DEFAULT 0,
    discount_paise INTEGER NOT NULL DEFAULT 0,
    taxable_paise INTEGER NOT NULL DEFAULT 0,
    tax_paise INTEGER NOT NULL DEFAULT 0,
    amount_paise INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id, deleted_at);

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    invoice_id TEXT,
    party_id TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    amount_paise INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'cash',
    paid_on TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_payments_party ON payments(party_id, deleted_at);
  `,

  // v5: bill design settings (template, colour, logo, signature, bank, UPI, terms).
  `
  ALTER TABLE businesses ADD COLUMN template TEXT NOT NULL DEFAULT 'simple';
  ALTER TABLE businesses ADD COLUMN theme_color TEXT NOT NULL DEFAULT '#1E3A8A';
  ALTER TABLE businesses ADD COLUMN logo TEXT;
  ALTER TABLE businesses ADD COLUMN signature TEXT;
  ALTER TABLE businesses ADD COLUMN bank_account_name TEXT;
  ALTER TABLE businesses ADD COLUMN bank_account_no TEXT;
  ALTER TABLE businesses ADD COLUMN bank_ifsc TEXT;
  ALTER TABLE businesses ADD COLUMN bank_name TEXT;
  ALTER TABLE businesses ADD COLUMN upi_id TEXT;
  ALTER TABLE businesses ADD COLUMN terms TEXT;
  ALTER TABLE businesses ADD COLUMN tagline TEXT;
  `,

  // v6: payments in/out with grouping, cancelled bills, credit notes.
  `
  ALTER TABLE invoices ADD COLUMN kind TEXT NOT NULL DEFAULT 'invoice';
  ALTER TABLE invoices ADD COLUMN ref_invoice_id TEXT;
  ALTER TABLE invoices ADD COLUMN ref_invoice_no TEXT;
  ALTER TABLE invoices ADD COLUMN credited_paise INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE invoices ADD COLUMN cancelled_at TEXT;
  ALTER TABLE payments ADD COLUMN direction TEXT NOT NULL DEFAULT 'in';
  ALTER TABLE payments ADD COLUMN group_id TEXT;

  CREATE INDEX IF NOT EXISTS idx_invoices_kind_seq ON invoices(business_id, kind, fy, seq);
  CREATE INDEX IF NOT EXISTS idx_invoices_ref ON invoices(ref_invoice_id);
  `,

  // v7: expenses (kharcha tracking). Money is stored in paise (integer).
  `
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    note TEXT,
    payment_mode TEXT NOT NULL DEFAULT 'cash',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_business_date ON expenses(business_id, date);
  `,

  // v8: purchase bills (kharid). Stock comes IN here. Purchases never touch
  // invoices, payments, GST reports or party balances, so they live in their
  // own tables. Money is stored in paise (integer).
  `
  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    party_id TEXT,
    party_name TEXT NOT NULL,
    supplier_bill_no TEXT,
    total_paise INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_purchases_business ON purchases(business_id, deleted_at, purchase_date);
  CREATE INDEX IF NOT EXISTS idx_purchases_party ON purchases(party_id);

  CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY NOT NULL,
    purchase_id TEXT NOT NULL,
    item_id TEXT,
    item_type TEXT NOT NULL DEFAULT 'product',
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    qty REAL NOT NULL,
    rate_paise INTEGER NOT NULL,
    amount_paise INTEGER NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id, deleted_at);
  `,

  // v9: per-series auto-number floor ("Next bill number" in Bill settings).
  // The invoice counter itself stays derived from MAX(seq) so numbers are
  // never reused; this table only stores an optional floor that raises it.
  `
  CREATE TABLE IF NOT EXISTS invoice_series (
    business_id TEXT NOT NULL,
    fy TEXT NOT NULL,
    kind TEXT NOT NULL,
    next_seq INTEGER NOT NULL,
    PRIMARY KEY (business_id, fy, kind)
  );
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
