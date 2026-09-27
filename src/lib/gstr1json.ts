// GSTR-1 portal-upload JSON export — generates the same JSON the GST offline
// tool produces, ready for upload at Services > Returns > GSTR-1 > Prepare
// Offline on the GST portal (www.gst.gov.in).
//
// Sections emitted (only when they have data):
//   b2b       — live tax invoices to GST-registered parties (party has a GSTIN),
//               grouped by recipient GSTIN (ctin), invoice-wise line items.
//   b2cl      — live inter-state B2C invoices with invoice value > Rs 1,00,000,
//               invoice-wise, grouped by place of supply (threshold per CBIC
//               notification for periods on/after Aug 2024; earlier it was 2.5L).
//   b2cs      — all other live B2C invoices, aggregated by (supply type, POS, rate).
//   cdnr      — live credit notes to registered parties, grouped by ctin.
//   cdnur     — live credit notes to unregistered parties, note-wise.
//   hsn       — HSN-wise summary of outward supplies (Table 12).
//   doc_issue — documents issued in the month (Table 13).
//
// Explicitly excluded from every section: quotations (doc_type='quotation'),
// bills of supply, soft-deleted and cancelled documents. Cancelled documents
// still count in doc_issue (they were issued, then cancelled).
//
// Money is integer paise in the DB and becomes rupees (2 decimals) at the JSON
// boundary. Credit-note values stay POSITIVE in the JSON — the note type
// (ntty "C") carries the direction, unlike the CSV export which negates them
// for spreadsheet summing.
//
// Read-only: no DB writes, no schema changes. Fully offline: sqlite read +
// file write + system share sheet, no network.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Gstr1Json = {
  gstin: string;
  fp: string; // MMYYYY
  b2b?: unknown[];
  b2cl?: unknown[];
  b2cs?: unknown[];
  cdnr?: unknown[];
  cdnur?: unknown[];
  hsn?: { data: unknown[] };
  doc_issue?: { doc_det: unknown[] };
};

export type Gstr1Business = {
  id: string;
  gstin: string | null;
  name: string;
  state_code: string | null;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const LIVE = `cancelled_at IS NULL AND deleted_at IS NULL`;
// Table-qualified variant for queries that JOIN invoice_items (which also has
// a deleted_at column — a bare `deleted_at` would be ambiguous).
const LIVE_I = `i.cancelled_at IS NULL AND i.deleted_at IS NULL`;

// Paise -> rupees as a JSON number (integer paise always divide exactly).
function rs(paise: number): number {
  return Math.round(paise) / 100;
}

// YYYY-MM-DD -> DD-MM-YYYY (portal `idt` / `nt_dt` format).
function portalDate(ymd: string): string {
  return `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}`;
}

// Canonical tax split, same as src/lib/gst.ts: per rate-group, CGST is half
// of the tax rounded, SGST takes the remainder (odd-paise safe).
function splitTax(
  taxPaise: number,
  isIgst: boolean,
): { iamt: number; camt: number; samt: number } {
  if (isIgst) return { iamt: taxPaise, camt: 0, samt: 0 };
  const camt = Math.round(taxPaise / 2);
  return { iamt: 0, camt, samt: taxPaise - camt };
}

function padPos(code: string | null | undefined): string {
  const c = (code || '').trim();
  return c ? c.padStart(2, '0') : '';
}

/** "MMYYYY" -> [firstDayInclusive, firstDayOfNextMonthExclusive] as YYYY-MM-DD. */
export function fpMonthRange(fp: string): [string, string] {
  if (!/^\d{6}$/.test(fp)) throw new Error(`Bad filing period: ${fp}`);
  const mm = Number(fp.slice(0, 2));
  const yyyy = Number(fp.slice(2, 6));
  if (mm < 1 || mm > 12) throw new Error(`Bad filing period: ${fp}`);
  const start = `${yyyy}-${String(mm).padStart(2, '0')}-01`;
  const nm = mm === 12 ? 1 : mm + 1;
  const ny = mm === 12 ? yyyy + 1 : yyyy;
  const end = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return [start, end];
}

/** Filing period "MMYYYY" for a JS Date (used for the month-picker default). */
export function fpForDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${mm}${d.getFullYear()}`;
}

/** "MMYYYY" -> human label like "Sep 2026" (for the month-picker button). */
export function fpLabel(fp: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(fp.slice(0, 2));
  return `${months[m - 1] ?? ''} ${fp.slice(2, 6)}`;
}

/** Shift a filing period by n months (for the month-picker prev/next buttons). */
export function shiftFp(fp: string, n: number): string {
  const mm = Number(fp.slice(0, 2)) - 1 + n;
  const yyyy = Number(fp.slice(2, 6));
  const d = new Date(yyyy, mm, 1);
  return fpForDate(d);
}

// ---------------------------------------------------------------------------
// Unit -> UQC (Unit Quantity Code) mapping for the HSN summary.
//
// The portal only accepts the official Customs-based UQC list; anything else
// is rejected at upload. App units are the UNITS list from src/db/items.ts.
// Units with no UQC equivalent (HRS) and anything unrecognised fall back to
// "OTH" (Others), which is the portal's own documented fallback.
// ---------------------------------------------------------------------------

const UQC_MAP: Record<string, string> = {
  PCS: 'PCS',
  NOS: 'NOS',
  KG: 'KGS',
  GM: 'GMS',
  LTR: 'LTR',
  ML: 'MLT',
  MTR: 'MTR',
  BOX: 'BOX',
  PKT: 'PAC',
  DOZ: 'DOZ',
  SET: 'SET',
  PAIR: 'PRS',
  BAG: 'BAG',
  BTL: 'BTL',
  HRS: 'OTH',
  // Common variants, matched case-insensitively.
  PC: 'PCS',
  PIECE: 'PCS',
  PIECES: 'PCS',
  NUMBER: 'NOS',
  NUMBERS: 'NOS',
  KGS: 'KGS',
  KILO: 'KGS',
  KILOGRAM: 'KGS',
  GRAM: 'GMS',
  GRAMS: 'GMS',
  G: 'GMS',
  LITRE: 'LTR',
  LITRES: 'LTR',
  L: 'LTR',
  MILLILITRE: 'MLT',
  MILLILITRES: 'MLT',
  METRE: 'MTR',
  METER: 'MTR',
  METERS: 'MTR',
  CARTON: 'CTN',
  CARTONS: 'CTN',
  PACK: 'PAC',
  PACKET: 'PAC',
  PACKETS: 'PAC',
  DOZEN: 'DOZ',
  BOTTLE: 'BTL',
  BOTTLES: 'BTL',
  ROLL: 'ROL',
  ROLLS: 'ROL',
  BUNDLE: 'BDL',
  BUNDLES: 'BDL',
  BALE: 'BAL',
  QTL: 'QTL',
  QUINTAL: 'QTL',
  TON: 'TON',
  TONNE: 'TON',
  TONNES: 'TON',
  MT: 'MTS',
  SERVICE: 'OTH',
  JOB: 'OTH',
  HOUR: 'OTH',
  HOURS: 'OTH',
};

export function unitToUqc(unit: string | null | undefined): string {
  const u = (unit || '').trim().toUpperCase();
  return UQC_MAP[u] || 'OTH';
}

// ---------------------------------------------------------------------------
// DB rows
// ---------------------------------------------------------------------------

type LineRow = {
  inv_id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  party_gstin: string | null;
  place_of_supply: string | null;
  is_igst: number | null;
  total_paise: number | null;
  gst_rate: number | null;
  taxable_paise: number | null;
  tax_paise: number | null;
  hsn: string | null;
  unit: string | null;
  qty: number | null;
  line_name: string | null;
};

type DocRow = {
  inv_id: string;
  no: string;
  date: string;
  gstin: string;
  pos: string;
  isIgst: boolean;
  totalPaise: number;
  lines: {
    rate: number;
    taxable: number;
    tax: number;
    hsn: string;
    unit: string;
    qty: number;
    name: string;
  }[];
};

const LINE_COLS = `i.id AS inv_id, i.invoice_no, i.invoice_date, i.party_gstin,
  i.place_of_supply, i.is_igst, i.total_paise,
  li.gst_rate, li.taxable_paise, li.tax_paise, li.hsn, li.unit, li.qty,
  li.name AS line_name`;

async function fetchDocs(
  db: SQLiteDatabase,
  businessId: string,
  kind: 'invoice' | 'credit_note',
  start: string,
  end: string,
  businessState: string,
): Promise<DocRow[]> {
  const kindFilter =
    kind === 'invoice'
      ? `i.kind = 'invoice' AND i.doc_type = 'tax_invoice'`
      : `i.kind = 'credit_note'`;
  const rows = await db.getAllAsync<LineRow>(
    `SELECT ${LINE_COLS}
     FROM invoices i
     JOIN invoice_items li ON li.invoice_id = i.id AND li.deleted_at IS NULL
     WHERE i.business_id = ? AND ${kindFilter} AND ${LIVE_I}
       AND i.invoice_date >= ? AND i.invoice_date < ?
     ORDER BY i.invoice_date ASC, i.invoice_no ASC, li.sort ASC`,
    businessId,
    start,
    end,
  );
  const byId = new Map<string, DocRow>();
  for (const r of rows) {
    let d = byId.get(r.inv_id);
    if (!d) {
      d = {
        inv_id: r.inv_id,
        no: r.invoice_no ?? '',
        date: r.invoice_date ?? '',
        gstin: (r.party_gstin || '').trim(),
        pos: padPos(r.place_of_supply) || businessState,
        isIgst: (r.is_igst ?? 0) === 1,
        totalPaise: r.total_paise ?? 0,
        lines: [],
      };
      byId.set(r.inv_id, d);
    }
    d.lines.push({
      rate: r.gst_rate ?? 0,
      taxable: r.taxable_paise ?? 0,
      tax: r.tax_paise ?? 0,
      hsn: (r.hsn || '').trim(),
      unit: r.unit || '',
      qty: r.qty ?? 0,
      name: r.line_name || '',
    });
  }
  return [...byId.values()];
}

// One `itms` entry per GST rate within a document — exactly the grain the
// portal expects. Tax is split per rate-group (canonical app behaviour).
function buildItms(
  lines: DocRow['lines'],
  isIgst: boolean,
): { num: number; itm_det: Record<string, number> }[] {
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of lines) {
    const g = byRate.get(l.rate) ?? { taxable: 0, tax: 0 };
    g.taxable += l.taxable;
    g.tax += l.tax;
    byRate.set(l.rate, g);
  }
  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, g], idx) => {
      const t = splitTax(g.tax, isIgst);
      return {
        num: idx + 1,
        itm_det: {
          rt: rate,
          txval: rs(g.taxable),
          iamt: rs(t.iamt),
          camt: rs(t.camt),
          samt: rs(t.samt),
          csamt: 0,
        },
      };
    });
}

// ---------------------------------------------------------------------------
// Section builders (pure — easy to unit test)
// ---------------------------------------------------------------------------

const B2CL_THRESHOLD_PAISE = 100000 * 100; // Rs 1,00,000 (periods >= Aug 2024)

function invoiceEntry(d: DocRow, withRchrg: boolean): Record<string, unknown> {
  const e: Record<string, unknown> = {
    inum: d.no,
    idt: portalDate(d.date),
    val: rs(d.totalPaise),
    pos: d.pos,
  };
  if (withRchrg) e.rchrg = 'N'; // app has no reverse-charge supplies
  e.inv_typ = 'R'; // regular; SEZ/deemed-export not modelled in the app
  e.itms = buildItms(d.lines, d.isIgst);
  return e;
}

function noteEntry(d: DocRow): Record<string, unknown> {
  return {
    ntty: 'C', // the app only issues credit notes, never debit notes
    nt_num: d.no,
    nt_dt: portalDate(d.date),
    val: rs(d.totalPaise), // stays positive; ntty carries the direction
    pos: d.pos,
    rchrg: 'N',
    inv_typ: 'R',
    itms: buildItms(d.lines, d.isIgst),
  };
}

export function buildB2b(docs: DocRow[]): unknown[] {
  const byCtin = new Map<string, DocRow[]>();
  for (const d of docs) {
    if (!d.gstin) continue;
    const list = byCtin.get(d.gstin) ?? [];
    list.push(d);
    byCtin.set(d.gstin, list);
  }
  return [...byCtin.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ctin, list]) => ({
      ctin,
      inv: list.map((d) => invoiceEntry(d, true)),
    }));
}

export function buildB2cl(docs: DocRow[]): unknown[] {
  const big = docs.filter((d) => !d.gstin && d.isIgst && d.totalPaise > B2CL_THRESHOLD_PAISE);
  const byPos = new Map<string, DocRow[]>();
  for (const d of big) {
    const list = byPos.get(d.pos) ?? [];
    list.push(d);
    byPos.set(d.pos, list);
  }
  return [...byPos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pos, list]) => ({
      pos,
      inv: list.map((d) => invoiceEntry(d, false)),
    }));
}

export function buildB2cs(docs: DocRow[], b2clDocs: Set<string>): unknown[] {
  const agg = new Map<string, { sply_ty: string; pos: string; rt: number; txval: number; iamt: number; camt: number; samt: number }>();
  for (const d of docs) {
    if (d.gstin || b2clDocs.has(d.inv_id)) continue;
    const sply_ty = d.isIgst ? 'INTER' : 'INTRA';
    for (const l of d.lines) {
      const key = `${sply_ty}|${d.pos}|${l.rate}`;
      const g = agg.get(key) ?? { sply_ty, pos: d.pos, rt: l.rate, txval: 0, iamt: 0, camt: 0, samt: 0 };
      const t = splitTax(l.tax, d.isIgst);
      g.txval += l.taxable;
      g.iamt += t.iamt;
      g.camt += t.camt;
      g.samt += t.samt;
      agg.set(key, g);
    }
  }
  return [...agg.values()]
    .sort((a, b) => a.sply_ty.localeCompare(b.sply_ty) || a.pos.localeCompare(b.pos) || a.rt - b.rt)
    .map((g) => ({
      sply_ty: g.sply_ty,
      pos: g.pos,
      rt: g.rt,
      txval: rs(g.txval),
      iamt: rs(g.iamt),
      camt: rs(g.camt),
      samt: rs(g.samt),
      csamt: 0,
    }));
}

export function buildCdnr(notes: DocRow[]): unknown[] {
  const byCtin = new Map<string, DocRow[]>();
  for (const d of notes) {
    if (!d.gstin) continue;
    const list = byCtin.get(d.gstin) ?? [];
    list.push(d);
    byCtin.set(d.gstin, list);
  }
  return [...byCtin.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ctin, list]) => ({
      ctin,
      nt: list.map(noteEntry),
    }));
}

export function buildCdnur(notes: DocRow[]): unknown[] {
  return notes
    .filter((d) => !d.gstin)
    .map((d) => ({ nt: [noteEntry(d)] }));
}

// HSN summary (Table 12) from live tax-invoice lines only — credit notes are
// reported under Table 9B, not in the HSN summary. Lines with a blank HSN are
// skipped: the portal hard-rejects blank/invalid HSN codes, while a Table-12
// total mismatch is only a soft warning the user can acknowledge on the portal.
export function buildHsn(docs: DocRow[]): { data: unknown[] } | undefined {
  const agg = new Map<
    string,
    { hsn_sc: string; uqc: string; rt: number; qty: number; txval: number; iamt: number; camt: number; samt: number; desc: string }
  >();
  for (const d of docs) {
    for (const l of d.lines) {
      if (!l.hsn) continue;
      const uqc = unitToUqc(l.unit);
      const key = `${l.hsn}|${uqc}|${l.rate}`;
      const g = agg.get(key) ?? {
        hsn_sc: l.hsn,
        uqc,
        rt: l.rate,
        qty: 0,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        desc: l.name,
      };
      const t = splitTax(l.tax, d.isIgst);
      g.qty += l.qty;
      g.txval += l.taxable;
      g.iamt += t.iamt;
      g.camt += t.camt;
      g.samt += t.samt;
      agg.set(key, g);
    }
  }
  if (agg.size === 0) return undefined;
  const data = [...agg.values()]
    .sort((a, b) => a.hsn_sc.localeCompare(b.hsn_sc) || a.uqc.localeCompare(b.uqc) || a.rt - b.rt)
    .map((g, idx) => ({
      num: idx + 1,
      hsn_sc: g.hsn_sc,
      desc: g.desc,
      uqc: g.uqc,
      qty: Math.round(g.qty * 1000) / 1000,
      rt: g.rt,
      txval: rs(g.txval),
      iamt: rs(g.iamt),
      camt: rs(g.camt),
      samt: rs(g.samt),
      csamt: 0,
    }));
  return { data };
}

type IssuedRow = {
  kind: string;
  prefix: string | null;
  invoice_no: string | null;
  cancelled: number | null;
};

// Documents issued (Table 13): doc_num 1 = invoices for outward supply,
// doc_num 5 = credit notes. Cancelled documents count in `cancel`; the other
// ten document types are unused by the app and go out as empty arrays.
export function buildDocIssue(rows: IssuedRow[]): { doc_det: unknown[] } {
  const groups = new Map<string, { doc_num: number; prefix: string; rows: IssuedRow[] }>();
  for (const r of rows) {
    const doc_num = r.kind === 'credit_note' ? 5 : 1;
    const prefix = r.prefix || '';
    const key = `${doc_num}|${prefix}`;
    const g = groups.get(key) ?? { doc_num, prefix, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const byDocNum = new Map<number, unknown[]>();
  for (const g of groups.values()) {
    const sorted = [...g.rows].sort((a, b) => (a.invoice_no || '').localeCompare(b.invoice_no || ''));
    const totnum = sorted.length;
    const cancel = sorted.filter((r) => (r.cancelled ?? 0) === 1).length;
    const entry = {
      num: (byDocNum.get(g.doc_num)?.length ?? 0) + 1,
      from: sorted[0]?.invoice_no || '',
      to: sorted[sorted.length - 1]?.invoice_no || '',
      totnum,
      cancel,
      net_issue: totnum - cancel,
    };
    const list = byDocNum.get(g.doc_num) ?? [];
    list.push(entry);
    byDocNum.set(g.doc_num, list);
  }
  const doc_det: unknown[] = [];
  for (let doc_num = 1; doc_num <= 12; doc_num++) {
    doc_det.push({ doc_num, docs: byDocNum.get(doc_num) ?? [] });
  }
  return { doc_det };
}

// ---------------------------------------------------------------------------
// Top-level fetch + file builders
// ---------------------------------------------------------------------------

// Builds the portal-upload payload for one calendar month (fp "MMYYYY").
// Returns null when the business has no GSTIN or the month has no data at all.
export async function fetchGstr1Json(
  db: SQLiteDatabase,
  businessId: string,
  fp: string,
): Promise<Gstr1Json | null> {
  const [start, end] = fpMonthRange(fp);
  const biz = await db.getFirstAsync<{ gstin: string | null; state_code: string | null }>(
    `SELECT gstin, state_code FROM businesses WHERE id = ? AND deleted_at IS NULL`,
    businessId,
  );
  const gstin = (biz?.gstin || '').trim().toUpperCase();
  if (!gstin) return null; // portal upload is meaningless without a GSTIN
  const businessState = padPos(biz?.state_code);

  const invoices = await fetchDocs(db, businessId, 'invoice', start, end, businessState);
  const notes = await fetchDocs(db, businessId, 'credit_note', start, end, businessState);

  const payload: Gstr1Json = { gstin, fp };

  const b2bDocs = invoices.filter((d) => d.gstin);
  const b2b = buildB2b(b2bDocs);
  if (b2b.length > 0) payload.b2b = b2b;

  const b2cl = buildB2cl(invoices);
  if (b2cl.length > 0) payload.b2cl = b2cl;
  const b2clIds = new Set(
    invoices.filter((d) => !d.gstin && d.isIgst && d.totalPaise > B2CL_THRESHOLD_PAISE).map((d) => d.inv_id),
  );

  const b2cs = buildB2cs(invoices, b2clIds);
  if (b2cs.length > 0) payload.b2cs = b2cs;

  const cdnr = buildCdnr(notes);
  if (cdnr.length > 0) payload.cdnr = cdnr;
  const cdnur = buildCdnur(notes);
  if (cdnur.length > 0) payload.cdnur = cdnur;

  const hsn = buildHsn(invoices);
  if (hsn) payload.hsn = hsn;

  const issued = await db.getAllAsync<IssuedRow>(
    `SELECT kind, prefix, invoice_no, (cancelled_at IS NOT NULL) AS cancelled
     FROM invoices
     WHERE business_id = ? AND deleted_at IS NULL
       AND ((kind = 'invoice' AND doc_type = 'tax_invoice') OR kind = 'credit_note')
       AND invoice_date >= ? AND invoice_date < ?
     ORDER BY kind, prefix, invoice_no`,
    businessId,
    start,
    end,
  );
  const doc_issue = buildDocIssue(issued);
  const hasDocs = (doc_issue.doc_det as { docs: unknown[] }[]).some((d) => d.docs.length > 0);
  if (hasDocs) payload.doc_issue = doc_issue;

  const hasSections =
    payload.b2b || payload.b2cl || payload.b2cs || payload.cdnr || payload.cdnur || payload.hsn;
  if (!hasSections && !hasDocs) return null;
  return payload;
}

// Pretty-printed file content (2-space indent, like the offline tool).
export function buildGstr1JsonFile(payload: Gstr1Json): string {
  return JSON.stringify(payload, null, 2) + '\n';
}

function jsonFileName(gstin: string, fp: string): string {
  const safe = gstin.replace(/[^A-Za-z0-9]/g, '').slice(0, 15) || 'GSTR1';
  return `GSTR1-${safe}-${fp}.json`;
}

// Builds the JSON, writes it to the app cache dir (same File/Paths pattern as
// src/pdf/share.ts and src/lib/gstr1.ts) and opens the system share sheet.
// Returns the file URI, or null when there is nothing to export (no GSTIN or
// no data in the month).
export async function exportGstr1Json(
  db: SQLiteDatabase,
  business: Gstr1Business,
  fp: string,
): Promise<string | null> {
  const payload = await fetchGstr1Json(db, business.id, fp);
  if (!payload) return null;
  const json = buildGstr1JsonFile(payload);
  const name = jsonFileName(payload.gstin, fp);
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.write(json); // string defaults to UTF-8
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: name });
  return file.uri;
}
