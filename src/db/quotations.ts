import type { SQLiteDatabase } from 'expo-sqlite';
import { todayIso } from '../lib/dates';
import { BillTotals, calcBill, financialYear, invoiceNumber } from '../lib/gst';
import { newId, nowIso } from '../lib/id';
import {
  InvoiceDraft,
  LineDraft,
  getInvoice,
  refreshInvoiceStatus,
  saveInvoice,
} from './invoices';

/** Number series for quotations: QUOT/26-27/1, QUOT/26-27/2, … (own sequence per FY). */
export const QUOTATION_PREFIX = 'QUOT';

/**
 * Next quotation number in this financial year. Counts deleted/cancelled
 * quotations too, so a number is never reused. Separate from the tax-invoice
 * series (see nextInvoiceNo).
 */
export async function nextQuotationNo(
  db: SQLiteDatabase,
  businessId: string,
  isoDate: string,
): Promise<{ fy: string; seq: number; quotationNo: string }> {
  const fy = financialYear(isoDate);
  const row = await db.getFirstAsync<{ maxSeq: number | null }>(
    `SELECT MAX(seq) AS maxSeq FROM invoices
     WHERE business_id = ? AND fy = ? AND kind = 'invoice' AND doc_type = 'quotation'`,
    businessId,
    fy,
  );
  const seq = (row?.maxSeq ?? 0) + 1;
  return { fy, seq, quotationNo: invoiceNumber(QUOTATION_PREFIX, fy, seq) };
}

/**
 * Creates (quotationId = null) or updates a quotation in one transaction.
 * Mirrors saveInvoice but deliberately:
 * - never touches stock (an estimate moves no goods),
 * - never creates a billing-time payment,
 * - stores the real GST rates on lines (like a tax invoice),
 * - uses the QUOT number series.
 */
export async function saveQuotation(
  db: SQLiteDatabase,
  params: {
    businessId: string;
    quotationId: string | null;
    draft: InvoiceDraft; // draft.docType must be 'quotation'
    lines: LineDraft[];
    totals: BillTotals;
  },
): Promise<string> {
  const { businessId, draft, lines, totals } = params;
  const now = nowIso();
  const id = params.quotationId ?? newId();

  await db.withTransactionAsync(async () => {
    if (params.quotationId) {
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

    if (params.quotationId) {
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
      const no = await nextQuotationNo(db, businessId, draft.invoiceDate);
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
        QUOTATION_PREFIX,
        no.fy,
        no.seq,
        no.quotationNo,
        'invoice',
        null,
        null,
        now,
        now,
      );
    }

    // Lines — no stock movement for quotations.
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
  });

  return id;
}

/**
 * Turns a quotation into a real tax invoice / bill of supply, copying party
 * and lines. Stock IS decremented here (the goods now really move) via
 * saveInvoice. The quotation stays in the Quotations list, linked to the new
 * bill through ref_invoice_id / ref_invoice_no.
 */
export async function convertQuotationToBill(
  db: SQLiteDatabase,
  opts: {
    businessId: string;
    quotationId: string;
    prefix: string;
    gstRegistered: boolean;
    stateCode: string;
  },
): Promise<string> {
  const data = await getInvoice(db, opts.quotationId);
  if (!data) throw new Error('Quotation not found');
  const q = data.invoice;
  if (q.doc_type !== 'quotation') throw new Error('Not a quotation');
  if (q.cancelled_at) throw new Error('Quotation is cancelled');
  // Idempotent: already converted → return the existing bill instead of duplicating.
  if (q.ref_invoice_id) return q.ref_invoice_id;

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
  const isIgst = applyGst && q.is_igst === 1;
  const totals = calcBill(lines, {
    applyGst,
    isIgst,
    chargesPaise: q.charges_paise,
    roundOff: q.round_off === 1,
  });

  const draft: InvoiceDraft = {
    docType: applyGst ? 'tax_invoice' : 'bill_of_supply',
    invoiceDate: todayIso(),
    dueDate: null,
    partyId: q.party_id,
    partyName: q.party_name,
    partyPhone: q.party_phone,
    partyGstin: q.party_gstin,
    partyStateCode: q.party_state_code,
    billingAddress: q.billing_address,
    shippingAddress: q.shipping_address,
    placeOfSupply: q.place_of_supply,
    isIgst,
    chargesLabel: q.charges_label,
    roundOff: q.round_off === 1,
    poNo: q.po_no,
    vehicleNo: q.vehicle_no,
    notes: q.notes,
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

  // Link the quotation to the bill it became.
  const bill = await getInvoice(db, billId);
  await db.runAsync(
    'UPDATE invoices SET ref_invoice_id = ?, ref_invoice_no = ?, updated_at = ? WHERE id = ?',
    billId,
    bill?.invoice.invoice_no ?? null,
    nowIso(),
    q.id,
  );
  await refreshInvoiceStatus(db, q.id);
  return billId;
}
