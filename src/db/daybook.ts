// Daybook (date-wise money log) — read-only queries. No writes, no schema changes.
//
// Money IN  = live sales invoices for the day + payments received that day.
// Money OUT = expenses for the day + purchases for the day.
// A bill paid in cash on the same day it was raised appears in BOTH the sales
// section and the payments section — that is standard daybook behaviour: one
// section is the sales ledger, the other is the cash receipt.
//
// Split payments: recordPayment() writes one payments row per invoice a payment
// is adjusted against, all sharing one group_id. Grouping by
// COALESCE(group_id, id) keeps such a payment counted exactly once.
// The purchases section reads F1's `purchases` table only if it exists
// (sqlite_master guard + PRAGMA column discovery), so this degrades gracefully
// on databases where the F1 migration has not run yet.
import type { SQLiteDatabase } from 'expo-sqlite';
import { Expense, listExpenses } from './expenses';

export type DaybookSale = {
  id: string;
  invoice_no: string;
  party_name: string;
  total_paise: number;
};

export type DaybookPaymentIn = {
  id: string; // group key: group_id, or the row id for single payments
  party_name: string | null;
  mode: string;
  amount_paise: number;
  splits: number; // payment rows merged into this entry
  note: string | null;
};

export type DaybookPurchase = {
  id: string;
  bill_no: string;
  party_name: string | null;
  total_paise: number;
  note: string | null;
};

export type Daybook = {
  date: string;
  sales: DaybookSale[];
  paymentsIn: DaybookPaymentIn[];
  expenses: Expense[];
  purchases: DaybookPurchase[];
  purchasesAvailable: boolean;
  totalIn: number;
  totalOut: number;
  net: number;
};

async function tableExists(db: SQLiteDatabase, name: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
    name,
  );
  return (row?.n ?? 0) > 0;
}

// Purchases come from the F1 feature's table. The exact F1 column names are not
// fixed yet, so discover them from PRAGMA table_info and map the most likely
// candidates. Expected F1 `purchases` columns (integrator: please verify):
//   id TEXT, business_id TEXT, bill_no TEXT (bill/invoice/reference number),
//   purchase_date TEXT (or bill_date / date) YYYY-MM-DD,
//   party_name TEXT (or supplier_name), total_paise INTEGER, note TEXT, deleted_at TEXT.
async function listPurchases(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<{ rows: DaybookPurchase[]; available: boolean }> {
  if (!(await tableExists(db, 'purchases'))) return { rows: [], available: false };
  try {
    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(purchases)');
    const names = new Set(cols.map((c) => c.name));
    const pick = (...cands: string[]): string | null => cands.find((c) => names.has(c)) ?? null;
    const dateCol = pick('purchase_date', 'bill_date', 'invoice_date', 'date');
    const totalCol = pick('total_paise', 'grand_total_paise', 'amount_paise', 'bill_total_paise');
    if (!dateCol || !totalCol) return { rows: [], available: false };
    const noCol = pick('bill_no', 'invoice_no', 'reference', 'reference_no', 'number');
    const partyCol = pick('party_name', 'supplier_name', 'party', 'supplier');
    const noteCol = pick('note', 'notes', 'remarks');
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (names.has('business_id')) {
      where.push('business_id = ?');
      params.push(businessId);
    }
    if (names.has('deleted_at')) where.push('deleted_at IS NULL');
    // Purchase returns (v10) are money coming back, not kharid — keep them
    // out of the day's purchases. Guarded so old databases keep working.
    if (names.has('kind')) where.push(`(kind IS NULL OR kind = 'purchase')`);
    where.push(`${dateCol} >= ? AND ${dateCol} <= ?`);
    params.push(from, to);
    const rows = await db.getAllAsync<DaybookPurchase>(
      `SELECT ${names.has('id') ? 'id' : `'x' AS id`},
              ${noCol ? `${noCol}` : `'—'`} AS bill_no,
              ${partyCol ? `${partyCol}` : 'NULL'} AS party_name,
              ${totalCol} AS total_paise,
              ${noteCol ? `${noteCol}` : 'NULL'} AS note
       FROM purchases
       WHERE ${where.join(' AND ')}
       ORDER BY ${noCol ?? 'rowid'}`,
      ...params,
    );
    return { rows, available: true };
  } catch {
    // Column shape we can't read — treat as unavailable rather than crash.
    return { rows: [], available: false };
  }
}

/** Full daybook for one business and one YYYY-MM-DD date. */
export async function getDaybook(
  db: SQLiteDatabase,
  businessId: string,
  date: string,
): Promise<Daybook> {
  // Live sales only: quotations, delivery challans, deleted and cancelled bills never count.
  const sales = await db.getAllAsync<DaybookSale>(
    `SELECT id, invoice_no, party_name, total_paise
     FROM invoices
     WHERE business_id = ? AND kind = 'invoice' AND doc_type NOT IN ('quotation', 'delivery_challan')
       AND deleted_at IS NULL AND cancelled_at IS NULL AND invoice_date = ?
     ORDER BY invoice_no`,
    businessId,
    date,
  );

  // Payments received, one entry per payment (split payments merged by group_id).
  const paymentsIn = await db.getAllAsync<DaybookPaymentIn>(
    `SELECT g.gid AS id, pa.name AS party_name, g.mode, g.amount_paise, g.splits, g.note
     FROM (
       SELECT COALESCE(group_id, id) AS gid,
              MAX(party_id) AS party_id,
              MAX(mode) AS mode,
              SUM(amount_paise) AS amount_paise,
              COUNT(*) AS splits,
              MAX(notes) AS note,
              MIN(created_at) AS first_at
       FROM payments
       WHERE business_id = ? AND direction = 'in' AND deleted_at IS NULL AND paid_on = ?
       GROUP BY gid
     ) g
     LEFT JOIN parties pa ON pa.id = g.party_id
     ORDER BY g.first_at`,
    businessId,
    date,
  );

  const expenses = await listExpenses(db, businessId, date, date);
  const { rows: purchases, available: purchasesAvailable } = await listPurchases(db, businessId, date, date);

  const sum = (xs: { amount_paise?: number; total_paise?: number }[]): number =>
    xs.reduce((a, x) => a + (x.total_paise ?? x.amount_paise ?? 0), 0);
  const salesTotal = sum(sales);
  const receivedTotal = sum(paymentsIn);
  const expenseTotal = sum(expenses);
  const purchaseTotal = sum(purchases);
  const totalIn = salesTotal + receivedTotal;
  const totalOut = expenseTotal + purchaseTotal;

  return {
    date,
    sales,
    paymentsIn,
    expenses,
    purchases,
    purchasesAvailable,
    totalIn,
    totalOut,
    net: totalIn - totalOut,
  };
}

/** Full daybook aggregated over an inclusive YYYY-MM-DD range (same sections
 *  and money rules as getDaybook — read-only, no schema changes). */
export async function getDaybookRange(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<Daybook> {
  // Live sales only: quotations, delivery challans, deleted and cancelled bills never count.
  const sales = await db.getAllAsync<DaybookSale>(
    `SELECT id, invoice_no, party_name, total_paise
     FROM invoices
     WHERE business_id = ? AND kind = 'invoice' AND doc_type NOT IN ('quotation', 'delivery_challan')
       AND deleted_at IS NULL AND cancelled_at IS NULL
       AND invoice_date >= ? AND invoice_date <= ?
     ORDER BY invoice_date DESC, invoice_no`,
    businessId,
    from,
    to,
  );

  // Payments received, one entry per payment (split payments merged by group_id).
  const paymentsIn = await db.getAllAsync<DaybookPaymentIn>(
    `SELECT g.gid AS id, pa.name AS party_name, g.mode, g.amount_paise, g.splits, g.note
     FROM (
       SELECT COALESCE(group_id, id) AS gid,
              MAX(party_id) AS party_id,
              MAX(mode) AS mode,
              SUM(amount_paise) AS amount_paise,
              COUNT(*) AS splits,
              MAX(notes) AS note,
              MIN(created_at) AS first_at
       FROM payments
       WHERE business_id = ? AND direction = 'in' AND deleted_at IS NULL
         AND paid_on >= ? AND paid_on <= ?
       GROUP BY gid
     ) g
     LEFT JOIN parties pa ON pa.id = g.party_id
     ORDER BY g.first_at`,
    businessId,
    from,
    to,
  );

  const expenses = await listExpenses(db, businessId, from, to);
  const { rows: purchases, available: purchasesAvailable } = await listPurchases(db, businessId, from, to);

  const sum = (xs: { amount_paise?: number; total_paise?: number }[]): number =>
    xs.reduce((a, x) => a + (x.total_paise ?? x.amount_paise ?? 0), 0);
  const salesTotal = sum(sales);
  const receivedTotal = sum(paymentsIn);
  const expenseTotal = sum(expenses);
  const purchaseTotal = sum(purchases);
  const totalIn = salesTotal + receivedTotal;
  const totalOut = expenseTotal + purchaseTotal;

  return {
    date: `${from}..${to}`,
    sales,
    paymentsIn,
    expenses,
    purchases,
    purchasesAvailable,
    totalIn,
    totalOut,
    net: totalIn - totalOut,
  };
}
