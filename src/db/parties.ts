import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../lib/id';
import { markDirty } from '../lib/backup';

export type PartyType = 'customer' | 'supplier';

export type Party = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  party_type: PartyType;
  gstin: string | null;
  state_code: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  same_shipping: number;
  // + means you will collect (they owe you), − means you will pay.
  opening_balance_paise: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PartyInput = {
  name: string;
  phone: string | null;
  partyType: PartyType;
  gstin: string | null;
  stateCode: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  sameShipping: boolean;
  openingBalancePaise: number;
};

export type PartyWithBalance = Party & { balance_paise: number };

// Balance = opening + bills − returns (credit notes + sales returns) − money received + money paid out.
// Positive = you will collect, negative = you will pay.
export const BALANCE_SQL = `
  p.opening_balance_paise
  + COALESCE((SELECT SUM(CASE WHEN i.kind IN ('credit_note', 'sales_return') THEN -i.total_paise ELSE i.total_paise END)
              FROM invoices i
              WHERE i.party_id = p.id AND i.deleted_at IS NULL AND i.cancelled_at IS NULL
                AND i.doc_type NOT IN ('quotation', 'proforma')), 0)
  - COALESCE((SELECT SUM(CASE WHEN pay.direction = 'out' THEN -pay.amount_paise ELSE pay.amount_paise END)
              FROM payments pay
              WHERE pay.party_id = p.id AND pay.deleted_at IS NULL), 0)`;

export async function listParties(db: SQLiteDatabase, businessId: string): Promise<PartyWithBalance[]> {
  return db.getAllAsync<PartyWithBalance>(
    `SELECT p.*, (${BALANCE_SQL}) AS balance_paise
     FROM parties p
     WHERE p.business_id = ? AND p.deleted_at IS NULL
     ORDER BY p.name COLLATE NOCASE`,
    businessId,
  );
}

export async function getParty(db: SQLiteDatabase, id: string): Promise<Party | null> {
  return db.getFirstAsync<Party>('SELECT * FROM parties WHERE id = ? AND deleted_at IS NULL', id);
}

export async function createParty(db: SQLiteDatabase, businessId: string, input: PartyInput): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO parties
      (id, business_id, name, phone, party_type, gstin, state_code, billing_address,
       shipping_address, same_shipping, opening_balance_paise, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    businessId,
    input.name,
    input.phone,
    input.partyType,
    input.gstin,
    input.stateCode,
    input.billingAddress,
    input.sameShipping ? null : input.shippingAddress,
    input.sameShipping ? 1 : 0,
    input.openingBalancePaise,
    now,
    now,
  );
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
  return id;
}

export async function updateParty(db: SQLiteDatabase, id: string, input: PartyInput): Promise<void> {
  await db.runAsync(
    `UPDATE parties SET
      name = ?, phone = ?, party_type = ?, gstin = ?, state_code = ?, billing_address = ?,
      shipping_address = ?, same_shipping = ?, opening_balance_paise = ?, updated_at = ?
     WHERE id = ?`,
    input.name,
    input.phone,
    input.partyType,
    input.gstin,
    input.stateCode,
    input.billingAddress,
    input.sameShipping ? null : input.shippingAddress,
    input.sameShipping ? 1 : 0,
    input.openingBalancePaise,
    nowIso(),
    id,
  );
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}

// Soft delete: kept in the database (for future sync), hidden everywhere.
export async function deleteParty(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE parties SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}

export async function partyTotals(
  db: SQLiteDatabase,
  businessId: string,
): Promise<{ toCollect: number; toPay: number }> {
  const row = await db.getFirstAsync<{ collect: number | null; pay: number | null }>(
    `SELECT
       SUM(CASE WHEN bal > 0 THEN bal ELSE 0 END) AS collect,
       SUM(CASE WHEN bal < 0 THEN -bal ELSE 0 END) AS pay
     FROM (SELECT (${BALANCE_SQL}) AS bal FROM parties p
           WHERE p.business_id = ? AND p.deleted_at IS NULL)`,
    businessId,
  );
  return { toCollect: row?.collect ?? 0, toPay: row?.pay ?? 0 };
}

export async function getPartyBalance(db: SQLiteDatabase, id: string): Promise<number> {
  const row = await db.getFirstAsync<{ bal: number }>(`SELECT (${BALANCE_SQL}) AS bal FROM parties p WHERE p.id = ?`, id);
  return row?.bal ?? 0;
}
