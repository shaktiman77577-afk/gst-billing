import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../lib/id';
import { markDirty } from '../lib/backup';
import { scheduleBusinessProfilePush } from '../lib/businessProfile';

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
  template: string;
  theme_color: string;
  logo: string | null; // data URI (base64 image)
  signature: string | null; // data URI
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  upi_id: string | null;
  terms: string | null;
  tagline: string | null;
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
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
  // Cloud profile sync: fire-and-forget (never blocks the UI).
  scheduleBusinessProfilePush(db, id);
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
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}

export async function updateBusiness(db: SQLiteDatabase, id: string, input: NewBusiness): Promise<void> {
  await db.runAsync(
    `UPDATE businesses SET
      name = ?, phone = ?, gst_registered = ?, gstin = ?, pan = ?, state_code = ?,
      address = ?, city = ?, pincode = ?, business_type = ?, updated_at = ?
     WHERE id = ?`,
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
    nowIso(),
    id,
  );
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
  // Cloud profile sync: fire-and-forget (never blocks the UI).
  scheduleBusinessProfilePush(db, id);
}

export type BillDesign = {
  invoicePrefix: string;
  template: string;
  themeColor: string;
  logo: string | null;
  signature: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  upiId: string | null;
  terms: string | null;
  tagline: string | null;
};

export async function updateBillDesign(db: SQLiteDatabase, id: string, d: BillDesign): Promise<void> {
  await db.runAsync(
    `UPDATE businesses SET
      invoice_prefix = ?, template = ?, theme_color = ?, logo = ?, signature = ?,
      bank_account_name = ?, bank_account_no = ?, bank_ifsc = ?, bank_name = ?,
      upi_id = ?, terms = ?, tagline = ?, updated_at = ?
     WHERE id = ?`,
    d.invoicePrefix,
    d.template,
    d.themeColor,
    d.logo,
    d.signature,
    d.bankAccountName,
    d.bankAccountNo,
    d.bankIfsc,
    d.bankName,
    d.upiId,
    d.terms,
    d.tagline,
    nowIso(),
    id,
  );
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
  // Cloud profile sync: fire-and-forget (never blocks the UI).
  scheduleBusinessProfilePush(db, id);
}

export async function setTemplateDesign(
  db: SQLiteDatabase,
  id: string,
  template: string,
  themeColor: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE businesses SET template = ?, theme_color = ?, updated_at = ? WHERE id = ?',
    template,
    themeColor,
    nowIso(),
    id,
  );
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}
