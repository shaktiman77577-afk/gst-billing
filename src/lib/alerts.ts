import type { SQLiteDatabase } from 'expo-sqlite';
import { fromIsoDate } from './dates';

// ---------------------------------------------------------------------------
// Smart alerts: low stock + overdue payments.
// Money is integer paise. Dates are TEXT 'YYYY-MM-DD'. Read-only queries.
// ---------------------------------------------------------------------------

export type LowStockItem = {
  id: string;
  name: string;
  unit: string;
  stock_qty: number;
  low_stock_qty: number;
};

/** Products (not services) whose stock has fallen to or below their reorder level. */
export async function getLowStockItems(
  db: SQLiteDatabase,
  businessId: string,
): Promise<LowStockItem[]> {
  return db.getAllAsync<LowStockItem>(
    `SELECT id, name, unit, stock_qty, low_stock_qty
     FROM items
     WHERE business_id = ?
       AND deleted_at IS NULL
       AND item_type = 'product'
       AND low_stock_qty IS NOT NULL
       AND stock_qty <= low_stock_qty
     ORDER BY stock_qty ASC`,
    businessId,
  );
}

export type OverdueInvoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  party_name: string;
  party_phone: string | null;
  due_date: string;
  total_paise: number;
  balance_paise: number;
  days_overdue: number;
};

type OverdueRow = Omit<OverdueInvoice, 'balance_paise' | 'days_overdue'> & {
  received_paise: number;
  credited_paise: number;
};

/**
 * Live sales bills (not credit notes) past their due date with money still due.
 * `today` must be 'YYYY-MM-DD' (use todayIso()).
 */
export async function getOverdueInvoices(
  db: SQLiteDatabase,
  businessId: string,
  today: string,
): Promise<OverdueInvoice[]> {
  const rows = await db.getAllAsync<OverdueRow>(
    `SELECT id, invoice_no, invoice_date, party_name, party_phone, due_date,
            total_paise, received_paise, credited_paise
     FROM invoices
     WHERE business_id = ?
       AND deleted_at IS NULL
       AND cancelled_at IS NULL
       AND kind = 'invoice'
       AND doc_type IN ('tax_invoice', 'bill_of_supply')
       AND due_date IS NOT NULL
       AND due_date < ?
       AND (total_paise - received_paise - credited_paise) > 0
     ORDER BY due_date ASC`,
    businessId,
    today,
  );
  const todayDate = fromIsoDate(today);
  return rows.map((r) => {
    const due = fromIsoDate(r.due_date);
    const days = Math.max(0, Math.round((todayDate.getTime() - due.getTime()) / 86400000));
    return {
      id: r.id,
      invoice_no: r.invoice_no,
      invoice_date: r.invoice_date,
      party_name: r.party_name,
      party_phone: r.party_phone,
      due_date: r.due_date,
      total_paise: r.total_paise,
      balance_paise: r.total_paise - r.received_paise - r.credited_paise,
      days_overdue: days,
    };
  });
}

export type AlertCounts = {
  lowStock: number;
  overdueCount: number;
  overdueTotal: number; // paise
};

/** Lightweight counters for the home screen alerts section. */
export async function getAlertCounts(
  db: SQLiteDatabase,
  businessId: string,
  today: string,
): Promise<AlertCounts> {
  const [low, over] = await Promise.all([
    getLowStockItems(db, businessId),
    getOverdueInvoices(db, businessId, today),
  ]);
  return {
    lowStock: low.length,
    overdueCount: over.length,
    overdueTotal: over.reduce((s, o) => s + o.balance_paise, 0),
  };
}
