import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BillRow } from '../../src/components/BillRow';
import { DateRangeButton } from '../../src/components/DateRangeButton';
import { DateRangePicker } from '../../src/components/DateRangePicker';
import { EmptyState } from '../../src/components/EmptyState';
import { GstDeadlinesCard } from '../../src/components/GstDeadlinesCard';
import { Card, Hairline, IconName, MenuRow } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { InvoiceListRow, listInvoices, salesSummary } from '../../src/db/invoices';
import { totalExpenses } from '../../src/db/expenses';
import { partyTotals } from '../../src/db/parties';
import { useBusiness } from '../../src/hooks/useBusiness';
import { StringKey } from '../../src/i18n/strings';
import { getAlertCounts } from '../../src/lib/alerts';
import { monthStartIso, todayIso } from '../../src/lib/dates';
import { DateRange } from '../../src/lib/dateRange';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, spacing, tabular, text } from '../../src/theme';

function greetingKey(): StringKey {
  const h = new Date().getHours();
  if (h < 12) return 'goodMorning';
  if (h < 17) return 'goodAfternoon';
  return 'goodEvening';
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const insets = useSafeAreaInsets();
  const business = useBusiness();
  const [totals, setTotals] = useState({ toCollect: 0, toPay: 0 });
  const [recent, setRecent] = useState<InvoiceListRow[]>([]);
  const [month, setMonth] = useState({ total: 0, count: 0 });
  const [monthExp, setMonthExp] = useState(0);
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
                  r.doc_type !== 'delivery_challan' && r.doc_type !== 'proforma' &&
                  r.invoice_date >= txRange.from &&
                  r.invoice_date <= txRange.to,
              )
              .slice(0, 50),
          ),
        );
      } else {
        listInvoices(db, businessId, 5).then((rows) =>
          setRecent(rows.filter((r) => r.doc_type !== 'quotation' && r.doc_type !== 'delivery_challan' && r.doc_type !== 'proforma')),
        );
      }
      salesSummary(db, businessId, monthStartIso()).then(setMonth);
      totalExpenses(db, businessId, monthStartIso(), todayIso()).then(setMonthExp);
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
    {
      icon: 'bar-chart',
      label: t('r_reports'),
      color: colors.success,
      bg: colors.successSoft,
      onPress: () => router.push('/reports'),
    },
  ];

  const profit = month.total - monthExp;
  const tiles = actions.slice(1); // "New bill" gets its own primary button
  const initials =
    (business?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '₹';

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />

      {/* Clean white header: logo mark + business name + GSTIN */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.flexOnly}>
          <Text style={styles.greeting}>{t(greetingKey())}</Text>
          <Text style={styles.bizName} numberOfLines={1}>
            {business?.name ?? ''}
          </Text>
          {business?.gstin ? (
            <Text style={styles.gstText} numberOfLines={1}>
              GSTIN {business.gstin}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Money summary + payment actions */}
        <View style={styles.card}>
          <View style={styles.moneyRow}>
            <View style={styles.moneyCol}>
              <Text style={styles.moneyLabel}>{t('toCollect')}</Text>
              <Text style={[styles.moneyValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatPaise(totals.toCollect)}
              </Text>
            </View>
            <View style={styles.moneyDivider} />
            <View style={styles.moneyCol}>
              <Text style={styles.moneyLabel}>{t('toPay')}</Text>
              <Text style={[styles.moneyValue, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatPaise(totals.toPay)}
              </Text>
            </View>
          </View>
          <View style={styles.payActions}>
            <Pressable
              onPress={() => router.push({ pathname: '/payment/new', params: { direction: 'in' } })}
              style={({ pressed }) => [styles.payBtn, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-down" size={16} color={colors.success} />
              <Text style={styles.payLabel} numberOfLines={1}>
                {t('receivePayment')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/payment/new', params: { direction: 'out' } })}
              style={({ pressed }) => [styles.payBtn, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-up" size={16} color={colors.danger} />
              <Text style={styles.payLabel} numberOfLines={1}>
                {t('paymentOutAction')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Primary action */}
        <Pressable
          onPress={() => router.push('/bill/new')}
          style={({ pressed }) => [styles.newBill, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={20} color={colors.white} />
          <Text style={styles.newBillLabel}>{t('newBill')}</Text>
        </Pressable>

        {/* Secondary actions */}
        <View style={styles.tiles}>
          {tiles.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            >
              <Ionicons name={a.icon} size={20} color={colors.primary} />
              <Text style={styles.tileLabel} numberOfLines={1}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {alerts.lowStock > 0 || alerts.overdueCount > 0 ? (
          <View style={styles.section}>
            <SectionTitle>{t('a_needsAttention')}</SectionTitle>
            <Card list>
              {alerts.lowStock > 0 ? (
                <MenuRow
                  icon="cube-outline"
                  iconBg={colors.warningSoft}
                  iconFg={colors.warning}
                  title={t('a_lowStock')}
                  subtitle={t('a_lowStockSub').replace('{n}', String(alerts.lowStock))}
                  onPress={() => router.push({ pathname: '/items', params: { filter: 'low' } })}
                />
              ) : null}
              {alerts.lowStock > 0 && alerts.overdueCount > 0 ? <Hairline /> : null}
              {alerts.overdueCount > 0 ? (
                <MenuRow
                  icon="alarm-outline"
                  iconBg={colors.dangerSoft}
                  iconFg={colors.danger}
                  title={t('a_paymentDue')}
                  subtitle={t('a_paymentDueSub')
                    .replace('{total}', formatPaise(alerts.overdueTotal))
                    .replace('{n}', String(alerts.overdueCount))}
                  onPress={() => router.push('/alerts/overdue')}
                />
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* This month: sales + profit side by side */}
        <View style={styles.section}>
          <SectionTitle>{t('dr_preset_thisMonth')}</SectionTitle>
          <View style={[styles.card, styles.statRow]}>
            <Pressable
              style={({ pressed }) => [styles.statCol, pressed && styles.pressed]}
              onPress={() => router.navigate('/bills')}
            >
              <Text style={styles.statLabel} numberOfLines={1}>
                {t('thisMonthSales')} · {month.count} {t('billsCount')}
              </Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatPaise(month.total)}
              </Text>
            </Pressable>
            <View style={styles.moneyDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel} numberOfLines={1}>
                {t('e_profitMonth')}
              </Text>
              <Text
                style={[styles.statValue, { color: profit >= 0 ? colors.success : colors.danger }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatPaise(profit)}
              </Text>
              <Text style={styles.statSub} numberOfLines={1}>
                {t('e_expenses')}: {formatPaise(monthExp)}
              </Text>
            </View>
          </View>
        </View>

        <GstDeadlinesCard />

        <View style={styles.section}>
          <View style={styles.txHeader}>
            <SectionTitle>{t('recentBills')}</SectionTitle>
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
          <Card style={recent.length ? { gap: 0, paddingVertical: 4 } : undefined}>
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
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 32 },
  section: { gap: spacing.sm },

  // ---- Header ----
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.md + 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  greeting: { color: colors.muted, fontSize: text.xs, lineHeight: 16 },
  bizName: { color: colors.text, fontSize: text.lg, lineHeight: 22, fontWeight: '700' },
  gstText: { color: colors.muted, fontSize: text.xs, lineHeight: 16, ...tabular },

  // ---- Cards ----
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  moneyRow: { flexDirection: 'row', alignItems: 'stretch' },
  moneyCol: { flex: 1, gap: 4 },
  moneyLabel: { fontSize: text.xs, lineHeight: 16, fontWeight: '500', color: colors.muted },
  moneyValue: { fontSize: text.xxl, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, ...tabular },
  moneyDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },

  payActions: { flexDirection: 'row', gap: spacing.sm },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  payLabel: { fontSize: text.sm, fontWeight: '500', color: colors.text, flexShrink: 1 },

  newBill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.md + 2,
    backgroundColor: colors.primary,
  },
  newBillLabel: { color: colors.white, fontSize: 15, fontWeight: '500' },

  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: -spacing.sm },
  tile: {
    flex: 1,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tileLabel: { fontSize: text.xs, fontWeight: '500', color: colors.textSecondary },

  // ---- This month ----
  statRow: { flexDirection: 'row', gap: 0, paddingVertical: 14 },
  statCol: { flex: 1, gap: 4 },
  statLabel: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  statValue: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text, ...tabular },
  statSub: { fontSize: text.xs, lineHeight: 16, color: colors.muted, ...tabular },

  // ---- Section titles ----
  sectionTitle: {
    fontSize: text.xs,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  txHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.divider },
});
