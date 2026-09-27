import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { EmptyState } from '../../src/components/EmptyState';
import { FormHeader } from '../../src/components/FormHeader';
import { Button } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { useBusiness } from '../../src/hooks/useBusiness';
import { getOverdueInvoices, OverdueInvoice } from '../../src/lib/alerts';
import { formatDate, todayIso } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { billWhatsappText, whatsappMessage } from '../../src/pdf/share';
import { colors, radius } from '../../src/theme';

export default function OverdueScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
  const [rows, setRows] = useState<OverdueInvoice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    const r = await getOverdueInvoices(db, businessId, todayIso());
    setRows(r);
  }, [db, businessId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const total = rows.reduce((s, r) => s + r.balance_paise, 0);

  const remind = async (inv: OverdueInvoice) => {
    if (!inv.party_phone || !business) return;
    setBusyId(inv.id);
    try {
      const caption = billWhatsappText(t, {
        name: inv.party_name,
        no: inv.invoice_no,
        date: formatDate(inv.invoice_date),
        amount: formatPaise(inv.total_paise),
        balance: formatPaise(inv.balance_paise),
        business: business.name,
      });
      await whatsappMessage(inv.party_phone, caption);
    } catch {
      Alert.alert(t('appName'), t('a_remindError'));
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }: { item: OverdueInvoice }) => (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.party} numberOfLines={1}>
          {item.party_name}
        </Text>
        <Text style={styles.meta}>
          {item.invoice_no} · {t('a_due')}: {formatDate(item.due_date)}
        </Text>
        <View style={styles.badge}>
          <Ionicons name="alarm-outline" size={13} color={colors.danger} />
          <Text style={styles.badgeText}>{t('a_daysOverdue').replace('{n}', String(item.days_overdue))}</Text>
        </View>
      </View>
      <View style={styles.rowSide}>
        <Text style={styles.balance}>{formatPaise(item.balance_paise)}</Text>
        <Button
          label={t('a_remind')}
          icon="logo-whatsapp"
          onPress={() => remind(item)}
          disabled={!item.party_phone}
          loading={busyId === item.id}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('a_paymentDue')} />
      {rows.length > 0 ? (
        <View style={styles.summary}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.summaryText}>
            {t('a_overdueSummary').replace('{total}', formatPaise(total)).replace('{n}', String(rows.length))}
          </Text>
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          !refreshing ? (
            <EmptyState icon="checkmark-circle-outline" title={t('a_overdueEmpty')} hint={t('a_overdueEmptyHint')} />
          ) : null
        }
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
  },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.danger },
  list: { padding: 16, paddingBottom: 32, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
  },
  rowMain: { flex: 1, gap: 4 },
  party: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 4,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.danger },
  rowSide: { alignItems: 'flex-end', gap: 8 },
  balance: { fontSize: 16, fontWeight: '800', color: colors.danger },
});
