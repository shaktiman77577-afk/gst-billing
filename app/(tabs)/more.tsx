import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CloudStatusCard } from '../../src/components/CloudStatus';
import { Header } from '../../src/components/Header';
import { LanguageToggle } from '../../src/components/LanguageToggle';
import { Button, Card, MadeInIndia } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { stateName } from '../../src/data/states';
import { useBusiness } from '../../src/hooks/useBusiness';
import { colors, radius } from '../../src/theme';

export default function MoreScreen() {
  const { t, email, logout } = useApp();
  const business = useBusiness();
  const version = Constants.expoConfig?.version ?? '';

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

  const initial = (business?.name ?? '?').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <Header title={t('tabMore')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={styles.cardLabel}>{t('businessProfile')}</Text>
          <Pressable
            style={styles.profile}
            onPress={() => router.push({ pathname: '/business-setup', params: { edit: '1' } })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.name}>{business?.name ?? ''}</Text>
              {business ? <Text style={styles.meta}>{stateName(business.state_code)}</Text> : null}
              {business?.gstin ? <Text style={styles.meta}>GSTIN {business.gstin}</Text> : null}
            </View>
            <View style={styles.editPill}>
              <Ionicons name="create-outline" size={14} color={colors.primary} />
              <Text style={styles.editText}>{t('edit')}</Text>
            </View>
          </Pressable>
        </Card>

        <Card>
          <CloudStatusCard />
        </Card>

        <Card>
          <Pressable style={styles.row} onPress={() => router.push('/settings/bill')}>
            <View style={styles.rowIcon}>
              <Ionicons name="document-text" size={18} color={colors.primary} />
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.rowText}>{t('billSettings')}</Text>
              <Text style={styles.meta}>{t('billDesignHint')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
          <View style={styles.sep} />
          <Pressable style={styles.row} onPress={() => router.push('/settings/backup')}>
            <View style={styles.rowIcon}>
              <Ionicons name="cloud-upload" size={18} color={colors.primary} />
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.rowText}>{t('backup')}</Text>
              <Text style={styles.meta}>{t('backupHint')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
          <View style={styles.sep} />
          <Pressable style={styles.row} onPress={() => router.push('/reports')}>
            <View style={styles.rowIcon}>
              <Ionicons name="bar-chart" size={18} color={colors.primary} />
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.rowText}>{t('r_reports')}</Text>
              <Text style={styles.meta}>{t('r_reportsHint')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
          <View style={styles.sep} />
          <Pressable style={styles.row} onPress={() => router.push('/expenses')}>
            <View style={styles.rowIcon}>
              <Ionicons name="wallet" size={18} color={colors.primary} />
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.rowText}>{t('e_expenses')}</Text>
              <Text style={styles.meta}>{t('e_expensesHint')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
          <View style={styles.sep} />
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="language" size={18} color={colors.primary} />
            </View>
            <Text style={styles.rowText}>{t('language')}</Text>
            <LanguageToggle />
          </View>
        </Card>

        <Card>
          <Text style={styles.cardLabel}>{t('account')}</Text>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="logo-google" size={18} color={colors.primary} />
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.meta}>{t('loggedInAs')}</Text>
              <Text style={styles.rowText}>{email}</Text>
            </View>
          </View>
          <Button variant="danger" icon="log-out-outline" label={t('logout')} onPress={onLogout} />
        </Card>

        <View style={styles.footer}>
          <MadeInIndia />
          <Text style={styles.version}>
            {t('appName')} · {t('appVersion')} {version}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.6 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: 24, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  footer: { alignItems: 'center', gap: 4, marginTop: 8 },
  sep: { height: 1, backgroundColor: colors.border },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  editText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  version: { fontSize: 12, color: colors.faint },
});
