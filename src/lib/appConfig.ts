// Remote app settings (Supabase table public.app_config, one row, readable by
// everyone). Used for:
//   • force update  — min_version_code: older builds are blocked
//   • soft update   — latest_version_code: older builds see "update available"
//   • paid launch   — paid_launch_at: free trial counts from this date
// The last good copy is cached, so the app still knows offline.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type AppConfig = {
  min_version_code: number;
  latest_version_code: number;
  update_message: string | null;
  paid_launch_at: string | null;
};

const CACHE_KEY = 'app_config_v1';
const EMPTY: AppConfig = { min_version_code: 0, latest_version_code: 0, update_message: null, paid_launch_at: null };

let memo: { cfg: AppConfig; at: number } | null = null;
const FRESH_MS = 5 * 60_000;

/** This build's Android versionCode (from app.json → android.versionCode). */
export function currentVersionCode(): number {
  const v = (Constants.expoConfig?.android as { versionCode?: number } | undefined)?.versionCode;
  return typeof v === 'number' ? v : 0;
}

export function currentVersionName(): string {
  return Constants.expoConfig?.version ?? '';
}

export function playStoreUrl(): { market: string; web: string } {
  const pkg = (Constants.expoConfig?.android as { package?: string } | undefined)?.package ?? 'com.gstbilling.invoicemaker';
  return { market: `market://details?id=${pkg}`, web: `https://play.google.com/store/apps/details?id=${pkg}` };
}

async function readCache(): Promise<AppConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<AppConfig>) } : null;
  } catch {
    return null;
  }
}

/**
 * Latest config: from the server when reachable (cached for 5 min in memory),
 * otherwise the last saved copy, otherwise "no rules".
 */
export async function getAppConfig(force = false): Promise<AppConfig> {
  if (!force && memo && Date.now() - memo.at < FRESH_MS) return memo.cfg;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('min_version_code, latest_version_code, update_message, paid_launch_at')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) throw error ?? new Error('no config');
    const cfg: AppConfig = { ...EMPTY, ...(data as Partial<AppConfig>) };
    memo = { cfg, at: Date.now() };
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
    } catch {
      // ignore
    }
    return cfg;
  } catch {
    return (await readCache()) ?? memo?.cfg ?? EMPTY;
  }
}
