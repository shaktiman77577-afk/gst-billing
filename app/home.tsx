import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../src/components/ui';
import { useApp } from '../src/context/AppContext';
import { stateName } from '../src/data/states';
import { Business, getBusiness } from '../src/db/businesses';
import { colors } from '../src/theme';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { t, email, businessId, logout } = useApp();
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    if (businessId) getBusiness(db, businessId).then(setBusiness);
  }, [db, businessId]);

  const onLogout = () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <Screen>
      <Text style={styles.welcome}>{t('welcome')} 👋</Text>
      <View style={styles.card}>
        <Text style={styles.name}>{business?.name ?? ''}</Text>
        {business?.gstin ? <Text style={styles.line}>GSTIN: {business.gstin}</Text> : null}
        {business ? <Text style={styles.line}>{stateName(business.state_code)}</Text> : null}
      </View>
      <Text style={styles.soon}>{t('comingSoon')}</Text>
      <Text style={styles.email}>
        {t('loggedInAs')}: {email}
      </Text>
      <Button variant="danger" label={t('logout')} onPress={onLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  welcome: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  name: { fontSize: 20, fontWeight: '700', color: colors.primary },
  line: { fontSize: 14, color: colors.muted },
  soon: { fontSize: 14, color: colors.muted, marginVertical: 12 },
  email: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
