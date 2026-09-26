// GSTR-1 CSV export (Feature F2) — invoice-wise export for the user's CA.
//
// One CSV, three sections marked by the `section` column:
//   B2B  — live tax invoices to GST-registered parties (party has a GSTIN)
//   B2C  — live tax invoices to unregistered parties / consumers (no GSTIN)
//   CDNR — live credit notes: kind='credit_note', all money values NEGATED
//          so the CA can sum the whole sheet directly (see NOTES.md).
//
// Explicitly excluded: quotations (doc_type='quotation'), bills of supply
// (doc_type='bill_of_supply'), soft-deleted and cancelled docs.
//
// Read-only: no DB writes, no schema changes. Money stays in integer paise
// until the CSV boundary, where it is formatted as rupees with 2 decimals.
// Fully offline: sqlite read + file write + system share sheet, no network.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

// Real GSTR-1 sections: B2B = supplies to GST-registered parties (has a
// GSTIN), B2C = supplies to unregistered/consumers (no GSTIN), CDNR =
// credit notes issued. Never label a no-GSTIN bill as B2B — the CA needs
// the split to file correctly.
export type Gstr1Section = 'B2B' | 'B2C' | 'CDNR';

export type Gstr1Row = {
  section: Gstr1Section;
  invoiceNo: string;
  date: string; // YYYY-MM-DD, as stored in invoice_date
  partyName: string;
  gstin: string;
  stateCode: string;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

type DbRow = {
  invoice_no: string | null;
  invoice_date: string | null;
  party_name: string | null;
  party_gstin: string | null;
  party_state_code: string | null;
  taxable_paise: number | null;
  cgst_paise: number | null;
  sgst_paise: number | null;
  igst_paise: number | null;
  total_paise: number | null;
};

const LIVE = `cancelled_at IS NULL AND deleted_at IS NULL`;

const COLS = `invoice_no, invoice_date, party_name, party_gstin, party_state_code,
  taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise`;

function toRow(r: DbRow, section: Gstr1Section, negate: boolean): Gstr1Row {
  const m = negate ? -1 : 1;
  return {
    section,
    invoiceNo: r.invoice_no ?? '',
    date: r.invoice_date ?? '',
    partyName: r.party_name ?? '',
    gstin: r.party_gstin ?? '',
    stateCode: r.party_state_code ?? '',
    taxablePaise: m * (r.taxable_paise ?? 0),
    cgstPaise: m * (r.cgst_paise ?? 0),
    sgstPaise: m * (r.sgst_paise ?? 0),
    igstPaise: m * (r.igst_paise ?? 0),
    totalPaise: m * (r.total_paise ?? 0),
  };
}

// Returns B2B rows first (oldest first), then B2C (oldest first), then
// CDNR rows (oldest first).
export async function fetchGstr1Rows(db: SQLiteDatabase, businessId: string): Promise<Gstr1Row[]> {
  const invoices = await db.getAllAsync<DbRow>(
    `SELECT ${COLS} FROM invoices
     WHERE business_id = ? AND kind = 'invoice' AND doc_type = 'tax_invoice' AND ${LIVE}
     ORDER BY invoice_date ASC, invoice_no ASC`,
    businessId,
  );
  const creditNotes = await db.getAllAsync<DbRow>(
    `SELECT ${COLS} FROM invoices
     WHERE business_id = ? AND kind = 'credit_note' AND ${LIVE}
     ORDER BY invoice_date ASC, invoice_no ASC`,
    businessId,
  );
  const b2b: Gstr1Row[] = [];
  const b2c: Gstr1Row[] = [];
  for (const r of invoices) {
    // A GSTIN on the party = registered recipient = B2B; otherwise B2C.
    const section: Gstr1Section = r.party_gstin && r.party_gstin.trim() ? 'B2B' : 'B2C';
    (section === 'B2B' ? b2b : b2c).push(toRow(r, section, false));
  }
  return [...b2b, ...b2c, ...creditNotes.map((r) => toRow(r, 'CDNR', true))];
}

// Paise -> "1234.56" at the CSV boundary. Negated rows print "-12.50".
function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

// RFC 4180 quoting: wrap in quotes when the field contains a comma, quote,
// CR or LF; double any inner quotes.
function csvField(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GSTR1_HEADER = [
  'section',
  'invoice_no',
  'date',
  'party_name',
  'gstin',
  'state_code',
  'taxable',
  'cgst',
  'sgst',
  'igst',
  'total',
];

export function buildGstr1Csv(rows: Gstr1Row[]): string {
  const lines = [GSTR1_HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.section),
        csvField(r.invoiceNo),
        csvField(r.date),
        csvField(r.partyName),
        csvField(r.gstin),
        csvField(r.stateCode),
        csvField(rupees(r.taxablePaise)),
        csvField(rupees(r.cgstPaise)),
        csvField(rupees(r.sgstPaise)),
        csvField(rupees(r.igstPaise)),
        csvField(rupees(r.totalPaise)),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

function csvFileName(businessName: string): string {
  const safe = (businessName || 'gstr1').replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 40);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `GSTR1-${safe}-${stamp}.csv`;
}

// Builds the CSV, writes it to the app cache dir (same File/Paths pattern as
// src/pdf/share.ts) and opens the system share sheet (expo-sharing).
// Returns the file URI, or null when there is nothing to export.
export async function exportGstr1Csv(
  db: SQLiteDatabase,
  businessId: string,
  businessName: string,
): Promise<string | null> {
  const rows = await fetchGstr1Rows(db, businessId);
  if (rows.length === 0) return null;
  const csv = buildGstr1Csv(rows);
  const name = csvFileName(businessName);
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.write(csv); // string defaults to UTF-8
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: name });
  return file.uri;
}
