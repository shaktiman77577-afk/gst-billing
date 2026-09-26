import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../lib/id';

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

// Balance = opening balance for now; invoices & payments will add to it later.
export type PartyWithBalance = Party & { balance_paise: number };

export async function listParties(db: SQLiteDatabase, businessId: string): Promise<PartyWithBalance[]> {
  return db.getAllAsync<PartyWithBalance>(
    `SELECT *, opening_balance_paise AS balance_paise
     FROM parties
     WHERE business_id = ? AND deleted_at IS NULL
     ORDER BY name COLLATE NOCASE`,
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
}

// Soft delete: kept in the database (for future sync), hidden everywhere.
export async function deleteParty(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE parties SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

export async function partyTotals(
  db: SQLiteDatabase,
  businessId: string,
): Promise<{ toCollect: number; toPay: number }> {
  const row = await db.getFirstAsync<{ collect: number | null; pay: number | null }>(
    `SELECT
       SUM(CASE WHEN opening_balance_paise > 0 THEN opening_balance_paise ELSE 0 END) AS collect,
       SUM(CASE WHEN opening_balance_paise < 0 THEN -opening_balance_paise ELSE 0 END) AS pay
     FROM parties WHERE business_id = ? AND deleted_at IS NULL`,
    businessId,
  );
  return { toCollect: row?.collect ?? 0, toPay: row?.pay ?? 0 };
}
