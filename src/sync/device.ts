// One active phone per account.
//
// Login claims the phone (claim_device). Every other phone of that account
// is "replaced": it finds out on its next check (app open / foreground) or
// when the server refuses its sync upload, and is then logged out and wiped
// (see DeviceGuard in src/sync/SyncContext.tsx).
import { deviceName, getDeviceId } from '../lib/deviceId';
import { supabase } from '../lib/supabase';

export type DeviceStatus = 'active' | 'replaced' | 'none' | 'unknown';

type Listener = () => void;
const listeners = new Set<Listener>();
let reported = false;

/** Subscribe to "this phone was replaced by another one". */
export function onDeviceReplaced(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Called by sync/backup code when the server says another phone is active. */
export function reportDeviceReplaced(): void {
  if (reported) return; // one logout per replacement
  reported = true;
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      // ignore
    }
  }
}

/** Make this phone the active one for the logged-in user. Never throws. */
export async function claimThisDevice(): Promise<boolean> {
  try {
    const id = await getDeviceId();
    const { error } = await supabase.rpc('claim_device', { p_device_id: id, p_device_name: deviceName() });
    if (!error) reported = false;
    return !error;
  } catch {
    return false;
  }
}

/** Is this phone still the active one? 'unknown' when offline / no session. */
export async function checkThisDevice(): Promise<DeviceStatus> {
  try {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return 'unknown';
    const id = await getDeviceId();
    const { data, error } = await supabase.rpc('device_status', { p_device_id: id });
    if (error) return 'unknown';
    if (data === 'active' || data === 'replaced' || data === 'none') return data;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function isDeviceReplacedError(e: unknown): boolean {
  const msg =
    typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  return msg.includes('DEVICE_REPLACED');
}
