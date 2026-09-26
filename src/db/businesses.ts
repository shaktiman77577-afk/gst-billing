import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../lib/id';

export type BusinessType = 'retail' | 'wholesale' | 'both';

export type Business = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  gst_registered: number;
  gstin: string | null;
  pan: string | null;
  state_code: string;
  address: string | null;
  city: string | null;
  pincode: string | null;
  business_type: BusinessType;
  invoice_prefix: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type NewBusiness = {
  name: string;
  phone: string | null;
  gstRegistered: boolean;
  gstin: string | null;
  pan: string | null;
  stateCode: string;
  address: string | null;
  city: string | null;
  pincode: string | null;
  businessType: BusinessType;
};

export async function createBusiness(
  db: SQLiteDatabase,
  userId: string,
  input: NewBusiness,
): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO businesses
      (id, user_id, name, phone, gst_registered, gstin, pan, state_code,
       address, city, pincode, business_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    input.name,
    input.phone,
    input.gstRegistered ? 1 : 0,
    input.gstin,
    input.pan,
    input.stateCode,
    input.address,
    input.city,
    input.pincode,
    input.businessType,
    now,
    now,
  );
  return id;
}

export async function getBusiness(db: SQLiteDatabase, id: string): Promise<Business | null> {
  return db.getFirstAsync<Business>(
    'SELECT * FROM businesses WHERE id = ? AND deleted_at IS NULL',
    id,
  );
}

export async function getFirstBusinessForUser(
  db: SQLiteDatabase,
  userId: string,
): Promise<Business | null> {
  return db.getFirstAsync<Business>(
    'SELECT * FROM businesses WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1',
    userId,
  );
}

export async function setInvoicePrefix(db: SQLiteDatabase, id: string, prefix: string): Promise<void> {
  await db.runAsync(
    'UPDATE businesses SET invoice_prefix = ?, updated_at = ? WHERE id = ?',
    prefix,
    nowIso(),
    id,
  );
}
