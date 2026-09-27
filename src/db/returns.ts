// Sales returns (Worker B) — the credit-note twin with its own SR/fy/seq series.
//
// A sales return lives in `invoices` with kind='sales_return' and
// doc_type='tax_invoice' (it is a GST document). Saving behaves exactly like a
// credit note for stock (goods come back IN), party balance (subtracted via
// BALANCE_SQL) and GSTR-1 (cdnr section) — see the isReturnKind() handling in
// src/db/invoices.ts, src/db/parties.ts, src/lib/gstr1.ts and
// src/lib/gstr1json.ts. The only difference is numbering: a sales return gets
// SR/26-27/n from getInvoiceNextSeq(kind='sales_return'), independent of the
// CN series.
import type { SQLiteDatabase } from 'expo-sqlite';
import { BillTotals } from '../lib/gst';
import {
  DUPLICATE_INVOICE_NO,
  InvoiceDraft,
  InvoiceLine,
  LineDraft,
  SALES_RETURN_PREFIX,
  getInvoice,
  refreshInvoiceStatus,
  returnedQty,
  saveInvoice,
} from './invoices';

export { SALES_RETURN_PREFIX };

/** Thrown when a return line asks for more than is still returnable. */
export const OVER_RETURN = 'over-return';

/**
 * How many units of one item can still be returned against a bill:
 * billed qty − already returned (credit notes + sales returns, live only).
 * `itemId` is the item-master id; pass null for ad-hoc (unnamed) lines, which
 * key on the line name.
 */
export async function returnableQty(
  db: SQLiteDatabase,
  invoiceId: string,
  itemId: string | null,
  name?: string | null,
): Promise<number> {
  const data = await getInvoice(db, invoiceId);
  if (!data) return 0;
  const billed = data.lines
    .filter((l) => (itemId ? l.item_id === itemId : !l.item_id && l.name === name))
    .reduce((s, l) => s + l.qty, 0);
  const done = await returnedQty(db, invoiceId);
  const key = itemId ?? name ?? '';
  const already = done[key] ?? 0;
  return Math.max(0, Math.round((billed - already) * 1000) / 1000);
}

export type SalesReturnParams = {
  businessId: string;
  /** Original bill this return is raised against. Optional — omit for a standalone return. */
  refInvoiceId?: string | null;
  draft: InvoiceDraft; // docType should be 'tax_invoice' (or 'bill_of_supply')
  lines: LineDraft[];
  totals: BillTotals;
};

/**
 * Creates a sales return. Mirrors the credit-note save path exactly
 * (stock IN, optional refund payment OUT, ref_invoice_id link, markDirty),
 * with SR series numbering and a per-item over-return guard when linked to
 * an original bill.
 */
export async function createSalesReturn(
  db: SQLiteDatabase,
  params: SalesReturnParams,
): Promise<string> {
  const { businessId, refInvoiceId, draft, lines, totals } = params;

  let refInvoice: { id: string; no: string } | null = null;
  if (refInvoiceId) {
    const data = await getInvoice(db, refInvoiceId);
    if (!data) throw new Error('Bill not found');
    const inv = data.invoice;
    if (inv.kind !== 'invoice') throw new Error('Can only return against a sales bill');
    if (inv.cancelled_at) throw new Error('Cannot return against a cancelled bill');
    refInvoice = { id: inv.id, no: inv.invoice_no };

    // Per-item guard: returned qty must not exceed what is still returnable.
    const over: string[] = [];
    for (const l of lines) {
      const ok = await returnableQty(db, inv.id, l.itemId, l.name);
      if (l.qty - ok > 1e-6) over.push(`${l.name} (${l.qty} > ${ok} ${l.unit})`);
    }
    if (over.length) throw new Error(`${OVER_RETURN}: ${over.join(', ')}`);
  }

  const id = await saveInvoice(db, {
    businessId,
    invoiceId: null,
    prefix: SALES_RETURN_PREFIX,
    kind: 'sales_return',
    refInvoice,
    lines,
    totals,
    draft,
  });
  if (refInvoice) await refreshInvoiceStatus(db, refInvoice.id);
  return id;
}

/** Picks the original-bill list for the "link bill" picker: live sales bills. */
export async function linkableBills(
  db: SQLiteDatabase,
  businessId: string,
): Promise<{ id: string; invoice_no: string; party_name: string; invoice_date: string }[]> {
  return db.getAllAsync(
    `SELECT id, invoice_no, party_name, invoice_date FROM invoices
     WHERE business_id = ? AND kind = 'invoice' AND doc_type NOT IN ('quotation', 'delivery_challan', 'proforma')
       AND deleted_at IS NULL AND cancelled_at IS NULL
     ORDER BY invoice_date DESC, created_at DESC LIMIT 200`,
    businessId,
  );
}

export { DUPLICATE_INVOICE_NO };
export type { InvoiceLine };
