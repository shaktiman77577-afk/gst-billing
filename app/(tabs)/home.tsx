import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BillRow } from '../../src/components/BillRow';
import { CloudPill } from '../../src/components/CloudStatus';
import { EmptyState } from '../../src/components/EmptyState';
import { Header } from '../../src/components/Header';
import { Card, IconName } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { needsBackupReminder } from '../../src/db/backup';
import { InvoiceListRow, listInvoices, salesSummary } from '../../src/db/invoices';
import { partyTotals } from '../../src/db/parties';
import { useBusiness } from '../../src/hooks/useBusiness';
import { StringKey } from '../../src/i18n/strings';
import { monthStartIso } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, shadowSm } from '../../src/theme';

function greetingKey(): StringKey {
  const h = new Date().getHours();
  if (h < 12) return 'goodMorning';
  if (h < 17) return 'goodAfternoon';
  return 'goodEvening';
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
  const [totals, setTotals] = useState({ toCollect: 0, toPay: 0 });
  const [recent, setRecent] = useState<InvoiceListRow[]>([]);
  const [month, setMonth] = useState({ total: 0, count: 0 });
  const [remind, setRemind] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      partyTotals(db, businessId).then(setTotals);
      listInvoices(db, businessId, 5).then(setRecent);
      salesSummary(db, businessId, monthStartIso()).then(setMonth);
      needsBackupReminder(db, businessId).then(setRemind);
    }, [db, businessId]),
  );

  const actions: { icon: IconName; label: string; color: string; bg: string; onPress: () => void }[] = [
    {
      icon: 'document-text',
      label: t('newBill'),
      color: colors.white,
      bg: colors.primary,
      onPress: () => router.push('/bill/new'),
    },
    {
      icon: 'person-add',
      label: t('addParty'),
      color: colors.primary,
      bg: colors.primarySoft,
      onPress: () => router.push('/party/new'),
    },
    {
      icon: 'add-circle',
      label: t('addItem'),
      color: colors.warning,
      bg: colors.accentSoft,
      onPress: () => router.push('/item/new'),
    },
  ];

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <Header
        subtitle={t(greetingKey())}
        title={business?.name ?? ''}
        right={
          <Pressable onPress={() => router.push('/settings/backup')} hitSlop={8}>
            <CloudPill />
          </Pressable>
        }
      >
        {business?.gstin ? (
          <View style={styles.gstChip}>
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
            <Text style={styles.gstText}>GSTIN {business.gstin}</Text>
          </View>
        ) : null}
      </Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="arrow-down-circle" size={20} color={colors.success} />
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.statLabel}>{t('toCollect')}</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{formatPaise(totals.toCollect)}</Text>
            </View>
          </View>
          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="arrow-up-circle" size={20} color={colors.danger} />
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.statLabel}>{t('toPay')}</Text>
              <Text style={[styles.statValue, { color: colors.danger }]}>{formatPaise(totals.toPay)}</Text>
            </View>
          </View>
        </View>

        {remind ? (
          <Pressable style={styles.reminder} onPress={() => router.push('/settings/backup')}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.warning} />
            <Text style={styles.reminderText}>{t('backupReminder')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        ) : null}

        <Pressable style={styles.monthCard} onPress={() => router.navigate('/bills')}>
          <View style={styles.monthIcon}>
            <Ionicons name="trending-up" size={22} color={colors.primary} />
          </View>
          <View style={styles.flexOnly}>
            <Text style={styles.statLabel}>{t('thisMonthSales')}</Text>
            <Text style={styles.monthValue}>{formatPaise(month.total)}</Text>
          </View>
          <Text style={styles.monthCount}>
            {month.count} {t('billsCount')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Pressable>

        <Text style={styles.sectionTitle}>{t('quickActions')}</Text>
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon} size={24} color={a.color} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('recentBills')}</Text>
        <Card style={recent.length ? { gap: 0, paddingVertical: 6 } : undefined}>
          {recent.length === 0 ? (
            <EmptyState icon="receipt-outline" title={t('noBillsYet')} hint={t('noBillsHint')} />
          ) : (
            recent.map((b, i) => (
              <View key={b.id} style={i < recent.length - 1 ? styles.rowSep : undefined}>
                <BillRow bill={b} flat />
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  gstChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  gstText: { color: colors.primary, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    ...shadowSm,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    padding: 12,
  },
  reminderText: { flex: 1, fontSize: 13, color: colors.warning, fontWeight: '600' },
  monthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    ...shadowSm,
  },
  monthIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  monthCount: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2, color: colors.muted, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    ...shadowSm,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
