import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/context/AppContext';
import { migrateDb } from '../src/db/migrations';
import { SyncProvider } from '../src/sync/SyncContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="gstbilling.db" onInit={migrateDb}>
        <AppProvider>
          <SyncProvider>
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
