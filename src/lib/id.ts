import * as Crypto from 'expo-crypto';

// Sync-safe unique ID for every record (not 1, 2, 3).
export function newId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
