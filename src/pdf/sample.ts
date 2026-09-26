// Sample bill used for the template preview (with the user's own business details).
import { Business } from '../db/businesses';
import { Invoice, InvoiceLine } from '../db/invoices';
import { todayIso } from '../lib/dates';
import { calcBill } from '../lib/gst';

export function sampleInvoice(business: Business): { invoice: Invoice; lines: InvoiceLine[] } {
  const applyGst = business.gst_registered === 1;
  const buyerState = business.state_code === '29' ? '27' : '29';
  const drafts = [
    { name: 'Basmati Rice 5 kg', hsn: '1006', unit: 'BAG', qty: 10, rate: 45000, disc: 5, gst: 5 },
    { name: 'Mustard Oil 1 L', hsn: '1514', unit: 'BTL', qty: 12, rate: 16000, disc: 0, gst: 5 },
    { name: 'Delivery Service', hsn: '996812', unit: 'NOS', qty: 1, rate: 20000, disc: 0, gst: 18 },
  ];
  const totals = calcBill(
    drafts.map((x) => ({
      qty: x.qty,
      ratePaise: x.rate,
      rateWithTax: false,
      discountType: 'pct' as const,
      discountValue: x.disc,
      gstRate: x.gst,
    })),
    { applyGst, isIgst: applyGst, chargesPaise: 0, roundOff: true },
  );
  const now = new Date().toISOString();
  const invoice: Invoice = {
    id: 'sample',
    business_id: business.id,
    doc_type: applyGst ? 'tax_invoice' : 'bill_of_supply',
    prefix: business.invoice_prefix,
    fy: '',
    seq: 1,
    invoice_no: `${business.invoice_prefix}/SAMPLE/1`,
    invoice_date: todayIso(),
    due_date: null,
    party_id: null,
    party_name: 'Gupta Traders',
    party_phone: '9876543210',
    party_gstin: applyGst ? `${buyerState}ABCDE1234F1Z5` : null,
    party_state_code: buyerState,
    billing_address: '2nd Floor, 12th Main Road, Sector 6',
    shipping_address: null,
    place_of_supply: buyerState,
    is_igst: applyGst ? 1 : 0,
    discount_paise: totals.discountPaise,
    taxable_paise: totals.taxablePaise,
    cgst_paise: totals.cgstPaise,
    sgst_paise: totals.sgstPaise,
    igst_paise: totals.igstPaise,
    charges_label: null,
    charges_paise: totals.chargesPaise,
    round_off: 1,
    round_off_paise: totals.roundOffPaise,
    total_paise: totals.totalPaise,
    received_paise: 300000,
    status: 'partial',
    po_no: 'PO-4521',
    vehicle_no: null,
    notes: 'Thank you for your business!',
    kind: 'invoice',
    ref_invoice_id: null,
    ref_invoice_no: null,
    credited_paise: 0,
    cancelled_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  const lines: InvoiceLine[] = drafts.map((x, i) => ({
    id: `s${i}`,
    invoice_id: 'sample',
    item_id: null,
    item_type: 'product',
    name: x.name,
    hsn: x.hsn,
    unit: x.unit,
    qty: x.qty,
    rate_paise: x.rate,
    rate_with_tax: 0,
    discount_type: 'pct',
    discount_value: x.disc,
    gst_rate: applyGst ? x.gst : 0,
    discount_paise: totals.lines[i].discountPaise,
    taxable_paise: totals.lines[i].taxablePaise,
    tax_paise: totals.lines[i].taxPaise,
    amount_paise: totals.lines[i].amountPaise,
    sort: i,
  }));
  return { invoice, lines };
}
