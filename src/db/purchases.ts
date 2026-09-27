import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../lib/id';
import { markDirty } from '../lib/backup';

export type Purchase = {
  id: string;
  business_id: string;
  purchase_date: string; // YYYY-MM-DD
  party_id: string | null;
  party_name: string;
  supplier_bill_no: string | null;
  total_paise: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PurchaseLine = {
  id: string;
  purchase_id: string;
  item_id: string | null;
  item_type: 'product' | 'service';
  name: string;
  unit: string;
  qty: number;
  rate_paise: number;
  amount_paise: number;
  sort: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PurchaseLineDraft = {
  itemId: string | null;
  itemType: 'product' | 'service';
  name: string;
  unit: string;
  qty: number;
  ratePaise: number;
};

function amountPaise(l: PurchaseLineDraft): number {
  return Math.round(l.qty * l.ratePaise);
}

// Stock only moves for products that are linked to an item master row.
async function changeStock(
  db: SQLiteDatabase,
  itemId: string,
  delta: number,
  now: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ? AND item_type = 'product'`,
    delta,
    now,
    itemId,
  );
}

/**
 * Creates (purchaseId = null) or updates a purchase bill in one transaction.
 * A purchase brings stock IN (products only, like the sales side does
 * products only). Purchases deliberately never touch invoices, payments,
 * GST reports or party balances.
 */
export async function savePurchase(
  db: SQLiteDatabase,
  params: {
    businessId: string;
    purchaseId: string | null;
    purchaseDate: string;
    partyId: string | null;
    partyName: string;
    supplierBillNo: string | null;
    note: string | null;
    lines: PurchaseLineDraft[];
  },
): Promise<string> {
  const { businessId, lines } = params;
  const totalPaise = lines.reduce((s, l) => s + amountPaise(l), 0);
  const now = nowIso();
  const id = params.purchaseId ?? newId();

  await db.withTransactionAsync(async () => {
    if (params.purchaseId) {
      // Undo the old lines' stock, then hide them.
      const old = await db.getAllAsync<{ item_id: string | null; qty: number }>(
        'SELECT item_id, qty FROM purchase_items WHERE purchase_id = ? AND deleted_at IS NULL',
        id,
      );
      for (const l of old) if (l.item_id) await changeStock(db, l.item_id, -l.qty, now);
      await db.runAsync(
        'UPDATE purchase_items SET deleted_at = ?, updated_at = ? WHERE purchase_id = ? AND deleted_at IS NULL',
        now,
        now,
        id,
      );
    }

    if (params.purchaseId) {
      await db.runAsync(
        `UPDATE purchases SET purchase_date = ?, party_id = ?, party_name = ?, supplier_bill_no = ?,
          total_paise = ?, note = ?, updated_at = ? WHERE id = ?`,
        params.purchaseDate,
        params.partyId,
        params.partyName,
        params.supplierBillNo,
        totalPaise,
        params.note,
        now,
        id,
      );
    } else {
      await db.runAsync(
        `INSERT INTO purchases (id, business_id, purchase_date, party_id, party_name, supplier_bill_no,
          total_paise, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        businessId,
        params.purchaseDate,
        params.partyId,
        params.partyName,
        params.supplierBillNo,
        totalPaise,
        params.note,
        now,
        now,
      );
    }

    // Lines + stock in.
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await db.runAsync(
        `INSERT INTO purchase_items (id, purchase_id, item_id, item_type, name, unit, qty, rate_paise,
          amount_paise, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        id,
        l.itemId,
        l.itemType,
        l.name,
        l.unit,
        l.qty,
        l.ratePaise,
        amountPaise(l),
        i,
        now,
        now,
      );
      if (l.itemId && l.itemType === 'product') await changeStock(db, l.itemId, l.qty, now);
    }
  });

  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
  return id;
}

export async function getPurchase(
  db: SQLiteDatabase,
  id: string,
): Promise<{ purchase: Purchase; lines: PurchaseLine[] } | null> {
  const purchase = await db.getFirstAsync<Purchase>(
    'SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL',
    id,
  );
  if (!purchase) return null;
  const lines = await db.getAllAsync<PurchaseLine>(
    'SELECT * FROM purchase_items WHERE purchase_id = ? AND deleted_at IS NULL ORDER BY sort',
    id,
  );
  return { purchase, lines };
}

export async function listPurchases(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<Purchase[]> {
  return db.getAllAsync<Purchase>(
    `SELECT * FROM purchases
     WHERE business_id = ? AND deleted_at IS NULL AND purchase_date >= ? AND purchase_date <= ?
     ORDER BY purchase_date DESC, created_at DESC`,
    businessId,
    from,
    to,
  );
}

export async function totalPurchases(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(total_paise) AS total FROM purchases
     WHERE business_id = ? AND deleted_at IS NULL AND purchase_date >= ? AND purchase_date <= ?`,
    businessId,
    from,
    to,
  );
  return row?.total ?? 0;
}

// Soft delete — the stock this purchase added is taken back out, so the
// current stock stays honest. Sales bills, GST and balances are untouched.
export async function deletePurchase(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    const old = await db.getAllAsync<{ item_id: string | null; qty: number }>(
      'SELECT item_id, qty FROM purchase_items WHERE purchase_id = ? AND deleted_at IS NULL',
      id,
    );
    for (const l of old) if (l.item_id) await changeStock(db, l.item_id, -l.qty, now);
    await db.runAsync(
      'UPDATE purchase_items SET deleted_at = ?, updated_at = ? WHERE purchase_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
    await db.runAsync('UPDATE purchases SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
    markDirty(db);
  });
}
