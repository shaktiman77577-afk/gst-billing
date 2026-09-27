import type { SQLiteDatabase } from 'expo-sqlite';
import { BillTotals, DiscountType, financialYear, invoiceNumber } from '../lib/gst';
import { newId, nowIso } from '../lib/id';
import { markDirty } from '../lib/backup';

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'cancelled';
export type InvoiceKind = 'invoice' | 'credit_note' | 'sales_return';
export type PaymentDirection = 'in' | 'out';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank' | 'cheque';
export type DocType = 'tax_invoice' | 'bill_of_supply' | 'quotation' | 'proforma';

/**
 * A sales return is the credit-note twin: stock comes back IN and the party
 * balance is reduced, but it gets its own SR/fy/seq series and stays
 * distinguishable from credit notes in the UI. Everywhere below that
 * special-cases 'credit_note', 'sales_return' is handled identically.
 */
export function isReturnKind(kind: InvoiceKind): boolean {
  return kind === 'credit_note' || kind === 'sales_return';
}

/** SQL IN-list fragment for the return kinds (credit notes + sales returns). */
export const RETURN_KINDS_SQL = `('credit_note', 'sales_return')`;

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
  kind: InvoiceKind;
  ref_invoice_id: string | null;
  ref_invoice_no: string | null;
  credited_paise: number;
  cancelled_at: string | null;
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

export function statusFor(total: number, settled: number): InvoiceStatus {
  if (settled <= 0) return total <= 0 ? 'paid' : 'unpaid';
  return settled >= total ? 'paid' : 'partial';
}

export const CREDIT_NOTE_PREFIX = 'CN';
/** Number series for sales returns: SR/26-27/1, SR/26-27/2, … (own sequence per FY). */
export const SALES_RETURN_PREFIX = 'SR';

// Next sequence in this financial year. Counts deleted/cancelled bills too,
// so a number is never reused. A per-series floor (Bill settings →
// "Next bill number") can raise the counter but never lower it below used.
export async function getInvoiceNextSeq(
  db: SQLiteDatabase,
  businessId: string,
  isoDate: string,
  kind: InvoiceKind = 'invoice',
): Promise<{ fy: string; seq: number }> {
  const fy = financialYear(isoDate);
  const maxRow = await db.getFirstAsync<{ maxSeq: number | null }>(
    `SELECT MAX(seq) AS maxSeq FROM invoices
     WHERE business_id = ? AND fy = ? AND kind = ? AND doc_type NOT IN ('quotation', 'proforma')`,
    businessId,
    fy,
    kind,
  );
  const floorRow = await db.getFirstAsync<{ next_seq: number | null }>(
    `SELECT next_seq FROM invoice_series WHERE business_id = ? AND fy = ? AND kind = ?`,
    businessId,
    fy,
    kind,
  );
  const seq = Math.max(maxRow?.maxSeq ?? 0, (floorRow?.next_seq ?? 1) - 1) + 1;
  return { fy, seq };
}

/** Sets the auto-number floor for a series (Bill settings). Never lowers the counter below used numbers. */
export async function setInvoiceNextSeq(
  db: SQLiteDatabase,
  businessId: string,
  fy: string,
  kind: InvoiceKind,
  nextSeq: number,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO invoice_series (business_id, fy, kind, next_seq) VALUES (?, ?, ?, ?)
     ON CONFLICT(business_id, fy, kind) DO UPDATE SET next_seq = excluded.next_seq`,
    businessId,
    fy,
    kind,
    nextSeq,
  );
}

// Next number in this financial year: PREFIX/FY/SEQ.
export async function nextInvoiceNo(
  db: SQLiteDatabase,
  businessId: string,
  prefix: string,
  isoDate: string,
  kind: InvoiceKind = 'invoice',
): Promise<{ fy: string; seq: number; invoiceNo: string }> {
  const { fy, seq } = await getInvoiceNextSeq(db, businessId, isoDate, kind);
  return { fy, seq, invoiceNo: invoiceNumber(prefix, fy, seq) };
}

/**
 * Splits a hand-typed bill number into prefix + trailing sequence.
 * "RR/SPR/26-27/83" → { prefix: "RR/SPR", seq: 83 }.
 * Returns null when there are no trailing digits — the counter is then
 * left alone (the row takes seq 0, which never moves MAX).
 */
function parseTypedInvoiceNo(typed: string): { prefix: string; seq: number } | null {
  // Canonical shape PREFIX/FY/SEQ, e.g. RR/SPR/26-27/83.
  let m = typed.match(/^(.*)\/(\d{2}-\d{2})\/(\d{1,12})$/);
  if (m) return { prefix: m[1], seq: parseInt(m[3], 10) };
  // Bare digits, e.g. 83 (prefix falls back to the settings prefix).
  m = typed.match(/^(\d{1,12})$/);
  if (m) return { prefix: '', seq: parseInt(m[1], 10) };
  // Anything else ending in /digits, e.g. RR/SPR/90.
  m = typed.match(/^(.*)\/(\d{1,12})$/);
  if (m) return { prefix: m[1], seq: parseInt(m[2], 10) };
  return null;
}

/** Thrown when a bill number is already used. The UI maps this to a friendly message. */
export const DUPLICATE_INVOICE_NO = 'duplicate-invoice-no';

export type InvoiceListRow = Pick<
  Invoice,
  | 'id'
  | 'invoice_no'
  | 'invoice_date'
  | 'party_name'
  | 'total_paise'
  | 'received_paise'
  | 'credited_paise'
  | 'status'
  | 'kind'
  | 'doc_type'
  | 'ref_invoice_no'
>;

const LIST_COLS =
  'id, invoice_no, invoice_date, party_name, total_paise, received_paise, credited_paise, status, kind, doc_type, ref_invoice_no';

export async function listInvoices(db: SQLiteDatabase, businessId: string, limit = 500): Promise<InvoiceListRow[]> {
  return db.getAllAsync<InvoiceListRow>(
    `SELECT ${LIST_COLS}
     FROM invoices WHERE business_id = ? AND deleted_at IS NULL
     ORDER BY invoice_date DESC, created_at DESC LIMIT ?`,
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
    `SELECT SUM(CASE WHEN kind IN ${RETURN_KINDS_SQL} THEN -total_paise ELSE total_paise END) AS total,
            SUM(CASE WHEN kind = 'invoice' THEN 1 ELSE 0 END) AS count
     FROM invoices
     WHERE business_id = ? AND deleted_at IS NULL AND cancelled_at IS NULL AND doc_type NOT IN ('quotation', 'proforma')
       AND invoice_date >= ?`,
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
    /** Hand-typed bill number for a new bill (New Bill screen). Null/empty = auto-generate. */
    invoiceNo?: string | null;
    draft: InvoiceDraft;
    lines: LineDraft[];
    totals: BillTotals;
    kind?: InvoiceKind;
    refInvoice?: { id: string; no: string } | null;
  },
): Promise<string> {
  const { businessId, draft, lines, totals } = params;
  const kind: InvoiceKind = params.kind ?? 'invoice';
  // A bill takes stock out; a return (credit note or sales return — goods
  // come back) puts it back.
  const stockSign = isReturnKind(kind) ? 1 : -1;
  const payDirection: PaymentDirection = isReturnKind(kind) ? 'out' : 'in';
  const now = nowIso();
  let id = params.invoiceId ?? newId();

  await db.withTransactionAsync(async () => {
    if (params.invoiceId) {
      // Undo the old lines' stock, then hide them.
      const old = await db.getAllAsync<{ item_id: string | null; qty: number }>(
        'SELECT item_id, qty FROM invoice_items WHERE invoice_id = ? AND deleted_at IS NULL',
        id,
      );
      for (const l of old) if (l.item_id) await changeStock(db, l.item_id, -stockSign * l.qty, now);
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
      // New bill: use the hand-typed number when given, else auto-generate.
      // The FY segment always comes from the bill date (back-dated bills land
      // in the right financial year); the number text itself is kept verbatim.
      const fy = financialYear(draft.invoiceDate);
      let prefix = params.prefix;
      let seq: number;
      let invoiceNo: string;
      const typed = params.invoiceNo?.trim();
      if (typed) {
        // GST: bill numbers must be unique. Block exact duplicates within the
        // business — across financial years and series, including deleted and
        // cancelled bills, so a number is never reused.
        const dup = await db.getFirstAsync<{ id: string }>(
          `SELECT id FROM invoices WHERE business_id = ? AND invoice_no = ? AND id != ?`,
          businessId,
          typed,
          id,
        );
        if (dup) throw new Error(DUPLICATE_INVOICE_NO);
        const parsed = parseTypedInvoiceNo(typed);
        if (parsed) {
          // Custom number ending in digits (e.g. RR/SPR/26-27/83): adopt the
          // trailing digits as the sequence, bumping the counter past it.
          prefix = parsed.prefix || params.prefix;
          seq = parsed.seq;
        } else {
          // Unparseable: leave the counter alone (seq 0 never moves MAX).
          seq = 0;
        }
        invoiceNo = typed;
      } else {
        const no = await nextInvoiceNo(db, businessId, params.prefix, draft.invoiceDate, kind);
        seq = no.seq;
        invoiceNo = no.invoiceNo;
      }
      await db.runAsync(
        `INSERT INTO invoices (
          doc_type, invoice_date, due_date, party_id, party_name, party_phone,
          party_gstin, party_state_code, billing_address, shipping_address,
          place_of_supply, is_igst, discount_paise, taxable_paise, cgst_paise,
          sgst_paise, igst_paise, charges_label, charges_paise, round_off,
          round_off_paise, total_paise, po_no, vehicle_no, notes,
          id, business_id, prefix, fy, seq, invoice_no, kind, ref_invoice_id, ref_invoice_no,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...header,
        id,
        businessId,
        prefix,
        fy,
        seq,
        invoiceNo,
        kind,
        params.refInvoice?.id ?? null,
        params.refInvoice?.no ?? null,
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
      if (l.itemId) await changeStock(db, l.itemId, stockSign * l.qty, now);
    }

    // Payment received at billing time (one "invoice" payment per bill).
    const existing = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM payments WHERE invoice_id = ? AND source = 'invoice' AND deleted_at IS NULL`,
      id,
    );
    if (draft.receivedPaise > 0) {
      if (existing) {
        await db.runAsync(
          'UPDATE payments SET amount_paise = ?, mode = ?, party_id = ?, paid_on = ?, direction = ?, updated_at = ? WHERE id = ?',
          draft.receivedPaise,
          draft.paymentMode,
          draft.partyId,
          draft.invoiceDate,
          payDirection,
          now,
          existing.id,
        );
      } else {
        await db.runAsync(
          `INSERT INTO payments (id, business_id, invoice_id, party_id, source, amount_paise, mode, paid_on,
             direction, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'invoice', ?, ?, ?, ?, ?, ?)`,
          newId(),
          businessId,
          id,
          draft.partyId,
          draft.receivedPaise,
          draft.paymentMode,
          draft.invoiceDate,
          payDirection,
          now,
          now,
        );
      }
    } else if (existing) {
      await db.runAsync('UPDATE payments SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, existing.id);
    }

    await refreshInvoiceStatus(db, id);
    if (params.refInvoice) await refreshInvoiceStatus(db, params.refInvoice.id);
  });

  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
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

// ---------- status, cancel, payments, credit notes, ledger ----------

/** Recomputes received / credited / status for one bill. */
export async function refreshInvoiceStatus(db: SQLiteDatabase, invoiceId: string): Promise<void> {
  const inv = await db.getFirstAsync<{ total_paise: number; kind: InvoiceKind; cancelled_at: string | null }>(
    'SELECT total_paise, kind, cancelled_at FROM invoices WHERE id = ?',
    invoiceId,
  );
  if (!inv) return;
  const paid = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(amount_paise) AS total FROM payments WHERE invoice_id = ? AND deleted_at IS NULL',
    invoiceId,
  );
  const credited = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(total_paise) AS total FROM invoices
     WHERE ref_invoice_id = ? AND kind IN ${RETURN_KINDS_SQL} AND deleted_at IS NULL AND cancelled_at IS NULL`,
    invoiceId,
  );
  const received = paid?.total ?? 0;
  const credit = credited?.total ?? 0;
  let status: InvoiceStatus;
  if (inv.cancelled_at) status = 'cancelled';
  else if (isReturnKind(inv.kind)) status = 'paid';
  else status = statusFor(inv.total_paise, received + credit);
  await db.runAsync(
    'UPDATE invoices SET received_paise = ?, credited_paise = ?, status = ?, updated_at = ? WHERE id = ?',
    received,
    credit,
    status,
    nowIso(),
    invoiceId,
  );
}

/** Returns linked to a bill: credit notes AND sales returns, oldest first. */
export async function creditNotesFor(db: SQLiteDatabase, invoiceId: string): Promise<InvoiceListRow[]> {
  return db.getAllAsync<InvoiceListRow>(
    `SELECT ${LIST_COLS} FROM invoices
     WHERE ref_invoice_id = ? AND kind IN ${RETURN_KINDS_SQL} AND deleted_at IS NULL
     ORDER BY created_at`,
    invoiceId,
  );
}

/** Cancels a bill or credit note: stock goes back, it stops counting in balances. */
export async function cancelInvoice(db: SQLiteDatabase, invoiceId: string): Promise<'ok' | 'has-credit-notes'> {
  const inv = await db.getFirstAsync<{
    kind: InvoiceKind;
    doc_type: DocType;
    ref_invoice_id: string | null;
    cancelled_at: string | null;
  }>(
    'SELECT kind, doc_type, ref_invoice_id, cancelled_at FROM invoices WHERE id = ?',
    invoiceId,
  );
  if (!inv || inv.cancelled_at) return 'ok';
  if (inv.kind === 'invoice') {
    const cn = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM invoices WHERE ref_invoice_id = ? AND kind IN ${RETURN_KINDS_SQL}
       AND deleted_at IS NULL AND cancelled_at IS NULL`,
      invoiceId,
    );
    if ((cn?.n ?? 0) > 0) return 'has-credit-notes';
  }
  const now = nowIso();
  const sign = isReturnKind(inv.kind) ? -1 : 1; // undo what saving did
  await db.withTransactionAsync(async () => {
    const lines = await db.getAllAsync<{ item_id: string | null; qty: number }>(
      'SELECT item_id, qty FROM invoice_items WHERE invoice_id = ? AND deleted_at IS NULL',
      invoiceId,
    );
    for (const l of lines) if (l.item_id && inv.doc_type !== 'quotation' && inv.doc_type !== 'proforma') await changeStock(db, l.item_id, sign * l.qty, now);
    // Money already received stays with the party as an advance (not linked to this bill).
    await db.runAsync(
      'UPDATE payments SET invoice_id = NULL, updated_at = ? WHERE invoice_id = ? AND deleted_at IS NULL',
      now,
      invoiceId,
    );
    await db.runAsync(
      "UPDATE invoices SET cancelled_at = ?, status = 'cancelled', updated_at = ? WHERE id = ?",
      now,
      now,
      invoiceId,
    );
    await refreshInvoiceStatus(db, invoiceId);
    if (inv.ref_invoice_id) await refreshInvoiceStatus(db, inv.ref_invoice_id);
  });
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
  return 'ok';
}

export type Payment = {
  id: string;
  invoice_id: string | null;
  party_id: string | null;
  source: string;
  direction: PaymentDirection;
  amount_paise: number;
  mode: PaymentMode;
  paid_on: string;
  notes: string | null;
  group_id: string | null;
  created_at: string;
};

export async function paymentsForInvoice(db: SQLiteDatabase, invoiceId: string): Promise<Payment[]> {
  return db.getAllAsync<Payment>(
    'SELECT * FROM payments WHERE invoice_id = ? AND deleted_at IS NULL ORDER BY paid_on, created_at',
    invoiceId,
  );
}

/**
 * Records money received (in) or paid (out).
 * With an invoice: linked to that bill.
 * Party "in" without an invoice: adjusted against the oldest unpaid bills first;
 * anything left over stays as an advance.
 */
export async function recordPayment(
  db: SQLiteDatabase,
  p: {
    businessId: string;
    partyId: string | null;
    invoiceId: string | null;
    direction: PaymentDirection;
    amountPaise: number;
    mode: PaymentMode;
    paidOn: string;
    notes: string | null;
  },
): Promise<void> {
  const now = nowIso();
  const groupId = newId();
  const insert = (invoiceId: string | null, amount: number) =>
    db.runAsync(
      `INSERT INTO payments (id, business_id, invoice_id, party_id, source, direction, amount_paise, mode,
         paid_on, notes, group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      p.businessId,
      invoiceId,
      p.partyId,
      p.direction,
      amount,
      p.mode,
      p.paidOn,
      p.notes,
      groupId,
      now,
      now,
    );

  await db.withTransactionAsync(async () => {
    const touched: string[] = [];
    if (p.invoiceId) {
      await insert(p.invoiceId, p.amountPaise);
      touched.push(p.invoiceId);
    } else if (p.direction === 'in' && p.partyId) {
      let left = p.amountPaise;
      const open = await db.getAllAsync<{ id: string; due: number }>(
        `SELECT id, total_paise - received_paise - credited_paise AS due FROM invoices
         WHERE party_id = ? AND kind = 'invoice' AND doc_type NOT IN ('quotation', 'proforma') AND deleted_at IS NULL
           AND cancelled_at IS NULL AND status IN ('unpaid', 'partial')
         ORDER BY invoice_date, created_at`,
        p.partyId,
      );
      for (const o of open) {
        if (left <= 0) break;
        const take = Math.min(left, o.due);
        if (take <= 0) continue;
        await insert(o.id, take);
        touched.push(o.id);
        left -= take;
      }
      if (left > 0) await insert(null, left);
    } else {
      await insert(null, p.amountPaise);
    }
    for (const id of touched) await refreshInvoiceStatus(db, id);
    // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
    markDirty(db);
  });
}

/** Deletes a payment (and the other parts of the same party payment). */
export async function deletePayment(db: SQLiteDatabase, paymentId: string): Promise<void> {
  const now = nowIso();
  const row = await db.getFirstAsync<{ group_id: string | null }>('SELECT group_id FROM payments WHERE id = ?', paymentId);
  const rows = await db.getAllAsync<{ id: string; invoice_id: string | null }>(
    row?.group_id
      ? 'SELECT id, invoice_id FROM payments WHERE group_id = ? AND deleted_at IS NULL'
      : 'SELECT id, invoice_id FROM payments WHERE id = ? AND deleted_at IS NULL',
    row?.group_id ?? paymentId,
  );
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      await db.runAsync('UPDATE payments SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, r.id);
    }
    for (const r of rows) if (r.invoice_id) await refreshInvoiceStatus(db, r.invoice_id);
    // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
    markDirty(db);
  });
}

/** How much of each item on a bill has already been returned (credit notes + sales returns). */
export async function returnedQty(db: SQLiteDatabase, invoiceId: string): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ key: string; qty: number }>(
    `SELECT COALESCE(ii.item_id, ii.name) AS key, SUM(ii.qty) AS qty
     FROM invoice_items ii JOIN invoices cn ON cn.id = ii.invoice_id
     WHERE cn.ref_invoice_id = ? AND cn.kind IN ${RETURN_KINDS_SQL} AND cn.deleted_at IS NULL
       AND cn.cancelled_at IS NULL AND ii.deleted_at IS NULL
     GROUP BY COALESCE(ii.item_id, ii.name)`,
    invoiceId,
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = r.qty;
  return out;
}

export type LedgerEntry = {
  id: string; // invoice id or payment group/id
  type: 'opening' | 'invoice' | 'credit_note' | 'sales_return' | 'payment_in' | 'payment_out';
  date: string;
  ref: string; // bill no. / mode
  amount_paise: number; // + increases what the party owes you
  balance_paise: number; // running balance after this entry
  invoice_id: string | null;
  cancelled: boolean;
};

/** Party khata: opening balance, bills, credit notes and payments with a running balance. */
export async function partyLedger(db: SQLiteDatabase, partyId: string): Promise<LedgerEntry[]> {
  const party = await db.getFirstAsync<{ opening_balance_paise: number; created_at: string }>(
    'SELECT opening_balance_paise, created_at FROM parties WHERE id = ?',
    partyId,
  );
  const bills = await db.getAllAsync<{
    id: string;
    kind: InvoiceKind;
    invoice_no: string;
    invoice_date: string;
    total_paise: number;
    cancelled_at: string | null;
    created_at: string;
  }>(
    `SELECT id, kind, invoice_no, invoice_date, total_paise, cancelled_at, created_at FROM invoices
     WHERE party_id = ? AND deleted_at IS NULL AND doc_type NOT IN ('quotation', 'proforma')`,
    partyId,
  );
  const pays = await db.getAllAsync<{
    id: string;
    group_id: string | null;
    direction: PaymentDirection;
    amount: number;
    mode: PaymentMode;
    paid_on: string;
    created_at: string;
    invoice_id: string | null;
  }>(
    `SELECT MIN(id) AS id, group_id, direction, SUM(amount_paise) AS amount, mode, paid_on,
            MIN(created_at) AS created_at, MIN(invoice_id) AS invoice_id
     FROM payments WHERE party_id = ? AND deleted_at IS NULL
     GROUP BY COALESCE(group_id, id)`,
    partyId,
  );

  type Raw = Omit<LedgerEntry, 'balance_paise'> & { sortKey: string };
  const raw: Raw[] = [];
  if (party && party.opening_balance_paise !== 0) {
    raw.push({
      id: 'opening',
      type: 'opening',
      date: party.created_at.slice(0, 10),
      ref: '',
      amount_paise: party.opening_balance_paise,
      invoice_id: null,
      cancelled: false,
      sortKey: `0000${party.created_at}`,
    });
  }
  for (const b of bills) {
    const sign = isReturnKind(b.kind) ? -1 : 1;
    raw.push({
      id: b.id,
      type: b.kind,
      date: b.invoice_date,
      ref: b.invoice_no,
      amount_paise: b.cancelled_at ? 0 : sign * b.total_paise,
      invoice_id: b.id,
      cancelled: !!b.cancelled_at,
      sortKey: `${b.invoice_date}${b.created_at}`,
    });
  }
  for (const p of pays) {
    raw.push({
      id: p.id,
      type: p.direction === 'out' ? 'payment_out' : 'payment_in',
      date: p.paid_on,
      ref: p.mode,
      amount_paise: p.direction === 'out' ? p.amount : -p.amount,
      invoice_id: p.invoice_id,
      cancelled: false,
      sortKey: `${p.paid_on}${p.created_at}`,
    });
  }
  raw.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  let bal = 0;
  return raw.map(({ sortKey: _s, ...e }) => {
    bal += e.amount_paise;
    return { ...e, balance_paise: bal };
  });
}
