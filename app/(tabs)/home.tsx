import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { colors, radius, shadow, shadowSm, spacing, text } from '../../src/theme';

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

  return (
    <View style={styles.flex}>
      <StatusBar style="light" />

      {/* Deep navy hero with layered "gradient" decoration */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.heroGlowA} pointerEvents="none" />
        <View style={styles.heroGlowB} pointerEvents="none" />
        <Text style={styles.greeting}>{t(greetingKey())}</Text>
        <Text style={styles.bizName} numberOfLines={1}>
          {business?.name ?? ''}
        </Text>
        {business?.gstin ? (
          <View style={styles.gstPill}>
            <Ionicons name="checkmark-circle" size={14} color={colors.white} />
            <Text style={styles.gstText}>GSTIN {business.gstin}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        {/* Hero money card overlapping the navy hero */}
        <View style={styles.moneyCard}>
          <View style={styles.moneyCol}>
            <View style={styles.moneyLabelRow}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={styles.moneyLabel}>{t('toCollect')}</Text>
            </View>
            <Text style={[styles.moneyValue, { color: colors.success }]}>
              {formatPaise(totals.toCollect)}
            </Text>
          </View>
          <View style={styles.moneyDivider} />
          <View style={styles.moneyCol}>
            <View style={styles.moneyLabelRow}>
              <View style={[styles.dot, { backgroundColor: colors.danger }]} />
              <Text style={styles.moneyLabel}>{t('toPay')}</Text>
            </View>
            <Text style={[styles.moneyValue, { color: colors.danger }]}>
              {formatPaise(totals.toPay)}
            </Text>
          </View>
        </View>

        <View style={styles.payActions}>
          <Pressable
            onPress={() => router.push({ pathname: '/payment/new', params: { direction: 'in' } })}
            style={({ pressed }) => [
              styles.payBtn,
              { backgroundColor: colors.successSoft },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="arrow-down-circle" size={26} color={colors.success} />
            <Text style={[styles.payLabel, { color: colors.success }]}>{t('receivePayment')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/payment/new', params: { direction: 'out' } })}
            style={({ pressed }) => [
              styles.payBtn,
              { backgroundColor: colors.dangerSoft },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="arrow-up-circle" size={26} color={colors.danger} />
            <Text style={[styles.payLabel, { color: colors.danger }]}>{t('paymentOutAction')}</Text>
          </Pressable>
        </View>

        {(alerts.lowStock > 0 || alerts.overdueCount > 0) ? (
          <View>
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

        <Pressable style={styles.insightCard} onPress={() => router.navigate('/bills')}>
          <View style={styles.insightIcon}>
            <Ionicons name="trending-up" size={22} color={colors.primary} />
          </View>
          <View style={styles.flexOnly}>
            <Text style={styles.insightLabel}>{t('thisMonthSales')}</Text>
            <Text style={styles.insightValue}>{formatPaise(month.total)}</Text>
          </View>
          <View style={styles.countChip}>
            <Text style={styles.countChipText}>
              {month.count} {t('billsCount')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Pressable>

        <View style={styles.insightCard}>
          <View style={[styles.insightIcon, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="wallet-outline" size={22} color={colors.success} />
          </View>
          <View style={styles.flexOnly}>
            <Text style={styles.insightLabel}>{t('e_profitMonth')}</Text>
            <Text style={[styles.insightValue, { color: profit >= 0 ? colors.success : colors.danger }]}>
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

        <SectionTitle>{t('quickActions')}</SectionTitle>
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.actionTile, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon} size={26} color={a.color} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={2}>
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
  flex: { flex: 1, backgroundColor: colors.primaryDark },
  flexOnly: { flex: 1 },
  scroll: { backgroundColor: colors.background, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 32 },

  // ---- Navy hero ----
  hero: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.xl,
    paddingBottom: 64,
    overflow: 'hidden',
  },
  heroGlowA: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroGlowB: {
    position: 'absolute',
    bottom: -110,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(96,165,250,0.14)',
  },
  greeting: { color: colors.whiteSoft, fontSize: text.sm, fontWeight: '600' },
  bizName: {
    color: colors.white,
    fontSize: text.display,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  gstPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  gstText: { color: colors.white, fontSize: text.xs, fontWeight: '700', letterSpacing: 0.4 },

  // ---- Overlapping money card ----
  moneyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginTop: -40,
    ...shadow,
  },
  moneyCol: { flex: 1 },
  moneyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  moneyLabel: {
    fontSize: text.xs,
    color: colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  moneyValue: { fontSize: text.xxl, fontWeight: '800', marginTop: 6, letterSpacing: 0.2 },
  moneyDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.md },

  // ---- Pay buttons ----
  payActions: { flexDirection: 'row', gap: 12 },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: radius.xl,
    paddingVertical: 18,
    ...shadowSm,
  },
  payLabel: { fontSize: text.md, fontWeight: '800' },

  // ---- Insight cards (month sales / profit) ----
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadowSm,
  },
  insightIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightLabel: {
    fontSize: text.xs,
    color: colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  insightValue: { fontSize: text.xxl, fontWeight: '800', color: colors.text, marginTop: 4 },
  countChip: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countChipText: { fontSize: text.xs, color: colors.primary, fontWeight: '700' },
  profitBreak: { alignItems: 'flex-end' },
  profitLine: { fontSize: text.xs, color: colors.muted, fontWeight: '600', marginTop: 2 },

  // ---- Section titles: small caps ----
  sectionTitle: {
    fontSize: text.xs,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 6,
  },
  txHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8 },
  txTitle: {
    fontSize: text.xs,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.muted,
    flex: 1,
  },

  // ---- Quick action tiles ----
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: 10,
    ...shadowSm,
  },
  actionTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: text.sm, fontWeight: '700', color: colors.text, textAlign: 'center' },

  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
