import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/context/AppContext';
import { migrateDb } from '../src/db/migrations';
import { AutoBackup } from '../src/hooks/useAutoBackup';
import { onDbReloadRequest } from '../src/lib/backup';
import { SyncProvider } from '../src/sync/SyncContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  // After a cloud restore swaps the DB file on disk, remount the provider so
  // it reopens the new file (migrations re-run idempotently via onInit).
  const [dbGen, setDbGen] = useState(0);
  useEffect(() => onDbReloadRequest(() => setDbGen((g) => g + 1)), []);
  return (
    <SafeAreaProvider>
      <SQLiteProvider key={dbGen} databaseName="gstbilling.db" onInit={migrateDb}>
        <AppProvider>
          <SyncProvider>
            <AutoBackup />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'fade',
            }}
          />
          </SyncProvider>
        </AppProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
