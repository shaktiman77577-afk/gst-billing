import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FormHeader } from '../src/components/FormHeader';
import { DateRangeButton } from '../src/components/DateRangeButton';
import { DateRangePicker } from '../src/components/DateRangePicker';
import { Card, IconName, SectionHeader } from '../src/components/ui';
import { useApp } from '../src/context/AppContext';
import { Daybook, getDaybook, getDaybookRange } from '../src/db/daybook';
import { DateRange } from '../src/lib/dateRange';
import { formatDate, fromIsoDate, toIsoDate, todayIso } from '../src/lib/dates';
import { formatPaise } from '../src/lib/money';
import { colors, radius } from '../src/theme';

function EntryRow({
  title,
  meta,
  amount,
  tint,
}: {
  title: string;
  meta?: string | null;
  amount: number;
  tint?: string;
}) {
  return (
    <View style={styles.entry}>
      <View style={styles.entryText}>
        <Text style={styles.entryTitle} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.entryMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.entryAmount, tint ? { color: tint } : null]}>{formatPaise(amount)}</Text>
    </View>
  );
}

export default function DaybookScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const [day, setDay] = useState(todayIso());
  const [data, setData] = useState<Daybook | null>(null);
  // Last chosen range for this screen (useState only — no schema changes).
  const [dbRange, setDbRange] = useState<DateRange | null>(null);
  const [rangeSheet, setRangeSheet] = useState(false);

  const reload = useCallback(() => {
    if (!businessId) return;
    if (dbRange) getDaybookRange(db, businessId, dbRange.from, dbRange.to).then(setData);
    else getDaybook(db, businessId, day).then(setData);
  }, [db, businessId, day, dbRange]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const shift = (d: number) => {
    const dt = fromIsoDate(day);
    setDay(toIsoDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + d)));
  };
  const isToday = day === todayIso();
  const sum = (xs: { total_paise?: number; amount_paise?: number }[]): number =>
    xs.reduce((a, x) => a + (x.total_paise ?? x.amount_paise ?? 0), 0);

  const salesTotal = sum(data?.sales ?? []);
  const receivedTotal = sum(data?.paymentsIn ?? []);
  const expenseTotal = sum(data?.expenses ?? []);
  const purchaseTotal = sum(data?.purchases ?? []);

  const section = (
    icon: IconName,
    title: string,
    total: number,
    count: number,
    children: React.ReactNode,
  ) => (
    <Card>
      <SectionHeader icon={icon} title={title} subtitle={`${count} · ${formatPaise(total)}`} />
      <View style={styles.list}>{children}</View>
    </Card>
  );

  const empty = <Text style={styles.emptyText}>{t('dbk_empty')}</Text>;

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('dbk_daybook')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {dbRange ? (
          <View style={styles.dateNav}>
            <DateRangeButton
              range={dbRange}
              onPress={() => setRangeSheet(true)}
              onClear={() => setDbRange(null)}
            />
          </View>
        ) : (
          <View style={styles.dateNav}>
            <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.dateLabel}>
              {formatDate(day)}
              {isToday ? ` · ${t('dbk_today')}` : ''}
            </Text>
            <Pressable onPress={() => shift(1)} hitSlop={10} style={styles.navBtn} disabled={isToday}>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={isToday ? colors.faint : colors.primary}
              />
            </Pressable>
            {!isToday ? (
              <Pressable onPress={() => setDay(todayIso())} hitSlop={10} style={styles.todayBtn}>
                <Text style={styles.todayText}>{t('dbk_today')}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setRangeSheet(true)} hitSlop={10} style={styles.navBtn}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </Pressable>
          </View>
        )}
        <DateRangePicker
          visible={rangeSheet}
          onClose={() => setRangeSheet(false)}
          value={dbRange}
          onApply={(r) => {
            setDbRange(r);
            setRangeSheet(false);
          }}
        />

        <Card>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('dbk_moneyIn')}</Text>
            <Text style={[styles.totalValue, { color: colors.success }]}>
              {formatPaise(data?.totalIn ?? 0)}
            </Text>
          </View>
          <View style={styles.sep} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('dbk_moneyOut')}</Text>
            <Text style={[styles.totalValue, { color: colors.danger }]}>
              {formatPaise(data?.totalOut ?? 0)}
            </Text>
          </View>
          <View style={styles.sep} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, styles.netLabel]}>{t('dbk_net')}</Text>
            <Text
              style={[
                styles.totalValue,
                styles.netValue,
                { color: (data?.net ?? 0) < 0 ? colors.danger : colors.success },
              ]}
            >
              {formatPaise(data?.net ?? 0)}
            </Text>
          </View>
        </Card>

        {section(
          'receipt-outline',
          t('dbk_sales'),
          salesTotal,
          data?.sales.length ?? 0,
          (data?.sales.length ?? 0) === 0
            ? empty
            : data!.sales.map((s) => (
                <EntryRow
                  key={s.id}
                  title={`${s.invoice_no} · ${s.party_name}`}
                  amount={s.total_paise}
                />
              )),
        )}

        {section(
          'arrow-down-circle-outline',
          t('dbk_paymentsIn'),
          receivedTotal,
          data?.paymentsIn.length ?? 0,
          (data?.paymentsIn.length ?? 0) === 0
            ? empty
            : data!.paymentsIn.map((p) => (
                <EntryRow
                  key={p.id}
                  title={p.party_name ?? '—'}
                  meta={p.note ?? p.mode}
                  amount={p.amount_paise}
                  tint={colors.success}
                />
              )),
        )}

        {section(
          'wallet-outline',
          t('dbk_expenses'),
          expenseTotal,
          data?.expenses.length ?? 0,
          (data?.expenses.length ?? 0) === 0
            ? empty
            : data!.expenses.map((e) => (
                <EntryRow
                  key={e.id}
                  // e_cat_* keys exist in both languages (repo pattern, see app/expenses/index.tsx)
                  title={t(`e_cat_${e.category}`)}
                  meta={[e.payment_mode, e.note].filter(Boolean).join(' · ') || null}
                  amount={e.amount_paise}
                  tint={colors.danger}
                />
              )),
        )}

        {section(
          'cart-outline',
          t('dbk_purchases'),
          purchaseTotal,
          data?.purchases.length ?? 0,
          !(data?.purchasesAvailable ?? true) ? (
            <Text style={styles.emptyText}>{t('dbk_purchasesPending')}</Text>
          ) : (data?.purchases.length ?? 0) === 0 ? (
            empty
          ) : (
            data!.purchases.map((p) => (
              <EntryRow
                key={p.id}
                title={`${p.bill_no}${p.party_name ? ` · ${p.party_name}` : ''}`}
                meta={p.note}
                amount={p.total_paise}
                tint={colors.danger}
              />
            ))
          ),
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateLabel: { fontSize: 17, fontWeight: '700', color: colors.text, minWidth: 150, textAlign: 'center' },
  todayBtn: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  todayText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  totalLabel: { fontSize: 14, fontWeight: '600', color: colors.muted },
  totalValue: { fontSize: 16, fontWeight: '700' },
  netLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  netValue: { fontSize: 18, fontWeight: '800' },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  list: { gap: 10, marginTop: 4 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  entryText: { flex: 1 },
  entryTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  entryMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  entryAmount: { fontSize: 14, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 13, color: colors.faint, textAlign: 'center', paddingVertical: 8 },
});
