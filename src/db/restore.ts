import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '../lib/id';
import { markDirty } from '../lib/backup';
import { refreshInvoiceStatus } from './invoices';

export type RecycleDocKind = 'invoice' | 'credit_note' | 'quotation' | 'purchase';

export type RecycleRow = {
  id: string;
  docKind: RecycleDocKind;
  docNo: string;
  date: string; // YYYY-MM-DD
  partyName: string;
  totalPaise: number;
};

// Guard codes thrown when the requested action is not valid for the row's state.
export const RECYCLE_NOT_CANCELLED = 'recycle-not-cancelled';
export const RECYCLE_NOT_DELETED = 'recycle-not-deleted';

async function changeStock(db: SQLiteDatabase, itemId: string, delta: number, now: string) {
  await db.runAsync(
    `UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ? AND item_type = 'product'`,
    delta,
    now,
    itemId,
  );
}

/**
 * Classify an invoices row for the recycle bin, defensively: anything we do
 * not recognise (e.g. a 'sales_return' kind added by a future worker) falls
 * back to invoice-like behaviour so it still shows up and can be restored.
 */
function classifyInvoice(kind: string, docType: string): RecycleDocKind {
  if (kind === 'credit_note' || kind === 'sales_return') return 'credit_note';
  if (docType === 'quotation' || docType === 'proforma') return 'quotation';
  return 'invoice';
}

/**
 * Stock effect of a LIVE document — the exact reverse of what cancelInvoice
 * undid (mirrors saveInvoice's stockSign): bills move stock OUT, credit-note
 * / sales-return kinds move it back IN. Quotations never move stock here,
 * matching cancelInvoice (which skips them too).
 */
function liveStockSign(kind: string, docType: string): number {
  if (docType === 'quotation' || docType === 'proforma') return 0;
  if (kind === 'credit_note' || kind === 'sales_return') return 1;
  return -1;
}

/**
 * Everything in the recycle bin: cancelled invoices of any kind/doc_type
 * (cancelled_at IS NOT NULL, matched defensively) plus soft-deleted purchases.
 */
export async function listRecycleBin(db: SQLiteDatabase, businessId: string): Promise<RecycleRow[]> {
  const invRows = await db.getAllAsync<{
    id: string;
    invoice_no: string;
    invoice_date: string;
    party_name: string;
    total_paise: number;
    kind: string;
    doc_type: string;
    cancelled_at: string;
  }>(
    `SELECT id, invoice_no, invoice_date, party_name, total_paise, kind, doc_type, cancelled_at
     FROM invoices
     WHERE business_id = ? AND cancelled_at IS NOT NULL
     ORDER BY cancelled_at DESC`,
    businessId,
  );
  const purRows = await db.getAllAsync<{
    id: string;
    purchase_date: string;
    party_name: string;
    supplier_bill_no: string | null;
    total_paise: number;
    deleted_at: string;
  }>(
    `SELECT id, purchase_date, party_name, supplier_bill_no, total_paise, deleted_at
     FROM purchases
     WHERE business_id = ? AND deleted_at IS NOT NULL
     ORDER BY deleted_at DESC`,
    businessId,
  );

  type WithStamp = RecycleRow & { stamp: string };
  const rows: WithStamp[] = [
    ...invRows.map((r) => ({
      id: r.id,
      docKind: classifyInvoice(r.kind, r.doc_type),
      docNo: r.invoice_no,
      date: r.invoice_date,
      partyName: r.party_name,
      totalPaise: r.total_paise,
      stamp: r.cancelled_at,
    })),
    ...purRows.map((r) => ({
      id: r.id,
      docKind: 'purchase' as const,
      docNo: r.supplier_bill_no ?? r.id.slice(0, 8),
      date: r.purchase_date,
      partyName: r.party_name,
      totalPaise: r.total_paise,
      stamp: r.deleted_at,
    })),
  ];
  rows.sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));
  return rows.map(({ stamp: _s, ...row }) => row);
}

/**
 * Un-cancel a bill/credit note/quotation: the exact reverse of cancelInvoice.
 * Stock movement is re-applied (bills → stock OUT, credit notes → stock IN),
 * cancelled_at is cleared, and the bill's own status plus its ref bill's
 * status (for credit notes) are recomputed.
 *
 * Notes:
 * - No-op when the document is already live (cancelled_at IS NULL).
 * - Payments received before cancelling were unlinked from the bill by
 *   cancelInvoice and stay with the party as an advance; they are NOT
 *   re-linked. The status therefore reflects only currently-linked payments.
 */
export async function uncancelInvoice(db: SQLiteDatabase, invoiceId: string): Promise<void> {
  const inv = await db.getFirstAsync<{
    kind: string;
    doc_type: string;
    ref_invoice_id: string | null;
    cancelled_at: string | null;
  }>('SELECT kind, doc_type, ref_invoice_id, cancelled_at FROM invoices WHERE id = ?', invoiceId);
  if (!inv || !inv.cancelled_at) return; // already live → safe no-op

  const now = nowIso();
  const sign = liveStockSign(inv.kind, inv.doc_type);
  await db.withTransactionAsync(async () => {
    if (sign !== 0) {
      const lines = await db.getAllAsync<{ item_id: string | null; qty: number }>(
        'SELECT item_id, qty FROM invoice_items WHERE invoice_id = ? AND deleted_at IS NULL',
        invoiceId,
      );
      for (const l of lines) if (l.item_id) await changeStock(db, l.item_id, sign * l.qty, now);
    }
    await db.runAsync('UPDATE invoices SET cancelled_at = NULL, updated_at = ? WHERE id = ?', now, invoiceId);
    await refreshInvoiceStatus(db, invoiceId);
    if (inv.ref_invoice_id) await refreshInvoiceStatus(db, inv.ref_invoice_id);
  });
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}

/**
 * Restore a soft-deleted purchase: the reverse of deletePurchase. Stock goes
 * back IN per purchase_items, and deleted_at is cleared on the purchase and
 * its lines. No-op when the purchase is already live.
 */
export async function restorePurchase(db: SQLiteDatabase, purchaseId: string): Promise<void> {
  const p = await db.getFirstAsync<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM purchases WHERE id = ?',
    purchaseId,
  );
  if (!p || !p.deleted_at) return; // already live → safe no-op

  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE purchases SET deleted_at = NULL, updated_at = ? WHERE id = ?', now, purchaseId);
    await db.runAsync(
      'UPDATE purchase_items SET deleted_at = NULL, updated_at = ? WHERE purchase_id = ? AND deleted_at IS NOT NULL',
      now,
      purchaseId,
    );
    const lines = await db.getAllAsync<{ item_id: string | null; qty: number }>(
      'SELECT item_id, qty FROM purchase_items WHERE purchase_id = ?',
      purchaseId,
    );
    for (const l of lines) if (l.item_id) await changeStock(db, l.item_id, l.qty, now);
  });
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}

/**
 * Permanently delete a cancelled invoice/credit note/quotation (header + lines).
 * Only allowed when already cancelled. Consequences:
 * - The row is gone from SQLite for good (restore impossible).
 * - The duplicate-number guard in saveInvoice only checks existing rows, so
 *   the bill number becomes free for re-entry.
 */
export async function permanentDeleteInvoice(db: SQLiteDatabase, invoiceId: string): Promise<void> {
  const inv = await db.getFirstAsync<{ cancelled_at: string | null }>(
    'SELECT cancelled_at FROM invoices WHERE id = ? AND deleted_at IS NULL',
    invoiceId,
  );
  if (!inv) throw new Error(RECYCLE_NOT_CANCELLED);
  if (!inv.cancelled_at) throw new Error(RECYCLE_NOT_CANCELLED);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM invoice_items WHERE invoice_id = ?', invoiceId);
    await db.runAsync('DELETE FROM invoices WHERE id = ?', invoiceId);
    // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
    markDirty(db);
  });
}

/**
 * Permanently delete a soft-deleted purchase (header + lines). Only allowed
 * when already soft-deleted. Its stock effect was already undone by
 * deletePurchase, so nothing else changes.
 */
export async function permanentDeletePurchase(db: SQLiteDatabase, purchaseId: string): Promise<void> {
  const p = await db.getFirstAsync<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM purchases WHERE id = ?',
    purchaseId,
  );
  if (!p) throw new Error(RECYCLE_NOT_DELETED);
  if (!p.deleted_at) throw new Error(RECYCLE_NOT_DELETED);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM purchase_items WHERE purchase_id = ?', purchaseId);
    await db.runAsync('DELETE FROM purchases WHERE id = ?', purchaseId);
    // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
    markDirty(db);
  });
}
