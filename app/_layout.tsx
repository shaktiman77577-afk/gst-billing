import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_500Medium,
  IBMPlexSansDevanagari_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-devanagari';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogHost } from '../src/components/AppDialog';
import { UpdateGate } from '../src/components/UpdateGate';
import { AppProvider } from '../src/context/AppContext';
import { migrateDb } from '../src/db/migrations';
import { AutoBackup } from '../src/hooks/useAutoBackup';
import { onDbReloadRequest } from '../src/lib/backup';
import { SyncProvider } from '../src/sync/SyncContext';
import { colors, fonts } from '../src/theme';

export default function RootLayout() {
  // After a cloud restore swaps the DB file on disk, remount the provider so
  // it reopens the new file (migrations re-run idempotently via onInit).
  const [dbGen, setDbGen] = useState(0);
  useEffect(() => onDbReloadRequest(() => setDbGen((g) => g + 1)), []);

  // App fonts. Names must match `fonts` in src/theme.ts.
  const [fontsLoaded, fontError] = useFonts({
    [fonts.en.regular]: IBMPlexSans_400Regular,
    [fonts.en.medium]: IBMPlexSans_500Medium,
    [fonts.en.semibold]: IBMPlexSans_600SemiBold,
    [fonts.hi.regular]: IBMPlexSansDevanagari_400Regular,
    [fonts.hi.medium]: IBMPlexSansDevanagari_500Medium,
    [fonts.hi.semibold]: IBMPlexSansDevanagari_600SemiBold,
  });
  // Wait for fonts (a split second, they ship inside the app). If loading
  // ever fails, carry on with the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SQLiteProvider key={dbGen} databaseName="gstbilling.db" onInit={migrateDb}>
        <AppProvider>
          <SyncProvider>
            <AutoBackup />
            <UpdateGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                  animation: 'fade',
                }}
              />
            </UpdateGate>
            <DialogHost />
          </SyncProvider>
        </AppProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
