import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BillRow } from '../../src/components/BillRow';
import { CloudPill } from '../../src/components/CloudStatus';
import { DateRangeButton } from '../../src/components/DateRangeButton';
import { DateRangePicker } from '../../src/components/DateRangePicker';
import { EmptyState } from '../../src/components/EmptyState';
import { GstDeadlinesCard } from '../../src/components/GstDeadlinesCard';
import { Header } from '../../src/components/Header';
import { Card, IconName } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { getMeta } from '../../src/db/meta';
import { InvoiceListRow, listInvoices, salesSummary } from '../../src/db/invoices';
import { totalExpenses } from '../../src/db/expenses';
import { partyTotals } from '../../src/db/parties';
import { useBusiness } from '../../src/hooks/useBusiness';
import { StringKey } from '../../src/i18n/strings';
import { getAlertCounts } from '../../src/lib/alerts';
import { monthStartIso, todayIso } from '../../src/lib/dates';
import { DateRange } from '../../src/lib/dateRange';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, shadowSm, text } from '../../src/theme';

function greetingKey(): StringKey {
  const h = new Date().getHours();
  if (h < 12) return 'goodMorning';
  if (h < 17) return 'goodAfternoon';
  return 'goodEvening';
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const business = useBusiness();
  const [totals, setTotals] = useState({ toCollect: 0, toPay: 0 });
  const [recent, setRecent] = useState<InvoiceListRow[]>([]);
  const [month, setMonth] = useState({ total: 0, count: 0 });
  const [monthExp, setMonthExp] = useState(0);
  const [remind, setRemind] = useState(false);
  const [alerts, setAlerts] = useState({ lowStock: 0, overdueCount: 0, overdueTotal: 0 });
  // Last chosen range for this screen (useState only — no schema changes).
  // Null = unfiltered, showing the 5 most recent bills as before.
  const [txRange, setTxRange] = useState<DateRange | null>(null);
  const [txSheet, setTxSheet] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      partyTotals(db, businessId).then(setTotals);
      if (txRange) {
        listInvoices(db, businessId, 500).then((rows) =>
          setRecent(
            rows
              .filter(
                (r) =>
                  r.doc_type !== 'quotation' &&
                  r.doc_type !== 'proforma' &&
                  r.invoice_date >= txRange.from &&
                  r.invoice_date <= txRange.to,
              )
              .slice(0, 50),
          ),
        );
      } else {
        listInvoices(db, businessId, 5).then((rows) =>
          setRecent(rows.filter((r) => r.doc_type !== 'quotation' && r.doc_type !== 'proforma')),
        );
      }
      salesSummary(db, businessId, monthStartIso()).then(setMonth);
      totalExpenses(db, businessId, monthStartIso(), todayIso()).then(setMonthExp);
      // Remind when no cloud backup has succeeded in 7 days (backupNow stamps
      // last_backup_at; change-triggered and manual uploads both count).
      getMeta(db, 'last_backup_at').then((last) => {
        setRemind(!last || Date.now() - new Date(last).getTime() > 7 * 86400000);
      });
      getAlertCounts(db, businessId, todayIso()).then(setAlerts);
    }, [db, businessId, txRange]),
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

  const profit = month.total - monthExp;

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

        <View style={styles.payActions}>
          <Pressable
            onPress={() => router.push({ pathname: '/payment/new', params: { direction: 'in' } })}
            style={({ pressed }) => [styles.payBtn, { backgroundColor: colors.successSoft }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="arrow-down-circle" size={22} color={colors.success} />
            <Text style={[styles.payLabel, { color: colors.success }]}>{t('receivePayment')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/payment/new', params: { direction: 'out' } })}
            style={({ pressed }) => [styles.payBtn, { backgroundColor: colors.dangerSoft }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="arrow-up-circle" size={22} color={colors.danger} />
            <Text style={[styles.payLabel, { color: colors.danger }]}>{t('paymentOutAction')}</Text>
          </Pressable>
        </View>

        {remind ? (
          <Pressable style={styles.reminder} onPress={() => router.push('/settings/backup')}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.warning} />
            <Text style={styles.reminderText}>{t('backupReminder')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        ) : null}

        {(alerts.lowStock > 0 || alerts.overdueCount > 0) ? (
          <View>
            <Text style={styles.sectionTitle}>{t('a_needsAttention')}</Text>
            <View style={styles.alerts}>
              {alerts.lowStock > 0 ? (
                <Pressable style={styles.alertCard} onPress={() => router.push({ pathname: '/items', params: { filter: 'low' } })}>
                  <View style={[styles.alertIcon, { backgroundColor: colors.warningSoft }]}>
                    <Ionicons name="cube-outline" size={20} color={colors.warning} />
                  </View>
                  <View style={styles.flexOnly}>
                    <Text style={styles.alertLabel}>{t('a_lowStock')}</Text>
                    <Text style={styles.alertSub}>
                      {t('a_lowStockSub').replace('{n}', String(alerts.lowStock))}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                </Pressable>
              ) : null}
              {alerts.overdueCount > 0 ? (
                <Pressable style={styles.alertCard} onPress={() => router.push('/alerts/overdue')}>
                  <View style={[styles.alertIcon, { backgroundColor: colors.dangerSoft }]}>
                    <Ionicons name="alarm-outline" size={20} color={colors.danger} />
                  </View>
                  <View style={styles.flexOnly}>
                    <Text style={styles.alertLabel}>{t('a_paymentDue')}</Text>
                    <Text style={styles.alertSub}>
                      {t('a_paymentDueSub')
                        .replace('{total}', formatPaise(alerts.overdueTotal))
                        .replace('{n}', String(alerts.overdueCount))}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                </Pressable>
              ) : null}
            </View>
          </View>
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

        <View style={styles.monthCard}>
          <View style={styles.monthIcon}>
            <Ionicons name="wallet-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.flexOnly}>
            <Text style={styles.statLabel}>{t('e_profitMonth')}</Text>
            <Text style={[styles.monthValue, { color: profit >= 0 ? colors.success : colors.danger }]}>
              {formatPaise(profit)}
            </Text>
          </View>
          <View style={styles.profitBreak}>
            <Text style={styles.profitLine}>
              {t('thisMonthSales')}: {formatPaise(month.total)}
            </Text>
            <Text style={styles.profitLine}>
              {t('e_expenses')}: {formatPaise(monthExp)}
            </Text>
          </View>
        </View>

        <GstDeadlinesCard />

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

        <View style={styles.txHeader}>
          <Text style={styles.txTitle}>{t('recentBills')}</Text>
          <DateRangeButton
            range={txRange}
            onPress={() => setTxSheet(true)}
            onClear={() => setTxRange(null)}
          />
        </View>
        <DateRangePicker
          visible={txSheet}
          onClose={() => setTxSheet(false)}
          value={txRange}
          onApply={(r) => {
            setTxRange(r);
            setTxSheet(false);
          }}
        />
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
  gstText: { color: colors.primary, fontSize: text.xs, fontWeight: '600', letterSpacing: 0.3 },
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
  statLabel: { fontSize: text.xs, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: text.xl, fontWeight: '800', marginTop: 2 },
  payActions: { flexDirection: 'row', gap: 12 },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 14,
    ...shadowSm,
  },
  payLabel: { fontSize: text.md, fontWeight: '700' },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
  },
  reminderText: { flex: 1, fontSize: text.sm, color: colors.warning, fontWeight: '600' },
  alerts: { gap: 10 },
  alertCard: {
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
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  alertSub: { fontSize: text.sm, color: colors.muted, fontWeight: '600', marginTop: 2 },
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
  monthValue: { fontSize: text.xl, fontWeight: '800', color: colors.text, marginTop: 2 },
  monthCount: { fontSize: text.xs, color: colors.muted, fontWeight: '600' },
  profitBreak: { alignItems: 'flex-end' },
  profitLine: { fontSize: text.xs, color: colors.muted, fontWeight: '600', marginTop: 2 },
  sectionTitle: { fontSize: text.md, fontWeight: '700', letterSpacing: 0.2, color: colors.muted, marginTop: 4 },
  txHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 8 },
  txTitle: { fontSize: text.md, fontWeight: '700', letterSpacing: 0.2, color: colors.muted, flex: 1 },
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
  actionLabel: { fontSize: text.sm, fontWeight: '600', color: colors.text },
  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
