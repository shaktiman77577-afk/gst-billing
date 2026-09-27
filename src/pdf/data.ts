// Turns a saved bill into ready-to-print text for the PDF templates.
import { stateName } from '../data/states';
import { Business } from '../db/businesses';
import { formatQty } from '../db/items';
import { Invoice, InvoiceLine, isReturnKind } from '../db/invoices';
import { formatDate } from '../lib/dates';
import { amountInWords } from '../lib/gst';
import { formatPaise } from '../lib/money';
import { qrSvg, upiLink } from './qr';

export type DocLine = {
  sno: number;
  name: string;
  hsn: string;
  qty: string;
  rate: string;
  discount: string;
  discountPct: string;
  taxable: string;
  gstRate: string;
  tax: string;
  amount: string;
};

export type HsnRow = { hsn: string; taxable: string; rate: string; cgst: string; sgst: string; igst: string; tax: string };

// Invoice copy for the PDF header label (standard GST copies).
export type CopyKind = 'original' | 'duplicate' | 'triplicate';

export const COPY_LABELS: Record<CopyKind, string> = {
  original: 'ORIGINAL FOR RECIPIENT',
  duplicate: 'DUPLICATE FOR TRANSPORTER',
  triplicate: 'TRIPLICATE FOR SUPPLIER',
};

export type Doc = {
  title: string; // TAX INVOICE / BILL OF SUPPLY / CREDIT NOTE / QUOTATION / DELIVERY CHALLAN / PROFORMA INVOICE
  isCreditNote: boolean;
  cancelled: boolean;
  applyGst: boolean;
  isIgst: boolean;
  color: string;
  tint: string; // light version of color
  seller: {
    name: string;
    tagline: string;
    address: string;
    gstin: string;
    pan: string;
    phone: string;
    logo: string | null;
    signature: string | null;
  };
  buyer: { name: string; address: string; shipping: string; phone: string; gstin: string; state: string };
  meta: {
    invoiceNo: string;
    date: string;
    dueDate: string;
    poNo: string;
    vehicleNo: string;
    placeOfSupply: string;
    refNo: string;
  };
  lines: DocLine[];
  totalQty: string;
  hsn: HsnRow[];
  totals: {
    taxable: string;
    discount: string;
    discountRaw: number;
    cgst: string;
    sgst: string;
    igst: string;
    cgstRaw: number;
    sgstRaw: number;
    igstRaw: number;
    taxTotal: string;
    chargesLabel: string;
    charges: string;
    chargesRaw: number;
    roundOff: string;
    roundOffRaw: number;
    total: string;
    received: string;
    receivedRaw: number;
    credited: string;
    creditedRaw: number;
    balance: string;
    balanceRaw: number;
    words: string;
  };
  taxLines: { label: string; amount: string }[]; // e.g. "CGST @9%" rows
  bank: { name: string; accountNo: string; ifsc: string; bankName: string } | null;
  upiId: string;
  qr: string; // inline svg
  notes: string;
  terms: string[];
  showFooter: boolean;
  copyLabel: string; // ORIGINAL FOR RECIPIENT / DUPLICATE FOR TRANSPORTER / TRIPLICATE FOR SUPPLIER
  isPro: boolean; // Pro: no footer at all — completely clean professional bill
};

const esc = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

export const DEFAULT_TERMS = [
  'Goods once sold will not be taken back.',
  'Interest @18% p.a. will be charged if the bill is not paid within the due date.',
  'Subject to local jurisdiction only.',
].join('\n');

export function buildDoc(
  business: Business,
  inv: Invoice,
  lines: InvoiceLine[],
  opts: { color?: string; showFooter?: boolean; copy?: CopyKind; isPro?: boolean } = {},
): Doc {
  const color = opts.color ?? business.theme_color ?? '#1E3A8A';
  const isQuotation = inv.doc_type === 'quotation';
  const isChallan = inv.doc_type === 'delivery_challan';
  const isProforma = inv.doc_type === 'proforma';
  // Quotations/proformas of a GST-registered business carry GST like a tax invoice.
  // Delivery challans never carry GST (stock moves, nothing is billed).
  const applyGst =
    inv.doc_type === 'tax_invoice' ||
    ((isQuotation || isProforma) && inv.cgst_paise + inv.sgst_paise + inv.igst_paise > 0);
  const isIgst = applyGst && inv.is_igst === 1;
  const sellerState = stateName(business.state_code);

  // HSN-wise tax summary.
  const map = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
  for (const l of lines) {
    const key = `${l.hsn ?? ''}|${l.gst_rate}`;
    const g = map.get(key) ?? { hsn: l.hsn ?? '-', rate: l.gst_rate, taxable: 0, tax: 0 };
    g.taxable += l.taxable_paise;
    g.tax += l.tax_paise;
    map.set(key, g);
  }
  const hsn: HsnRow[] = [...map.values()].map((g) => {
    const c = isIgst ? 0 : Math.round(g.tax / 2);
    return {
      hsn: esc(g.hsn),
      taxable: formatPaise(g.taxable, false),
      rate: pct(isIgst ? g.rate : g.rate / 2),
      cgst: formatPaise(c, false),
      sgst: formatPaise(isIgst ? 0 : g.tax - c, false),
      igst: formatPaise(isIgst ? g.tax : 0, false),
      tax: formatPaise(g.tax, false),
    };
  });

  // Tax rows by rate (for the totals block).
  const byRate = new Map<number, number>();
  for (const l of lines) if (l.gst_rate > 0) byRate.set(l.gst_rate, (byRate.get(l.gst_rate) ?? 0) + l.tax_paise);
  const taxLines: { label: string; amount: string }[] = [];
  [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([rate, tax]) => {
      if (isIgst) taxLines.push({ label: `IGST @${pct(rate)}`, amount: formatPaise(tax) });
      else {
        const c = Math.round(tax / 2);
        taxLines.push({ label: `CGST @${pct(rate / 2)}`, amount: formatPaise(c) });
        taxLines.push({ label: `SGST @${pct(rate / 2)}`, amount: formatPaise(tax - c) });
      }
    });

  const isCreditNote = isReturnKind(inv.kind);
  const isSalesReturn = inv.kind === 'sales_return';
  const cancelled = !!inv.cancelled_at;
  const balance = isCreditNote ? 0 : inv.total_paise - inv.received_paise - inv.credited_paise;
  const upi = business.upi_id?.trim() ?? '';
  // QR only when something is still to be paid on a live bill — never on a
  // quotation, proforma or delivery challan (no money moves on any of them).
  const qr =
    upi && !isCreditNote && !isQuotation && !isProforma && !isChallan && !cancelled && balance > 0
      ? qrSvg(upiLink(upi, business.name, balance, inv.invoice_no))
      : '';
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  return {
    title: isChallan
      ? 'DELIVERY CHALLAN'
      : isProforma
        ? 'PROFORMA INVOICE'
      : isSalesReturn
        ? 'SALES RETURN'
        : isCreditNote
          ? 'CREDIT NOTE'
          : isQuotation
            ? 'QUOTATION'
            : applyGst
              ? 'TAX INVOICE'
              : 'BILL OF SUPPLY',
    isCreditNote,
    cancelled,
    applyGst,
    isIgst,
    color,
    tint: tint(color, 0.1),
    seller: {
      name: esc(business.name),
      tagline: esc(business.tagline),
      address: esc([business.address, business.city, sellerState, business.pincode].filter(Boolean).join(', ')),
      gstin: esc(business.gstin),
      pan: esc(business.pan),
      phone: esc(business.phone),
      logo: business.logo,
      signature: business.signature,
    },
    buyer: {
      name: esc(inv.party_name),
      address: esc(inv.billing_address),
      shipping: esc(inv.shipping_address),
      phone: esc(inv.party_phone),
      gstin: esc(inv.party_gstin),
      state: esc(inv.party_state_code ? stateName(inv.party_state_code) : ''),
    },
    meta: {
      invoiceNo: esc(inv.invoice_no),
      date: formatDate(inv.invoice_date),
      dueDate: formatDate(inv.due_date),
      poNo: esc(inv.po_no),
      vehicleNo: esc(inv.vehicle_no),
      placeOfSupply: `${stateName(inv.place_of_supply)} (${inv.place_of_supply})`,
      refNo: esc(inv.ref_invoice_no),
    },
    lines: lines.map((l, i) => ({
      sno: i + 1,
      name: esc(l.name),
      hsn: esc(l.hsn),
      qty: `${formatQty(l.qty)} ${esc(l.unit)}`,
      rate: formatPaise(l.rate_paise, false),
      discount: l.discount_paise > 0 ? formatPaise(l.discount_paise, false) : '',
      discountPct: l.discount_paise > 0 && l.discount_type === 'pct' ? pct(l.discount_value) : '',
      taxable: formatPaise(l.taxable_paise, false),
      gstRate: pct(l.gst_rate),
      tax: formatPaise(l.tax_paise, false),
      amount: formatPaise(l.amount_paise, false),
    })),
    totalQty: formatQty(totalQty),
    hsn,
    totals: {
      taxable: formatPaise(inv.taxable_paise),
      discount: formatPaise(inv.discount_paise),
      discountRaw: inv.discount_paise,
      cgst: formatPaise(inv.cgst_paise),
      sgst: formatPaise(inv.sgst_paise),
      igst: formatPaise(inv.igst_paise),
      cgstRaw: inv.cgst_paise,
      sgstRaw: inv.sgst_paise,
      igstRaw: inv.igst_paise,
      taxTotal: formatPaise(inv.cgst_paise + inv.sgst_paise + inv.igst_paise),
      chargesLabel: esc(inv.charges_label || 'Other Charges'),
      charges: formatPaise(inv.charges_paise),
      chargesRaw: inv.charges_paise,
      roundOff: `${inv.round_off_paise < 0 ? '- ' : ''}${formatPaise(Math.abs(inv.round_off_paise))}`,
      roundOffRaw: inv.round_off_paise,
      total: formatPaise(inv.total_paise),
      received: formatPaise(inv.received_paise),
      receivedRaw: inv.received_paise,
      credited: formatPaise(inv.credited_paise),
      creditedRaw: isCreditNote ? 0 : inv.credited_paise,
      balance: formatPaise(Math.max(balance, 0)),
      balanceRaw: balance,
      words: amountInWords(inv.total_paise),
    },
    taxLines,
    bank:
      business.bank_account_no || business.bank_ifsc
        ? {
            name: esc(business.bank_account_name || business.name),
            accountNo: esc(business.bank_account_no),
            ifsc: esc(business.bank_ifsc),
            bankName: esc(business.bank_name),
          }
        : null,
    upiId: esc(upi),
    qr,
    notes:
      isQuotation || isProforma
        ? ['This is not a tax invoice.', esc(inv.notes)].filter(Boolean).join('<br/>')
        : esc(inv.notes),
    terms: (business.terms ?? DEFAULT_TERMS)
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map(esc),
    showFooter: opts.showFooter ?? true,
    copyLabel: COPY_LABELS[opts.copy ?? 'original'],
    isPro: opts.isPro ?? false,
  };
}
