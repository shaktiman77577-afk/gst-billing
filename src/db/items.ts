import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../lib/id';

export type ItemType = 'product' | 'service';

export type Item = {
  id: string;
  business_id: string;
  name: string;
  item_type: ItemType;
  unit: string;
  sales_price_paise: number;
  sales_price_with_tax: number; // 1 = price includes GST
  purchase_price_paise: number | null;
  gst_rate: number;
  hsn: string | null;
  opening_stock: number;
  stock_qty: number; // can go negative
  low_stock_qty: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ItemInput = {
  name: string;
  itemType: ItemType;
  unit: string;
  salesPricePaise: number;
  salesPriceWithTax: boolean;
  purchasePricePaise: number | null;
  gstRate: number;
  hsn: string | null;
  openingStock: number;
  lowStockQty: number | null;
};

// Common GST rates (after the Sept 2025 GST changes). "Other" allows any rate.
export const GST_RATES = [0, 0.25, 3, 5, 18, 40];

export const UNITS = ['PCS', 'NOS', 'KG', 'GM', 'LTR', 'ML', 'MTR', 'BOX', 'PKT', 'DOZ', 'SET', 'PAIR', 'BAG', 'BTL', 'HRS'];

export async function listItems(db: SQLiteDatabase, businessId: string): Promise<Item[]> {
  return db.getAllAsync<Item>(
    `SELECT * FROM items WHERE business_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
    businessId,
  );
}

export async function getItem(db: SQLiteDatabase, id: string): Promise<Item | null> {
  return db.getFirstAsync<Item>('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL', id);
}

export async function createItem(db: SQLiteDatabase, businessId: string, input: ItemInput): Promise<string> {
  const id = newId();
  const now = nowIso();
  const stock = input.itemType === 'service' ? 0 : input.openingStock;
  await db.runAsync(
    `INSERT INTO items
      (id, business_id, name, item_type, unit, sales_price_paise, sales_price_with_tax,
       purchase_price_paise, gst_rate, hsn, opening_stock, stock_qty, low_stock_qty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    businessId,
    input.name,
    input.itemType,
    input.unit,
    input.salesPricePaise,
    input.salesPriceWithTax ? 1 : 0,
    input.purchasePricePaise,
    input.gstRate,
    input.hsn,
    stock,
    stock,
    input.lowStockQty,
    now,
    now,
  );
  return id;
}

// Changing opening stock moves current stock by the same difference,
// so sales already made are not lost.
export async function updateItem(db: SQLiteDatabase, id: string, input: ItemInput): Promise<void> {
  const opening = input.itemType === 'service' ? 0 : input.openingStock;
  await db.runAsync(
    `UPDATE items SET
      name = ?, item_type = ?, unit = ?, sales_price_paise = ?, sales_price_with_tax = ?,
      purchase_price_paise = ?, gst_rate = ?, hsn = ?,
      stock_qty = stock_qty + (? - opening_stock), opening_stock = ?,
      low_stock_qty = ?, updated_at = ?
     WHERE id = ?`,
    input.name,
    input.itemType,
    input.unit,
    input.salesPricePaise,
    input.salesPriceWithTax ? 1 : 0,
    input.purchasePricePaise,
    input.gstRate,
    input.hsn,
    opening,
    opening,
    input.lowStockQty,
    nowIso(),
    id,
  );
}

export async function deleteItem(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

export function isLowStock(item: Item): boolean {
  if (item.item_type === 'service') return false;
  if (item.stock_qty <= 0) return true;
  return item.low_stock_qty !== null && item.stock_qty <= item.low_stock_qty;
}

export function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));
}
