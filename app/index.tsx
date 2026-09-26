import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../src/context/AppContext';
import { colors } from '../src/theme';

// Decides which screen to open: language → login → business setup → home.
export default function Index() {
  const { ready, language, userId, businessId } = useApp();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!language) return <Redirect href="/language" />;
  if (!userId) return <Redirect href="/login" />;
  if (!businessId) return <Redirect href="/business-setup" />;
  return <Redirect href="/home" />;
}
