// Proforma invoices — the quotation twin with its own PI/fy/seq series.
//
// A proforma lives in `invoices` with kind='invoice' and doc_type='proforma'
// (doc_type is free TEXT — no schema migration). Behaviour is EXACTLY like a
// quotation:
// - never moves stock (an estimate moves no goods),
// - never creates a billing-time payment,
// - stores the real GST rates on lines (shown on the doc, like quotations),
// - excluded from sales totals, daybook, party balances, GSTR-1/JSON and
//   reports (every `doc_type != 'quotation'` guard also excludes 'proforma').
//
// A proforma can be converted into a real tax invoice / bill of supply via
// convertProformaToBill. Conversion is idempotent: calling it twice returns
// the same bill instead of creating a second one.
import type { SQLiteDatabase } from 'expo-sqlite';
import { todayIso } from '../lib/dates';
import { BillTotals, calcBill, financialYear, invoiceNumber } from '../lib/gst';
import { newId, nowIso } from '../lib/id';
import { markDirty } from '../lib/backup';
import {
  DUPLICATE_INVOICE_NO,
  InvoiceDraft,
  LineDraft,
  getInvoice,
  refreshInvoiceStatus,
  saveInvoice,
} from './invoices';

export { DUPLICATE_INVOICE_NO };

/** Number series for proformas: PI/26-27/1, PI/26-27/2, … (own sequence per FY). */
export const PROFORMA_PREFIX = 'PI';

/**
 * Next proforma number in this financial year. Counts deleted/cancelled
 * proformas too, so a number is never reused. Separate from the tax-invoice
 * and quotation series.
 *
 * Business-wide uniqueness: a hand-typed bill number could have taken a
 * PI/…/n slot, so candidates are checked against every invoice_no in the
 * business (including deleted/cancelled) and the sequence is bumped past any
 * collision.
 */
export async function nextProformaNo(
  db: SQLiteDatabase,
  businessId: string,
  isoDate: string,
): Promise<{ fy: string; seq: number; proformaNo: string }> {
  const fy = financialYear(isoDate);
  const row = await db.getFirstAsync<{ maxSeq: number | null }>(
    `SELECT MAX(seq) AS maxSeq FROM invoices
     WHERE business_id = ? AND fy = ? AND kind = 'invoice' AND doc_type = 'proforma'`,
    businessId,
    fy,
  );
  let seq = (row?.maxSeq ?? 0) + 1;
  for (;;) {
    const proformaNo = invoiceNumber(PROFORMA_PREFIX, fy, seq);
    const taken = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM invoices WHERE business_id = ? AND invoice_no = ?',
      businessId,
      proformaNo,
    );
    if (!taken) return { fy, seq, proformaNo };
    seq += 1;
  }
}

/** All proformas for a business, newest first (own list screen). */
export async function listProformas(
  db: SQLiteDatabase,
  businessId: string,
  limit = 500,
): Promise<
  {
    id: string;
    invoice_no: string;
    invoice_date: string;
    party_name: string;
    total_paise: number;
    status: string;
    ref_invoice_id: string | null;
    ref_invoice_no: string | null;
    cancelled_at: string | null;
  }[]
> {
  return db.getAllAsync(
    `SELECT id, invoice_no, invoice_date, party_name, total_paise, status,
            ref_invoice_id, ref_invoice_no, cancelled_at
     FROM invoices
     WHERE business_id = ? AND kind = 'invoice' AND doc_type = 'proforma' AND deleted_at IS NULL
     ORDER BY invoice_date DESC, created_at DESC LIMIT ?`,
    businessId,
    limit,
  );
}

/**
 * Creates (proformaId = null) or updates a proforma in one transaction.
 * Mirrors saveQuotation exactly:
 * - never touches stock (an estimate moves no goods),
 * - never creates a billing-time payment,
 * - stores the real GST rates on lines (like a tax invoice),
 * - uses the PI number series (unique business-wide, see nextProformaNo).
 */
export async function saveProforma(
  db: SQLiteDatabase,
  params: {
    businessId: string;
    proformaId: string | null;
    draft: InvoiceDraft; // draft.docType must be 'proforma'
    lines: LineDraft[];
    totals: BillTotals;
  },
): Promise<string> {
  const { businessId, draft, lines, totals } = params;
  const now = nowIso();
  const id = params.proformaId ?? newId();

  await db.withTransactionAsync(async () => {
    if (params.proformaId) {
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

    if (params.proformaId) {
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
      const no = await nextProformaNo(db, businessId, draft.invoiceDate);
      // GST: numbers must be unique. Block exact duplicates business-wide —
      // across financial years and series, including deleted and cancelled
      // bills, so a number is never reused.
      const dup = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM invoices WHERE business_id = ? AND invoice_no = ? AND id != ?',
        businessId,
        no.proformaNo,
        id,
      );
      if (dup) throw new Error(DUPLICATE_INVOICE_NO);
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
        PROFORMA_PREFIX,
        no.fy,
        no.seq,
        no.proformaNo,
        'invoice',
        null,
        null,
        now,
        now,
      );
    }

    // Lines — no stock movement for proformas.
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
        l.gstRate,
        r.discountPaise,
        r.taxablePaise,
        r.taxPaise,
        r.amountPaise,
        i,
        now,
        now,
      );
    }

    await refreshInvoiceStatus(db, id);
    // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
    markDirty(db);
  });

  return id;
}

/**
 * Turns a proforma into a real tax invoice / bill of supply, copying party
 * and lines. Stock IS decremented here (the goods now really move) via
 * saveInvoice. The proforma stays in the Proforma list, linked to the new
 * bill through ref_invoice_id / ref_invoice_no.
 */
export async function convertProformaToBill(
  db: SQLiteDatabase,
  opts: {
    businessId: string;
    proformaId: string;
    prefix: string;
    gstRegistered: boolean;
    stateCode: string;
  },
): Promise<string> {
  const data = await getInvoice(db, opts.proformaId);
  if (!data) throw new Error('Proforma not found');
  const p = data.invoice;
  if (p.doc_type !== 'proforma') throw new Error('Not a proforma');
  if (p.cancelled_at) throw new Error('Proforma is cancelled');
  // Idempotent: already converted → return the existing bill instead of duplicating.
  if (p.ref_invoice_id) return p.ref_invoice_id;

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
    gstRate: l.gst_rate,
  }));
  const applyGst = opts.gstRegistered;
  const isIgst = applyGst && p.is_igst === 1;
  const totals = calcBill(lines, {
    applyGst,
    isIgst,
    chargesPaise: p.charges_paise,
    roundOff: p.round_off === 1,
  });

  const draft: InvoiceDraft = {
    docType: applyGst ? 'tax_invoice' : 'bill_of_supply',
    invoiceDate: todayIso(),
    dueDate: null,
    partyId: p.party_id,
    partyName: p.party_name,
    partyPhone: p.party_phone,
    partyGstin: p.party_gstin,
    partyStateCode: p.party_state_code,
    billingAddress: p.billing_address,
    shippingAddress: p.shipping_address,
    placeOfSupply: p.place_of_supply,
    isIgst,
    chargesLabel: p.charges_label,
    roundOff: p.round_off === 1,
    poNo: p.po_no,
    vehicleNo: p.vehicle_no,
    notes: p.notes,
    receivedPaise: 0,
    paymentMode: 'cash',
  };

  const billId = await saveInvoice(db, {
    businessId: opts.businessId,
    invoiceId: null,
    prefix: opts.prefix,
    draft,
    lines,
    totals,
  });

  // Link the proforma to the bill it became.
  const bill = await getInvoice(db, billId);
  await db.runAsync(
    'UPDATE invoices SET ref_invoice_id = ?, ref_invoice_no = ?, updated_at = ? WHERE id = ?',
    billId,
    bill?.invoice.invoice_no ?? null,
    nowIso(),
    p.id,
  );
  await refreshInvoiceStatus(db, p.id);
  return billId;
}
