// Delivery challans — goods sent out without a tax bill.
//
// A challan lives in `invoices` with kind='invoice' and
// doc_type='delivery_challan' (doc_type is free TEXT — no migration).
// Behaviour:
// - NO GST: lines are stored with gstRate 0 (saveInvoice zeroes it for any
//   non-tax_invoice docType), totals are computed with applyGst=false.
// - Stock goes OUT on save: saveChallan is built on saveInvoice with
//   kind='invoice', whose stockSign is -1. Cancelling a challan puts the
//   stock back via the shared cancelInvoice path.
// - Number series DC/26-27/n: own sequence per FY (nextChallanNo), but the
//   number is still business-wide unique through saveInvoice's
//   duplicate-invoice-no guard.
// - Excluded from sales totals, GST reports, GSTR-1/JSON, party balances and
//   payment auto-allocation by every doc_type guard that excludes
//   'delivery_challan' (see invoices.ts, daybook.ts, parties.ts, returns.ts).
// - Convert to invoice: like convertQuotationToBill, but the item GST rates
//   are recovered from the item master (challan lines are stored tax-free).
//   Idempotent — a challan already converted returns its bill id.
import type { SQLiteDatabase } from 'expo-sqlite';
import { todayIso } from '../lib/dates';
import { BillTotals, calcBill, financialYear, invoiceNumber } from '../lib/gst';
import { nowIso } from '../lib/id';
import {
  DUPLICATE_INVOICE_NO,
  InvoiceDraft,
  InvoiceListRow,
  LineDraft,
  getInvoice,
  refreshInvoiceStatus,
  saveInvoice,
} from './invoices';

export { DUPLICATE_INVOICE_NO };

/** Number series for delivery challans: DC/26-27/1, DC/26-27/2, … (own sequence per FY). */
export const CHALLAN_PREFIX = 'DC';

/**
 * Next challan number in this financial year. Counts deleted/cancelled
 * challans too, so a number is never reused. Separate from the tax-invoice
 * series (see nextInvoiceNo).
 */
export async function nextChallanNo(
  db: SQLiteDatabase,
  businessId: string,
  isoDate: string,
): Promise<{ fy: string; seq: number; challanNo: string }> {
  const fy = financialYear(isoDate);
  const row = await db.getFirstAsync<{ maxSeq: number | null }>(
    `SELECT MAX(seq) AS maxSeq FROM invoices
     WHERE business_id = ? AND fy = ? AND kind = 'invoice' AND doc_type = 'delivery_challan'`,
    businessId,
    fy,
  );
  const seq = (row?.maxSeq ?? 0) + 1;
  return { fy, seq, challanNo: invoiceNumber(CHALLAN_PREFIX, fy, seq) };
}

/**
 * Creates (challanId = null) or updates a delivery challan in one transaction.
 * Thin wrapper over saveInvoice with kind='invoice' and docType forced to
 * 'delivery_challan', so stock moves OUT, no GST is stored, and no billing-time
 * payment is ever created (receivedPaise is forced to 0).
 */
export async function saveChallan(
  db: SQLiteDatabase,
  params: {
    businessId: string;
    challanId: string | null;
    draft: InvoiceDraft; // draft.docType is forced to 'delivery_challan'
    lines: LineDraft[];
    totals: BillTotals;
  },
): Promise<string> {
  const { businessId, draft, lines, totals } = params;
  const hard: InvoiceDraft = { ...draft, docType: 'delivery_challan', receivedPaise: 0 };
  if (params.challanId) {
    return saveInvoice(db, {
      businessId,
      invoiceId: params.challanId,
      prefix: CHALLAN_PREFIX,
      kind: 'invoice',
      draft: hard,
      lines,
      totals,
    });
  }
  const no = await nextChallanNo(db, businessId, hard.invoiceDate);
  return saveInvoice(db, {
    businessId,
    invoiceId: null,
    prefix: CHALLAN_PREFIX,
    invoiceNo: no.challanNo,
    kind: 'invoice',
    draft: hard,
    lines,
    totals,
  });
}

/** Live challans for one business, newest first (for the Challans list). */
export async function listChallans(
  db: SQLiteDatabase,
  businessId: string,
  limit = 500,
): Promise<InvoiceListRow[]> {
  return db.getAllAsync<InvoiceListRow>(
    `SELECT id, invoice_no, invoice_date, party_name, total_paise, received_paise,
            credited_paise, status, kind, doc_type, ref_invoice_no
     FROM invoices
     WHERE business_id = ? AND doc_type = 'delivery_challan' AND deleted_at IS NULL
     ORDER BY invoice_date DESC, created_at DESC LIMIT ?`,
    businessId,
    limit,
  );
}

/**
 * Turns a delivery challan into a real tax invoice / bill of supply, copying
 * party and lines. The goods already left on the challan, so converting must
 * be stock-neutral: saveInvoice decrements stock for the new bill's lines, and
 * that effect is reversed right after (stock comes back IN per line). The
 * challan stays in the Challans list, linked to the new bill through
 * ref_invoice_id / ref_invoice_no, and cannot be converted twice —
 * idempotent: an already-converted challan returns its existing bill id.
 */
export async function convertChallanToBill(
  db: SQLiteDatabase,
  opts: {
    businessId: string;
    challanId: string;
    prefix: string;
    gstRegistered: boolean;
    stateCode: string;
  },
): Promise<string> {
  const data = await getInvoice(db, opts.challanId);
  if (!data) throw new Error('Challan not found');
  const c = data.invoice;
  if (c.doc_type !== 'delivery_challan') throw new Error('Not a delivery challan');
  if (c.cancelled_at) throw new Error('Challan is cancelled');
  // Idempotent: already converted → return the existing bill instead of duplicating.
  if (c.ref_invoice_id) return c.ref_invoice_id;

  // Challan lines are stored with gstRate 0 (no tax on a challan) — recover
  // each item's real rate from the item master for the new bill.
  const ids = [...new Set(data.lines.map((l) => l.item_id).filter((x): x is string => !!x))];
  const rates = new Map<string, number>();
  if (ids.length > 0) {
    const rows = await db.getAllAsync<{ id: string; gst_rate: number }>(
      `SELECT id, gst_rate FROM items WHERE id IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
    for (const r of rows) rates.set(r.id, r.gst_rate ?? 0);
  }
  const lines: LineDraft[] = data.lines.map((l) => ({
    itemId: l.item_id,
    itemType: l.item_type,
    name: l.name,
    hsn: l.hsn,
    unit: l.unit,
    qty: l.qty,
    ratePaise: l.rate_paise,
    rateWithTax: l.rate_with_tax === 1,
    discountType: l.discount_type,
    discountValue: l.discount_value,
    gstRate: l.item_id ? (rates.get(l.item_id) ?? 0) : 0,
  }));

  const applyGst = opts.gstRegistered;
  const placeOfSupply = c.party_state_code || opts.stateCode;
  const isIgst = applyGst && !!placeOfSupply && placeOfSupply !== opts.stateCode;
  const totals = calcBill(lines, {
    applyGst,
    isIgst,
    chargesPaise: c.charges_paise,
    roundOff: c.round_off === 1,
  });

  const draft: InvoiceDraft = {
    docType: applyGst ? 'tax_invoice' : 'bill_of_supply',
    invoiceDate: todayIso(),
    dueDate: null,
    partyId: c.party_id,
    partyName: c.party_name,
    partyPhone: c.party_phone,
    partyGstin: c.party_gstin,
    partyStateCode: c.party_state_code,
    billingAddress: c.billing_address,
    shippingAddress: c.shipping_address,
    placeOfSupply,
    isIgst,
    chargesLabel: c.charges_label,
    roundOff: c.round_off === 1,
    poNo: c.po_no,
    vehicleNo: c.vehicle_no,
    notes: c.notes,
    receivedPaise: 0,
    paymentMode: 'cash',
  };

  const billId = await saveInvoice(db, {
    businessId: opts.businessId,
    invoiceId: null,
    prefix: opts.prefix,
    kind: 'invoice',
    draft,
    lines,
    totals,
  });

  // Undo the stock-out that saveInvoice just applied: the goods already left
  // on the challan, so converting must be stock-neutral.
  const now = nowIso();
  const billLines = await db.getAllAsync<{ item_id: string | null; qty: number }>(
    'SELECT item_id, qty FROM invoice_items WHERE invoice_id = ? AND deleted_at IS NULL',
    billId,
  );
  for (const l of billLines) {
    if (l.item_id) {
      await db.runAsync(
        `UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ? AND item_type = 'product'`,
        l.qty,
        now,
        l.item_id,
      );
    }
  }

  // Link the challan to the bill it became.
  const bill = await getInvoice(db, billId);
  await db.runAsync(
    'UPDATE invoices SET ref_invoice_id = ?, ref_invoice_no = ?, updated_at = ? WHERE id = ?',
    billId,
    bill?.invoice.invoice_no ?? null,
    nowIso(),
    c.id,
  );
  await refreshInvoiceStatus(db, c.id);
  return billId;
}
