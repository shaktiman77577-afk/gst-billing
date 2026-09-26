import type { SQLiteDatabase } from 'expo-sqlite';
import { InvoiceListRow } from '../db/invoices';
import { formatDate, toIsoDate } from './dates';

export type RangePreset = 'today' | 'week' | 'month' | 'lastMonth';

// Inclusive { from, to } as YYYY-MM-DD. Week starts Monday (India convention).
export function reportRange(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  const to = toIsoDate(now);
  if (preset === 'today') return { from: to, to };
  if (preset === 'month') {
    return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
  if (preset === 'lastMonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toIsoDate(first), to: toIsoDate(last) };
  }
  const mondayOffset = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  return { from: toIsoDate(monday), to };
}

// "26 Sep 2026" or "1 Sep 2026 – 26 Sep 2026".
export function formatRange(from: string, to: string): string {
  return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
}

// Real sale bills only: invoices (not credit notes), both doc types,
// never cancelled or soft-deleted.
const LIVE_SALE = `kind = 'invoice' AND doc_type IN ('tax_invoice', 'bill_of_supply') AND cancelled_at IS NULL AND deleted_at IS NULL`;

export type SalesSummary = {
  totalPaise: number;
  taxPaise: number;
  taxablePaise: number;
  count: number;
};

export async function salesSummary(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<SalesSummary> {
  const row = await db.getFirstAsync<SalesSummary>(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(total_paise), 0) AS totalPaise,
            COALESCE(SUM(cgst_paise + sgst_paise + igst_paise), 0) AS taxPaise,
            COALESCE(SUM(taxable_paise), 0) AS taxablePaise
     FROM invoices
     WHERE business_id = ? AND ${LIVE_SALE} AND invoice_date >= ? AND invoice_date <= ?`,
    businessId,
    from,
    to,
  );
  return row ?? { totalPaise: 0, taxPaise: 0, taxablePaise: 0, count: 0 };
}

export type GstRateRow = {
  rate: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

// Per-rate breakup derived from invoice lines. Intra-state tax is split
// evenly into CGST/SGST (the odd paise, if any, goes to SGST).
export async function gstSummary(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<GstRateRow[]> {
  const rows = await db.getAllAsync<{ rate: number; taxablePaise: number; igstPaise: number; intraTaxPaise: number }>(
    `SELECT li.gst_rate AS rate,
            COALESCE(SUM(li.taxable_paise), 0) AS taxablePaise,
            COALESCE(SUM(CASE WHEN i.is_igst = 1 THEN li.tax_paise ELSE 0 END), 0) AS igstPaise,
            COALESCE(SUM(CASE WHEN i.is_igst = 0 THEN li.tax_paise ELSE 0 END), 0) AS intraTaxPaise
     FROM invoice_items li
     JOIN invoices i ON i.id = li.invoice_id
     WHERE i.business_id = ? AND i.${LIVE_SALE} AND li.deleted_at IS NULL
       AND i.invoice_date >= ? AND i.invoice_date <= ?
     GROUP BY li.gst_rate
     ORDER BY li.gst_rate ASC`,
    businessId,
    from,
    to,
  );
  return rows.map((r) => {
    const cgstPaise = Math.round(r.intraTaxPaise / 2);
    return {
      rate: r.rate,
      taxablePaise: r.taxablePaise,
      cgstPaise,
      sgstPaise: r.intraTaxPaise - cgstPaise,
      igstPaise: r.igstPaise,
    };
  });
}

export type TopItem = { name: string; qty: number; amountPaise: number };

export async function topItems(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
  limit = 10,
): Promise<TopItem[]> {
  return db.getAllAsync<TopItem>(
    `SELECT li.name AS name,
            COALESCE(SUM(li.qty), 0) AS qty,
            COALESCE(SUM(li.amount_paise), 0) AS amountPaise
     FROM invoice_items li
     JOIN invoices i ON i.id = li.invoice_id
     WHERE i.business_id = ? AND i.${LIVE_SALE} AND li.deleted_at IS NULL
       AND i.invoice_date >= ? AND i.invoice_date <= ?
     GROUP BY li.name
     ORDER BY amountPaise DESC
     LIMIT ?`,
    businessId,
    from,
    to,
    limit,
  );
}

export type TopParty = { name: string; amountPaise: number };

export async function topParties(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
  limit = 10,
): Promise<TopParty[]> {
  return db.getAllAsync<TopParty>(
    `SELECT party_name AS name, COALESCE(SUM(total_paise), 0) AS amountPaise
     FROM invoices
     WHERE business_id = ? AND ${LIVE_SALE} AND invoice_date >= ? AND invoice_date <= ?
     GROUP BY party_name
     ORDER BY amountPaise DESC
     LIMIT ?`,
    businessId,
    from,
    to,
    limit,
  );
}

// Money still to collect across all live sale bills (all time).
export async function receivablesTotal(db: SQLiteDatabase, businessId: string): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(CASE WHEN total_paise - received_paise - credited_paise > 0
                              THEN total_paise - received_paise - credited_paise
                              ELSE 0 END), 0) AS total
     FROM invoices
     WHERE business_id = ? AND ${LIVE_SALE}`,
    businessId,
  );
  return row?.total ?? 0;
}

const BILL_COLS =
  'id, invoice_no, invoice_date, party_name, total_paise, received_paise, credited_paise, status, kind, ref_invoice_no';

export async function billsInRange(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
  limit = 200,
): Promise<InvoiceListRow[]> {
  return db.getAllAsync<InvoiceListRow>(
    `SELECT ${BILL_COLS}
     FROM invoices
     WHERE business_id = ? AND ${LIVE_SALE} AND invoice_date >= ? AND invoice_date <= ?
     ORDER BY invoice_date DESC, created_at DESC
     LIMIT ?`,
    businessId,
    from,
    to,
    limit,
  );
}
