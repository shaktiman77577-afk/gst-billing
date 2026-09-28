// Stable id of THIS phone install.
//
// Kept in AsyncStorage, not in the SQLite database, on purpose: the database
// can be replaced by a cloud restore or wiped on logout, but the phone's
// identity must survive both (it decides which phone is the active one).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';

const KEY = 'gst_device_id_v1';
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id: string | null = null;
  try {
    id = await AsyncStorage.getItem(KEY);
  } catch {
    id = null;
  }
  if (!id) {
    id = Crypto.randomUUID();
    try {
      await AsyncStorage.setItem(KEY, id);
    } catch {
      // still usable for this session
    }
  }
  cached = id as string;
  return id as string;
}

export function deviceName(): string {
  return (Constants as unknown as { deviceName?: string }).deviceName ?? 'Android phone';
}
