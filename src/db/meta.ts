import type { SQLiteDatabase } from 'expo-sqlite';

export type MetaKey =
  | 'language'
  | 'user_id'
  | 'email'
  | 'active_business_id'
  | 'last_backup_at'
  | 'sync_pushed_at' // newest local change already sent to the cloud
  | 'sync_pulled_seq' // cloud cursor already downloaded
  | 'sync_last_ok' // time of the last successful sync
  | 'backup_auto' // '1' when daily auto cloud backup is enabled
  | 'backup_last_auto' // ISO time of the last automatic cloud backup
  | 'device_id'; // stable per-install id (devices table / future 1-user feature)

export async function getMeta(db: SQLiteDatabase, key: MetaKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_meta WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: MetaKey, value: string | null): Promise<void> {
  if (value === null) {
    await db.runAsync('DELETE FROM app_meta WHERE key = ?', key);
  } else {
    await db.runAsync(
      'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }
}
