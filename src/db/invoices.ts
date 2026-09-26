import type { SQLiteDatabase } from 'expo-sqlite';
import { BillTotals, DiscountType, financialYear, invoiceNumber } from '../lib/gst';
import { newId, nowIso } from '../lib/id';

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank' | 'cheque';
export type DocType = 'tax_invoice' | 'bill_of_supply';

export type Invoice = {
  id: string;
  business_id: string;
  doc_type: DocType;
  prefix: string;
  fy: string;
  seq: number;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  party_id: string | null;
  party_name: string;
  party_phone: string | null;
  party_gstin: string | null;
  party_state_code: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  place_of_supply: string;
  is_igst: number;
  discount_paise: number;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  charges_label: string | null;
  charges_paise: number;
  round_off: number;
  round_off_paise: number;
  total_paise: number;
  received_paise: number;
  status: InvoiceStatus;
  po_no: string | null;
  vehicle_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  item_id: string | null;
  item_type: 'product' | 'service';
  name: string;
  hsn: string | null;
  unit: string;
  qty: number;
  rate_paise: number;
  rate_with_tax: number;
  discount_type: DiscountType;
  discount_value: number;
  gst_rate: number;
  discount_paise: number;
  taxable_paise: number;
  tax_paise: number;
  amount_paise: number;
  sort: number;
};

export type LineDraft = {
  itemId: string | null;
  itemType: 'product' | 'service';
  name: string;
  hsn: string | null;
  unit: string;
  qty: number;
  ratePaise: number;
  rateWithTax: boolean;
  discountType: DiscountType;
  discountValue: number;
  gstRate: number;
};

export type InvoiceDraft = {
  docType: DocType;
  invoiceDate: string;
  dueDate: string | null;
  partyId: string | null;
  partyName: string;
  partyPhone: string | null;
  partyGstin: string | null;
  partyStateCode: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  placeOfSupply: string;
  isIgst: boolean;
  chargesLabel: string | null;
  roundOff: boolean;
  poNo: string | null;
  vehicleNo: string | null;
  notes: string | null;
  receivedPaise: number; // paid at the time of billing
  paymentMode: PaymentMode;
};

export function statusFor(total: number, received: number): InvoiceStatus {
  if (received <= 0) return total <= 0 ? 'paid' : 'unpaid';
  return received >= total ? 'paid' : 'partial';
}

// Next number in this financial year. Counts deleted/cancelled bills too,
// so a number is never reused.
export async function nextInvoiceNo(
  db: SQLiteDatabase,
  businessId: string,
  prefix: string,
  isoDate: string,
): Promise<{ fy: string; seq: number; invoiceNo: string }> {
  const fy = financialYear(isoDate);
  const row = await db.getFirstAsync<{ maxSeq: number | null }>(
    'SELECT MAX(seq) AS maxSeq FROM invoices WHERE business_id = ? AND fy = ?',
    businessId,
    fy,
  );
  const seq = (row?.maxSeq ?? 0) + 1;
  return { fy, seq, invoiceNo: invoiceNumber(prefix, fy, seq) };
}

export type InvoiceListRow = Pick<
  Invoice,
  'id' | 'invoice_no' | 'invoice_date' | 'party_name' | 'total_paise' | 'received_paise' | 'status'
>;

export async function listInvoices(db: SQLiteDatabase, businessId: string, limit = 500): Promise<InvoiceListRow[]> {
  return db.getAllAsync<InvoiceListRow>(
    `SELECT id, invoice_no, invoice_date, party_name, total_paise, received_paise, status
     FROM invoices WHERE business_id = ? AND deleted_at IS NULL
     ORDER BY invoice_date DESC, seq DESC LIMIT ?`,
    businessId,
    limit,
  );
}

export async function getInvoice(
  db: SQLiteDatabase,
  id: string,
): Promise<{ invoice: Invoice; lines: InvoiceLine[] } | null> {
  const invoice = await db.getFirstAsync<Invoice>('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL', id);
  if (!invoice) return null;
  const lines = await db.getAllAsync<InvoiceLine>(
    'SELECT * FROM invoice_items WHERE invoice_id = ? AND deleted_at IS NULL ORDER BY sort',
    id,
  );
  return { invoice, lines };
}

export async function salesSummary(
  db: SQLiteDatabase,
  businessId: string,
  fromDate: string,
): Promise<{ total: number; count: number }> {
  const row = await db.getFirstAsync<{ total: number | null; count: number }>(
    `SELECT SUM(total_paise) AS total, COUNT(*) AS count FROM invoices
     WHERE business_id = ? AND deleted_at IS NULL AND invoice_date >= ?`,
    businessId,
    fromDate,
  );
  return { total: row?.total ?? 0, count: row?.count ?? 0 };
}

async function changeStock(db: SQLiteDatabase, itemId: string, delta: number, now: string) {
  await db.runAsync(
    `UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ? AND item_type = 'product'`,
    delta,
    now,
    itemId,
  );
}

/**
 * Creates (invoiceId = null) or updates a bill in one transaction:
 * bill row + lines, stock, and the payment received at billing time.
 */
export async function saveInvoice(
  db: SQLiteDatabase,
  params: {
    businessId: string;
    invoiceId: string | null;
    prefix: string;
    draft: InvoiceDraft;
    lines: LineDraft[];
    totals: BillTotals;
  },
): Promise<string> {
  const { businessId, draft, lines, totals } = params;
  const now = nowIso();
  let id = params.invoiceId ?? newId();

  await db.withTransactionAsync(async () => {
    if (params.invoiceId) {
      // Undo the old lines' stock, then hide them.
      const old = await db.getAllAsync<{ item_id: string | null; qty: number }>(
        'SELECT item_id, qty FROM invoice_items WHERE invoice_id = ? AND deleted_at IS NULL',
        id,
      );
      for (const l of old) if (l.item_id) await changeStock(db, l.item_id, l.qty, now);
      await db.runAsync(
        'UPDATE invoice_items SET deleted_at = ?, updated_at = ? WHERE invoice_id = ? AND deleted_at IS NULL',
        now,
        now,
        id,
      );
    }

    const header = [
      draft.docType,
      draft.invoiceDate,
      draft.dueDate,
      draft.partyId,
      draft.partyName,
      draft.partyPhone,
      draft.partyGstin,
      draft.partyStateCode,
      draft.billingAddress,
      draft.shippingAddress,
      draft.placeOfSupply,
      draft.isIgst ? 1 : 0,
      totals.discountPaise,
      totals.taxablePaise,
      totals.cgstPaise,
      totals.sgstPaise,
      totals.igstPaise,
      draft.chargesLabel,
      totals.chargesPaise,
      draft.roundOff ? 1 : 0,
      totals.roundOffPaise,
      totals.totalPaise,
      draft.poNo,
      draft.vehicleNo,
      draft.notes,
    ];

    if (params.invoiceId) {
      await db.runAsync(
        `UPDATE invoices SET
          doc_type = ?, invoice_date = ?, due_date = ?, party_id = ?, party_name = ?, party_phone = ?,
          party_gstin = ?, party_state_code = ?, billing_address = ?, shipping_address = ?,
          place_of_supply = ?, is_igst = ?, discount_paise = ?, taxable_paise = ?, cgst_paise = ?,
          sgst_paise = ?, igst_paise = ?, charges_label = ?, charges_paise = ?, round_off = ?,
          round_off_paise = ?, total_paise = ?, po_no = ?, vehicle_no = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        ...header,
        now,
        id,
      );
    } else {
      const no = await nextInvoiceNo(db, businessId, params.prefix, draft.invoiceDate);
      id = params.invoiceId ?? id;
      await db.runAsync(
        `INSERT INTO invoices (
          doc_type, invoice_date, due_date, party_id, party_name, party_phone,
          party_gstin, party_state_code, billing_address, shipping_address,
          place_of_supply, is_igst, discount_paise, taxable_paise, cgst_paise,
          sgst_paise, igst_paise, charges_label, charges_paise, round_off,
          round_off_paise, total_paise, po_no, vehicle_no, notes,
          id, business_id, prefix, fy, seq, invoice_no, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...header,
        id,
        businessId,
        params.prefix,
        no.fy,
        no.seq,
        no.invoiceNo,
        now,
        now,
      );
    }

    // Lines + stock.
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const r = totals.lines[i];
      await db.runAsync(
        `INSERT INTO invoice_items (
          id, invoice_id, item_id, item_type, name, hsn, unit, qty, rate_paise, rate_with_tax,
          discount_type, discount_value, gst_rate, discount_paise, taxable_paise, tax_paise,
          amount_paise, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        id,
        l.itemId,
        l.itemType,
        l.name,
        l.hsn,
        l.unit,
        l.qty,
        l.ratePaise,
        l.rateWithTax ? 1 : 0,
        l.discountType,
        l.discountValue,
        draft.docType === 'tax_invoice' ? l.gstRate : 0,
        r.discountPaise,
        r.taxablePaise,
        r.taxPaise,
        r.amountPaise,
        i,
        now,
        now,
      );
      if (l.itemId) await changeStock(db, l.itemId, -l.qty, now);
    }

    // Payment received at billing time (one "invoice" payment per bill).
    const existing = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM payments WHERE invoice_id = ? AND source = 'invoice' AND deleted_at IS NULL`,
      id,
    );
    if (draft.receivedPaise > 0) {
      if (existing) {
        await db.runAsync(
          'UPDATE payments SET amount_paise = ?, mode = ?, party_id = ?, paid_on = ?, updated_at = ? WHERE id = ?',
          draft.receivedPaise,
          draft.paymentMode,
          draft.partyId,
          draft.invoiceDate,
          now,
          existing.id,
        );
      } else {
        await db.runAsync(
          `INSERT INTO payments (id, business_id, invoice_id, party_id, source, amount_paise, mode, paid_on, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'invoice', ?, ?, ?, ?, ?)`,
          newId(),
          businessId,
          id,
          draft.partyId,
          draft.receivedPaise,
          draft.paymentMode,
          draft.invoiceDate,
          now,
          now,
        );
      }
    } else if (existing) {
      await db.runAsync('UPDATE payments SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, existing.id);
    }

    // Received total + status.
    const paid = await db.getFirstAsync<{ total: number | null }>(
      'SELECT SUM(amount_paise) AS total FROM payments WHERE invoice_id = ? AND deleted_at IS NULL',
      id,
    );
    const received = paid?.total ?? 0;
    await db.runAsync(
      'UPDATE invoices SET received_paise = ?, status = ? WHERE id = ?',
      received,
      statusFor(totals.totalPaise, received),
      id,
    );
  });

  return id;
}

export async function getInvoicePayment(
  db: SQLiteDatabase,
  invoiceId: string,
): Promise<{ amount_paise: number; mode: PaymentMode } | null> {
  return db.getFirstAsync<{ amount_paise: number; mode: PaymentMode }>(
    `SELECT amount_paise, mode FROM payments WHERE invoice_id = ? AND source = 'invoice' AND deleted_at IS NULL`,
    invoiceId,
  );
}
