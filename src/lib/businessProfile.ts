// Business profile cloud sync (Supabase).
//
// One row per user in public.business_profiles (RLS: only their own row).
// Direction rules for v1:
//   PUSH — fire-and-forget upsert after every local business save
//   (create/update + bill-design changes). Only runs when a Supabase session
//   exists; silent no-op when offline or logged out. Never throws, never
//   blocks the UI.
//   PULL — only when the local business table is empty (fresh install / new
//   phone). Local data always wins: an existing local business is NEVER
//   overwritten.
import type { SQLiteDatabase } from 'expo-sqlite';
import { getBusiness, getFirstBusinessForUser } from '../db/businesses';
import { newId, nowIso } from './id';
import { supabase } from './supabase';

type CloudProfile = {
  user_id: string;
  local_id: string;
  name: string;
  phone: string | null;
  gst_registered: boolean;
  gstin: string | null;
  pan: string | null;
  state_code: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  business_type: string;
  invoice_prefix: string | null;
  template: string | null;
  theme_color: string | null;
  logo: string | null;
  signature: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  upi_id: string | null;
  terms: string | null;
  tagline: string | null;
};

async function currentSession() {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null; // e.g. offline
  }
}

/**
 * Upsert the business row into the user's cloud profile.
 * Fire-and-forget from the DB write path — never throws.
 */
export async function pushBusinessProfile(
  db: SQLiteDatabase,
  businessId: string,
): Promise<void> {
  try {
    const session = await currentSession();
    if (!session) return;
    const b = await getBusiness(db, businessId);
    if (!b || b.deleted_at) return;
    const row: CloudProfile = {
      user_id: session.user.id,
      local_id: b.id,
      name: b.name,
      phone: b.phone,
      gst_registered: b.gst_registered === 1,
      gstin: b.gstin,
      pan: b.pan,
      state_code: b.state_code,
      address: b.address,
      city: b.city,
      pincode: b.pincode,
      business_type: b.business_type,
      invoice_prefix: b.invoice_prefix,
      template: b.template,
      theme_color: b.theme_color,
      logo: b.logo,
      signature: b.signature,
      bank_account_name: b.bank_account_name,
      bank_account_no: b.bank_account_no,
      bank_ifsc: b.bank_ifsc,
      bank_name: b.bank_name,
      upi_id: b.upi_id,
      terms: b.terms,
      tagline: b.tagline,
    };
    const { error } = await supabase
      .from('business_profiles')
      .upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
  } catch {
    // Silent: offline or upload failed — the next business save retries.
  }
}

/** Fire-and-forget wrapper for the DB write path: returns immediately. */
export function scheduleBusinessProfilePush(db: SQLiteDatabase, businessId: string): void {
  void pushBusinessProfile(db, businessId);
}

/**
 * Pull the cloud profile into the local business table — ONLY when the local
 * business table is empty. Returns the new local business id, or null when
 * there was nothing to pull (or no session). Never overwrites a local row.
 */
export async function pullBusinessProfileIfMissing(
  db: SQLiteDatabase,
  userId: string,
): Promise<string | null> {
  try {
    const session = await currentSession();
    if (!session) return null;
    const local = await getFirstBusinessForUser(db, userId);
    if (local) return null; // local wins — do not overwrite
    const { data, error } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error || !data) return null;
    const p = data as CloudProfile;
    if (!p.name) return null;
    let id = p.local_id && !(await getBusiness(db, p.local_id)) ? p.local_id : newId();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO businesses
        (id, user_id, name, phone, gst_registered, gstin, pan, state_code,
         address, city, pincode, business_type, invoice_prefix, template, theme_color,
         logo, signature, bank_account_name, bank_account_no, bank_ifsc, bank_name,
         upi_id, terms, tagline, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      p.name,
      p.phone,
      p.gst_registered ? 1 : 0,
      p.gstin,
      p.pan,
      p.state_code ?? '',
      p.address,
      p.city,
      p.pincode,
      p.business_type || 'retail',
      p.invoice_prefix ?? 'INV',
      p.template ?? 'simple',
      p.theme_color ?? '#1E3A8A',
      p.logo,
      p.signature,
      p.bank_account_name,
      p.bank_account_no,
      p.bank_ifsc,
      p.bank_name,
      p.upi_id,
      p.terms,
      p.tagline,
      now,
      now,
    );
    return id;
  } catch {
    // Silent: offline or download failed — the app just keeps working locally.
    return null;
  }
}
