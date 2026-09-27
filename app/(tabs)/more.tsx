import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Header } from '../../src/components/Header';
import { LanguageToggle } from '../../src/components/LanguageToggle';
import { Button, Card, Hairline, MadeInIndia, MenuRow } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { stateName } from '../../src/data/states';
import { useBusiness } from '../../src/hooks/useBusiness';
import { colors, radius, text } from '../../src/theme';

export default function MoreScreen() {
  const { t, email, logout, language } = useApp();
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

        <Card list>
          <MenuRow
            icon="document-text"
            title={t('billSettings')}
            subtitle={t('billDesignHint')}
            onPress={() => router.push('/settings/bill')}
          />
          <Hairline />
          <MenuRow
            icon="star-outline"
            title={t('mem_title')}
            subtitle={t('mem_rowHint')}
            onPress={() => router.push('/settings/membership')}
          />
          <Hairline />
          <MenuRow
            icon="trash-bin-outline"
            title={t('rc_menuTitle')}
            subtitle={t('rc_menuHint')}
            onPress={() => router.push('/settings/recycle')}
          />
          <Hairline />
          <MenuRow
            icon="search"
            title={t('gr_title')}
            subtitle={t('gr_searchPlaceholder')}
            onPress={() => router.push('/settings/gst-rates')}
          />
          <Hairline />
          <MenuRow
            icon="bar-chart"
            title={t('r_reports')}
            subtitle={t('r_reportsHint')}
            onPress={() => router.push('/reports')}
          />
          <Hairline />
          <MenuRow
            icon="wallet"
            title={t('e_expenses')}
            subtitle={t('e_expensesHint')}
            onPress={() => router.push('/expenses')}
          />
          <Hairline />
          <MenuRow
            icon="bag-handle-outline"
            title={t('pur_purchases')}
            subtitle={t('pur_purchasesHint')}
            onPress={() => router.push('/purchases')}
          />
          <Hairline />
          <MenuRow
            icon="arrow-undo-outline"
            title={t('newSalesReturn')}
            subtitle={t('salesReturnHint')}
            onPress={() => router.push('/returns/sales')}
          />
          <Hairline />
          <MenuRow
            icon="arrow-redo-outline"
            title={t('newPurchaseReturn')}
            subtitle={t('purchaseReturnHint')}
            onPress={() => router.push('/purchases/return')}
          />
          <Hairline />
          <MenuRow
            icon="car-outline"
            title={t('ch_menuTitle')}
            subtitle={t('ch_menuHint')}
            onPress={() => router.push('/challans')}
          />
          <Hairline />
          <MenuRow
            icon="clipboard-outline"
            title={t('pf_menuTitle')}
            subtitle={t('pf_menuHint')}
            onPress={() => router.push('/proforma')}
          />
          <Hairline />
          <MenuRow
            icon="book-outline"
            title={t('dbk_daybook')}
            subtitle={t('dbk_daybookHint')}
            onPress={() => router.push('/daybook')}
          />
          <Hairline />
          <MenuRow icon="language" title={t('language')} right={<LanguageToggle />} />
        </Card>

        <Card>
          <Text style={styles.cardLabel}>{t('account')}</Text>
          <MenuRow
            icon="logo-google"
            title={email ?? ''}
            subtitle={t('loggedInAs')}
            chevron={false}
          />
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
  cardLabel: { fontSize: text.xs, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.6 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: text.xxl, fontWeight: '800' },
  name: { fontSize: text.md, fontWeight: '700', color: colors.text },
  meta: { fontSize: text.sm, color: colors.muted, marginTop: 2 },
  footer: { alignItems: 'center', gap: 4, marginTop: 8 },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  editText: { fontSize: text.xs, fontWeight: '700', color: colors.primary },
  version: { fontSize: text.xs, color: colors.faint },
});
