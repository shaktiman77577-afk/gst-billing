// Tally export — builds a Gateway of Tally "Import Data" XML file from the
// app's posting documents, ready for import via
// Gateway of Tally > Import Data > Vouchers (XML).
//
// FORMAT CHOICE: Tally XML (not CSV). Tally imports XML natively; CSV needs a
// manual column-mapping step in Tally and loses voucher semantics, so a
// faithful XML is the better export. The format below follows Tally's
// documented import shape:
//
//   <ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
//   <BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>...
//   <REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER ...>
//
// Sign convention (matches Tally's import docs and widely-used exporters):
//   debit leg  -> ISDEEMEDPOSITIVE = Yes, AMOUNT negative
//   credit leg -> ISDEEMEDPOSITIVE = No,  AMOUNT positive
// Every voucher's legs sum to exactly zero. Dates are YYYYMMDD. Money is
// integer paise in SQLite and renders as rupees with exactly 2 decimals.
//
// Voucher mapping:
//   sales invoice (tax_invoice / bill_of_supply) -> Sales        (Dr party / Cr Sales + GST)
//   credit_note / sales_return                   -> Credit Note  (reversed Sales)
//   purchase bill                                -> Purchase     (Dr Purchase / Cr supplier)
//   purchase_return                              -> Debit Note   (reversed Purchase)
//   payment received (direction 'in')            -> Receipt      (Dr Cash/Bank / Cr party)
//   payment made (direction 'out')               -> Payment      (Dr party / Cr Cash/Bank)
//   expense                                      -> Payment      (Dr expense head / Cr Cash/Bank)
//
// Deliberately excluded (non-posting docs): quotations (doc_type='quotation'),
// cancelled invoices, soft-deleted rows. Delivery challans / proformas do not
// exist in this schema version and are excluded by the same rule.
//
// Simplifications, documented:
// - Ledger masters for every referenced ledger are emitted first
//   (ACTION="Create"). On a re-import Tally logs "already exists" for the
//   masters but continues — vouchers are the user's responsibility to import
//   once (REMOTEID carries our record id for traceability).
// - A party that is both customer and supplier is created once, under
//   Sundry Debtors.
// - Payment mode 'cash' posts to the "Cash" ledger; upi/card/bank/cheque post
//   to a single "Bank" ledger (the app does not track separate bank accounts).
// - Purchase bills carry no tax split in this schema (total only), so the
//   whole amount posts to the "Purchase" ledger.
// - Extra charges + round-off on a sales bill are folded into the "Sales"
//   credit leg so the voucher balances exactly.
// - Expenses post to one ledger per category (Rent, Salary, Utilities,
//   Transport, Marketing, Other Expenses) under Indirect Expenses.
//
// Read-only: no DB writes, no schema changes. Fully offline.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TallyVoucherType =
  | 'Sales'
  | 'Purchase'
  | 'Payment'
  | 'Receipt'
  | 'Credit Note'
  | 'Debit Note'
  | 'Journal';

export type TallyLeg = {
  ledger: string;
  /** true = debit (Yes + negative amount), false = credit (No + positive). */
  debit: boolean;
  amountPaise: number;
};

export type TallyVoucher = {
  /** Our record id — traceable across re-exports. */
  id: string;
  type: TallyVoucherType;
  number: string;
  /** Tally date format YYYYMMDD. */
  date: string;
  partyLedger: string | null;
  narration: string;
  legs: TallyLeg[];
};

export type TallyLedgerMaster = { name: string; parent: string };

export type TallyDocs = {
  invoices: TallyInvoiceRow[];
  purchases: TallyPurchaseRow[];
  payments: TallyPaymentRow[];
  expenses: TallyExpenseRow[];
};

export type TallyInvoiceRow = {
  kind: string;
  doc_type: string;
  invoice_no: string;
  invoice_date: string;
  party_name: string;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  charges_paise: number;
  round_off_paise: number;
  total_paise: number;
  ref_invoice_no: string | null;
  notes: string | null;
};

export type TallyPurchaseRow = {
  kind: string;
  return_no: string | null;
  supplier_bill_no: string | null;
  purchase_date: string;
  party_name: string;
  total_paise: number;
  note: string | null;
};

export type TallyPaymentRow = {
  id: string;
  direction: string;
  amount_paise: number;
  mode: string;
  paid_on: string;
  notes: string | null;
  party_name: string | null;
};

export type TallyExpenseRow = {
  id: string;
  date: string;
  category: string;
  amount_paise: number;
  note: string | null;
  payment_mode: string;
};

export type TallyBuilt = {
  vouchers: TallyVoucher[];
  masters: TallyLedgerMaster[];
  /** Rows skipped because they cannot post meaningfully (no counterparty). */
  skipped: number;
};

// ---------------------------------------------------------------------------
// Ledger names
// ---------------------------------------------------------------------------

const LEDGER = {
  sales: 'Sales',
  purchase: 'Purchase',
  cash: 'Cash',
  bank: 'Bank',
  cgst: 'CGST',
  sgst: 'SGST',
  igst: 'IGST',
} as const;

const EXPENSE_LEDGERS: Record<string, string> = {
  rent: 'Rent',
  salary: 'Salary',
  utilities: 'Utilities',
  transport: 'Transport',
  marketing: 'Marketing',
  other: 'Other Expenses',
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** '2026-09-27' -> '20260927'. Pass through anything already in that shape. */
export function tallyDate(iso: string): string {
  const d = iso.slice(0, 10).replace(/-/g, '');
  return /^\d{8}$/.test(d) ? d : '';
}

/** Integer paise -> rupees with exactly 2 decimals, e.g. 123456 -> '1234.56'. */
export function rupees(paise: number): string {
  return (Math.round(paise) / 100).toFixed(2);
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 'cash' -> Cash ledger, everything else -> Bank ledger. */
function cashBankLedger(mode: string | null): string {
  return mode === 'cash' ? LEDGER.cash : LEDGER.bank;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Reads every posting document in [from, to] (inclusive, YYYY-MM-DD).
 * Excludes quotations, cancelled and soft-deleted rows.
 */
export async function fetchTallyDocs(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<TallyDocs> {
  const invoices = await db.getAllAsync<TallyInvoiceRow>(
    `SELECT kind, doc_type, invoice_no, invoice_date, party_name,
            taxable_paise, cgst_paise, sgst_paise, igst_paise,
            charges_paise, round_off_paise, total_paise,
            ref_invoice_no, notes
     FROM invoices
     WHERE business_id = ? AND deleted_at IS NULL AND cancelled_at IS NULL
       AND doc_type != 'quotation'
       AND kind IN ('invoice', 'credit_note', 'sales_return')
       AND invoice_date >= ? AND invoice_date <= ?
     ORDER BY invoice_date, created_at`,
    businessId,
    from,
    to,
  );
  const purchases = await db.getAllAsync<TallyPurchaseRow>(
    `SELECT kind, return_no, supplier_bill_no, purchase_date, party_name,
            total_paise, note
     FROM purchases
     WHERE business_id = ? AND deleted_at IS NULL
       AND kind IN ('purchase', 'purchase_return')
       AND purchase_date >= ? AND purchase_date <= ?
     ORDER BY purchase_date, created_at`,
    businessId,
    from,
    to,
  );
  const payments = await db.getAllAsync<TallyPaymentRow>(
    `SELECT p.id, p.direction, p.amount_paise, p.mode, p.paid_on, p.notes,
            COALESCE(pt.name, i.party_name) AS party_name
     FROM payments p
     LEFT JOIN parties pt ON pt.id = p.party_id AND pt.deleted_at IS NULL
     LEFT JOIN invoices i ON i.id = p.invoice_id
     WHERE p.business_id = ? AND p.deleted_at IS NULL
       AND p.paid_on >= ? AND p.paid_on <= ?
     ORDER BY p.paid_on, p.created_at`,
    businessId,
    from,
    to,
  );
  const expenses = await db.getAllAsync<TallyExpenseRow>(
    `SELECT id, date, category, amount_paise, note, payment_mode
     FROM expenses
     WHERE business_id = ? AND deleted_at IS NULL
       AND date >= ? AND date <= ?
     ORDER BY date, created_at`,
    businessId,
    from,
    to,
  );
  return { invoices, purchases, payments, expenses };
}

// ---------------------------------------------------------------------------
// Voucher building
// ---------------------------------------------------------------------------

function dr(ledger: string, amountPaise: number): TallyLeg {
  return { ledger, debit: true, amountPaise };
}
function cr(ledger: string, amountPaise: number): TallyLeg {
  return { ledger, debit: false, amountPaise };
}

export function buildTallyVouchers(docs: TallyDocs): TallyBuilt {
  const vouchers: TallyVoucher[] = [];
  const masters = new Map<string, string>(); // name -> parent (first wins)
  let skipped = 0;

  const customer = (name: string) => {
    if (!masters.has(name)) masters.set(name, 'Sundry Debtors');
  };
  const supplier = (name: string) => {
    if (!masters.has(name)) masters.set(name, 'Sundry Creditors');
  };
  const ensure = (name: string, parent: string) => {
    if (!masters.has(name)) masters.set(name, parent);
  };
  const push = (v: TallyVoucher) => {
    // Guard: never emit a zero-amount or unbalanced voucher.
    const total = v.legs.reduce((s, l) => s + l.amountPaise, 0);
    const signed = v.legs.reduce((s, l) => s + (l.debit ? -l.amountPaise : l.amountPaise), 0);
    if (total <= 0 || signed !== 0) {
      skipped += 1;
      return;
    }
    vouchers.push(v);
  };

  for (const inv of docs.invoices) {
    const party = (inv.party_name || '').trim();
    if (!party) {
      skipped += 1;
      continue;
    }
    customer(party);
    ensure(LEDGER.sales, 'Sales Accounts');
    const salesPaise = inv.taxable_paise + inv.charges_paise + inv.round_off_paise;
    const taxLegs: TallyLeg[] = [];
    if (inv.cgst_paise) {
      ensure(LEDGER.cgst, 'Duties & Taxes');
      taxLegs.push({ ledger: LEDGER.cgst, debit: false, amountPaise: inv.cgst_paise });
    }
    if (inv.sgst_paise) {
      ensure(LEDGER.sgst, 'Duties & Taxes');
      taxLegs.push({ ledger: LEDGER.sgst, debit: false, amountPaise: inv.sgst_paise });
    }
    if (inv.igst_paise) {
      ensure(LEDGER.igst, 'Duties & Taxes');
      taxLegs.push({ ledger: LEDGER.igst, debit: false, amountPaise: inv.igst_paise });
    }
    const isReturn = inv.kind === 'credit_note' || inv.kind === 'sales_return';
    const salesLeg = cr(LEDGER.sales, salesPaise);
    const partyLeg = dr(party, inv.total_paise);
    const legs = isReturn
      ? [cr(party, inv.total_paise), { ...salesLeg, debit: true }, ...taxLegs.map((t) => ({ ...t, debit: true }))]
      : [partyLeg, salesLeg, ...taxLegs];
    const kindLabel =
      inv.kind === 'credit_note' ? 'Credit note' : inv.kind === 'sales_return' ? 'Sales return' : 'Tax invoice';
    const narration =
      `${kindLabel} ${inv.invoice_no}` +
      (inv.ref_invoice_no ? ` against ${inv.ref_invoice_no}` : '') +
      (inv.notes ? ` — ${inv.notes}` : '');
    push({
      id: `inv-${inv.invoice_no}`,
      type: isReturn ? 'Credit Note' : 'Sales',
      number: inv.invoice_no,
      date: tallyDate(inv.invoice_date),
      partyLedger: party,
      narration,
      legs,
    });
  }

  for (const p of docs.purchases) {
    const party = (p.party_name || '').trim();
    if (!party) {
      skipped += 1;
      continue;
    }
    supplier(party);
    ensure(LEDGER.purchase, 'Purchase Accounts');
    const isReturn = p.kind === 'purchase_return';
    const number = p.return_no || p.supplier_bill_no || (isReturn ? 'Purchase Return' : 'Purchase');
    const legs = isReturn
      ? [dr(party, p.total_paise), cr(LEDGER.purchase, p.total_paise)]
      : [dr(LEDGER.purchase, p.total_paise), cr(party, p.total_paise)];
    const narration =
      (isReturn ? 'Purchase return ' : 'Purchase bill ') +
      (p.supplier_bill_no ? p.supplier_bill_no : p.purchase_date) +
      (p.note ? ` — ${p.note}` : '');
    push({
      id: `pur-${number}`,
      type: isReturn ? 'Debit Note' : 'Purchase',
      number,
      date: tallyDate(p.purchase_date),
      partyLedger: party,
      narration,
      legs,
    });
  }

  for (const pay of docs.payments) {
    const party = (pay.party_name || '').trim();
    if (!party || !pay.direction) {
      skipped += 1;
      continue;
    }
    const isIn = pay.direction === 'in';
    if (isIn) customer(party);
    else supplier(party);
    const cb = cashBankLedger(pay.mode);
    ensure(cb, cb === LEDGER.cash ? 'Cash-in-Hand' : 'Bank Accounts');
    const short = pay.id.replace(/-/g, '').slice(0, 8) || 'pay';
    const legs = isIn ? [dr(cb, pay.amount_paise), cr(party, pay.amount_paise)] : [dr(party, pay.amount_paise), cr(cb, pay.amount_paise)];
    const narration = pay.notes || (isIn ? `Receipt from ${party}` : `Payment to ${party}`);
    push({
      id: `pay-${pay.id}`,
      type: isIn ? 'Receipt' : 'Payment',
      number: `${isIn ? 'RCPT' : 'PAY'}/${short}`,
      date: tallyDate(pay.paid_on),
      partyLedger: party,
      narration,
      legs,
    });
  }

  for (const e of docs.expenses) {
    const head = EXPENSE_LEDGERS[e.category] ?? 'Other Expenses';
    ensure(head, 'Indirect Expenses');
    const cb = cashBankLedger(e.payment_mode);
    ensure(cb, cb === LEDGER.cash ? 'Cash-in-Hand' : 'Bank Accounts');
    const short = e.id.replace(/-/g, '').slice(0, 8) || 'exp';
    const narration = e.note || `Expense: ${head}`;
    push({
      id: `exp-${e.id}`,
      type: 'Payment',
      number: `EXP/${short}`,
      date: tallyDate(e.date),
      partyLedger: null,
      narration,
      legs: [dr(head, e.amount_paise), cr(cb, e.amount_paise)],
    });
  }

  const masterList: TallyLedgerMaster[] = [...masters.entries()].map(([name, parent]) => ({ name, parent }));
  return { vouchers, masters: masterList, skipped };
}

// ---------------------------------------------------------------------------
// XML building (pure — no expo imports)
// ---------------------------------------------------------------------------

function masterXml(m: TallyLedgerMaster): string {
  const name = xmlEscape(m.name);
  return (
    `  <TALLYMESSAGE xmlns:UDF="TallyUDF">\n` +
    `   <LEDGER NAME="${name}" ACTION="Create">\n` +
    `    <NAME>${name}</NAME>\n` +
    `    <PARENT>${xmlEscape(m.parent)}</PARENT>\n` +
    `    <OPENINGBALANCE>0</OPENINGBALANCE>\n` +
    `   </LEDGER>\n` +
    `  </TALLYMESSAGE>\n`
  );
}

function legXml(leg: TallyLeg): string {
  const amount = rupees(leg.amountPaise);
  return (
    `    <ALLLEDGERENTRIES.LIST>\n` +
    `     <LEDGERNAME>${xmlEscape(leg.ledger)}</LEDGERNAME>\n` +
    `     <ISDEEMEDPOSITIVE>${leg.debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n` +
    `     <AMOUNT>${leg.debit ? '-' : ''}${amount}</AMOUNT>\n` +
    `    </ALLLEDGERENTRIES.LIST>\n`
  );
}

function voucherXml(v: TallyVoucher): string {
  const party = v.partyLedger ? `    <PARTYLEDGERNAME>${xmlEscape(v.partyLedger)}</PARTYLEDGERNAME>\n` : '';
  return (
    `  <TALLYMESSAGE xmlns:UDF="TallyUDF">\n` +
    `   <VOUCHER REMOTEID="${xmlEscape(v.id)}" VCHTYPE="${v.type}" ACTION="Create">\n` +
    `    <DATE>${v.date}</DATE>\n` +
    `    <VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME>\n` +
    `    <VOUCHERNUMBER>${xmlEscape(v.number)}</VOUCHERNUMBER>\n` +
    party +
    `    <NARRATION>${xmlEscape(v.narration)}</NARRATION>\n` +
    v.legs.map(legXml).join('') +
    `   </VOUCHER>\n` +
    `  </TALLYMESSAGE>\n`
  );
}

/**
 * Builds the complete Tally import XML. Masters come first so referenced
 * ledgers exist when the vouchers import.
 */
export function buildTallyXml(vouchers: TallyVoucher[], masters: TallyLedgerMaster[], companyName: string): string {
  const safeCompany = xmlEscape(companyName || 'Company');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ENVELOPE>\n` +
    ` <HEADER>\n` +
    `  <TALLYREQUEST>Import Data</TALLYREQUEST>\n` +
    ` </HEADER>\n` +
    ` <BODY>\n` +
    `  <IMPORTDATA>\n` +
    `   <REQUESTDESC>\n` +
    `    <REPORTNAME>Vouchers</REPORTNAME>\n` +
    `    <STATICVARIABLES>\n` +
    `     <SVCURRENTCOMPANY>${safeCompany}</SVCURRENTCOMPANY>\n` +
    `    </STATICVARIABLES>\n` +
    `   </REQUESTDESC>\n` +
    `   <REQUESTDATA>\n` +
    masters.map(masterXml).join('') +
    vouchers.map(voucherXml).join('') +
    `   </REQUESTDATA>\n` +
    `  </IMPORTDATA>\n` +
    ` </BODY>\n` +
    `</ENVELOPE>\n`
  );
}

// ---------------------------------------------------------------------------
// Export entry point (file + share sheet)
// ---------------------------------------------------------------------------

function tallyFileName(from: string, to: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '');
  return `Tally-${safe(from)}-to-${safe(to)}.xml`;
}

/**
 * Builds the Tally XML for [from, to], writes it to the app cache dir (same
 * File/Paths pattern as src/lib/gstr1json.ts) and opens the system share
 * sheet. Returns the file URI and voucher count, or null when there is
 * nothing to export in the range.
 */
export async function exportTallyXml(
  db: SQLiteDatabase,
  businessId: string,
  businessName: string,
  from: string,
  to: string,
): Promise<{ uri: string; vouchers: number } | null> {
  const docs = await fetchTallyDocs(db, businessId, from, to);
  const { vouchers, masters } = buildTallyVouchers(docs);
  if (vouchers.length === 0) return null;
  const xml = buildTallyXml(vouchers, masters, businessName);
  const name = tallyFileName(from, to);
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.write(xml); // string defaults to UTF-8
  await Sharing.shareAsync(file.uri, { mimeType: 'application/xml', dialogTitle: name });
  return { uri: file.uri, vouchers: vouchers.length };
}
