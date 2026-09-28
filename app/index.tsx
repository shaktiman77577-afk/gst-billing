import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../src/context/AppContext';
import { colors } from '../src/theme';

// Decides which screen to open: login → loading your data → home
// (business setup only for a brand-new account, decided by app/restoring.tsx).
export default function Index() {
  const { ready, userId, businessId } = useApp();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    );
  }
  if (!userId) return <Redirect href="/login" />;
  if (!businessId) return <Redirect href="/restoring" />;
  return <Redirect href="/home" />;
}
