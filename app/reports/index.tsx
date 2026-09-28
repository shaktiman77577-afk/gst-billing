import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateRangeButton } from '../../src/components/DateRangeButton';
import { DateRangePicker } from '../../src/components/DateRangePicker';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, IconName, Overline } from '../../src/components/ui';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../../src/context/AppContext';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatPaise } from '../../src/lib/money';
import { receivablesTotal, salesSummary } from '../../src/lib/reports';
import { toIsoDate } from '../../src/lib/dates';
import { exportGstr1Csv } from '../../src/lib/gstr1';
import { exportGstr1Json, fpForDate, fpLabel, shiftFp } from '../../src/lib/gstr1json';
import { exportTallyXml } from '../../src/lib/tally';
import { DateRange, makeRange } from '../../src/lib/dateRange';
import { colors, radius, spacing, tabular, text } from '../../src/theme';

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const { t, language } = useApp();
  const business = useBusiness();
  const [due, setDue] = useState<number | null>(null);
  // Last 6 calendar months (oldest first) — sales total + GST for the chart.
  const [months, setMonths] = useState<{ label: string; total: number; tax: number }[]>([]);
  const [exporting, setExporting] = useState(false);
  const [fp, setFp] = useState(() => fpForDate(new Date()));
  const [exportingJson, setExportingJson] = useState(false);
  const [talRange, setTalRange] = useState<DateRange>(() => makeRange('thisMonth'));
  const [talSheet, setTalSheet] = useState(false);
  const [tallying, setTallying] = useState(false);

  const onExportGstr1 = useCallback(async () => {
    if (!business || exporting) return;
    setExporting(true);
    try {
      const uri = await exportGstr1Csv(db, business.id, business.name);
      if (!uri) {
        AppAlert.alert(t('g1_noDataTitle'), t('g1_noData'));
      } else {
        AppAlert.alert(t('g1_doneTitle'), t('g1_done'));
      }
    } catch {
      AppAlert.alert(t('g1_failedTitle'), t('g1_failed'));
    } finally {
      setExporting(false);
    }
  }, [business, db, exporting, t]);

  const onExportGstr1Json = useCallback(async () => {
    if (!business || exportingJson) return;
    if (!business.gstin || !business.gstin.trim()) {
      AppAlert.alert(t('gj_noGstinTitle'), t('gj_noGstin'));
      return;
    }
    setExportingJson(true);
    try {
      const uri = await exportGstr1Json(
        db,
        { id: business.id, gstin: business.gstin, name: business.name, state_code: business.state_code },
        fp,
      );
      if (!uri) {
        AppAlert.alert(t('gj_noDataTitle'), t('gj_noData'));
      } else {
        AppAlert.alert(t('gj_doneTitle'), t('gj_done'));
      }
    } catch {
      AppAlert.alert(t('gj_failedTitle'), t('gj_failed'));
    } finally {
      setExportingJson(false);
    }
  }, [business, db, exportingJson, fp, t]);

  const menu: { route: '/reports/sales' | '/reports/gst' | '/reports/top' | '/daybook'; icon: IconName; title: string; hint: string }[] = [
    { route: '/reports/sales', icon: 'bar-chart-outline', title: t('r_salesReport'), hint: t('r_salesReportHint') },
    { route: '/reports/gst', icon: 'receipt-outline', title: t('r_gstSummary'), hint: t('r_gstSummaryHint') },
    { route: '/reports/top', icon: 'trophy-outline', title: t('r_topLists'), hint: t('r_topListsHint') },
    { route: '/daybook', icon: 'book-outline', title: t('dbk_daybook'), hint: t('v2_daybookShort') },
  ];

  const onExportTally = useCallback(async () => {
    if (!business || tallying) return;
    setTallying(true);
    try {
      const res = await exportTallyXml(db, business.id, business.name, talRange.from, talRange.to);
      if (!res) {
        AppAlert.alert(t('tal_noDataTitle'), t('tal_noData'));
      } else {
        AppAlert.alert(t('tal_doneTitle'), t('tal_done'));
      }
    } catch {
      AppAlert.alert(t('tal_failedTitle'), t('tal_failed'));
    } finally {
      setTallying(false);
    }
  }, [business, db, tallying, talRange]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (business) {
        receivablesTotal(db, business.id).then((v) => {
          if (active) setDue(v);
        });
        (async () => {
          const now = new Date();
          const out: { label: string; total: number; tax: number }[] = [];
          for (let k = 5; k >= 0; k--) {
            const first = new Date(now.getFullYear(), now.getMonth() - k, 1);
            const last = new Date(now.getFullYear(), now.getMonth() - k + 1, 0);
            const sum = await salesSummary(db, business.id, toIsoDate(first), toIsoDate(last));
            out.push({
              label: first.toLocaleDateString('en-IN', { month: 'short' }),
              total: sum.totalPaise,
              tax: sum.taxPaise,
            });
          }
          if (active) setMonths(out);
        })().catch(() => undefined);
      }
      return () => {
        active = false;
      };
    }, [db, business]),
  );

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('r_reports')} />
      <DateRangePicker
        visible={talSheet}
        onClose={() => setTalSheet(false)}
        value={talRange}
        allowClear={false}
        onApply={(r) => {
          if (r) setTalRange(r);
          setTalSheet(false);
        }}
      />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* This month at a glance + last 6 months */}
          <View style={styles.card}>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t('v2_sales')}</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                  {formatPaise(months[5]?.total ?? 0)}
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>GST</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                  {formatPaise(months[5]?.tax ?? 0)}
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t('r_receivables')}</Text>
                {due === null ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.loading} />
                ) : (
                  <Text style={[styles.statValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPaise(due)}
                  </Text>
                )}
              </View>
            </View>
            {months.length === 6 ? (
              <View style={styles.chart} accessibilityLabel={t('v2_last6Months')}>
                {months.map((m, i) => {
                  const max = Math.max(...months.map((x) => x.total), 1);
                  const h = Math.max(4, Math.round((m.total / max) * 84));
                  return (
                    <View key={`${m.label}-${i}`} style={styles.barCol}>
                      <View style={[styles.bar, { height: h }, i === 5 ? styles.barNow : null]} />
                      <Text style={styles.barLabel}>{m.label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Reports */}
          <View style={styles.tiles}>
            {menu.map((m) => (
              <Pressable
                key={m.route}
                onPress={() => router.push(m.route)}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              >
                <View style={styles.tileIcon}>
                  <Ionicons name={m.icon} size={17} color={colors.primary} />
                </View>
                <Text style={styles.tileTitle} numberOfLines={1}>
                  {m.title}
                </Text>
                <Text style={styles.tileHint} numberOfLines={2}>
                  {m.hint}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Exports */}
          <View style={styles.group}>
            <Overline>{t('v2_forCa')}</Overline>

            <View style={styles.card}>
              <Text style={styles.exTitle}>{t('gj_exportTitle')}</Text>
              <Text style={styles.exHint} numberOfLines={2}>
                {t('gj_exportHint')}
              </Text>
              <View style={styles.monthRow}>
                <Pressable style={styles.monthBtn} onPress={() => setFp((p) => shiftFp(p, -1))} hitSlop={8}>
                  <Ionicons name="chevron-back" size={18} color={colors.text} />
                </Pressable>
                <Text style={styles.monthLabel}>{fpLabel(fp)}</Text>
                <Pressable style={styles.monthBtn} onPress={() => setFp((p) => shiftFp(p, 1))} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={18} color={colors.text} />
                </Pressable>
              </View>
              <Button label={t('gj_export')} variant="outline" icon="cloud-download-outline" onPress={onExportGstr1Json} loading={exportingJson} />
            </View>

            <View style={styles.card}>
              <Text style={styles.exTitle}>{t('g1_exportTitle')}</Text>
              <Text style={styles.exHint} numberOfLines={2}>
                {t('g1_exportHint')}
              </Text>
              <Button label={t('g1_export')} variant="outline" icon="document-text-outline" onPress={onExportGstr1} loading={exporting} />
            </View>

            <View style={styles.card}>
              <Text style={styles.exTitle}>{t('tal_title')}</Text>
              <Text style={styles.exHint} numberOfLines={2}>
                {t('tal_hint')}
              </Text>
              <View style={styles.tallyRow}>
                <DateRangeButton range={talRange} onPress={() => setTalSheet(true)} />
              </View>
              <Button label={t('tal_export')} variant="outline" icon="swap-horizontal" onPress={onExportTally} loading={tallying} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 32 },
  pressed: { opacity: 0.75 },
  group: { gap: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 10,
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, gap: 2 },
  statLabel: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  statValue: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text, ...tabular },
  loading: { alignSelf: 'flex-start', marginTop: 4 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    height: 116,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
    marginTop: 4,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  bar: { width: '100%', maxWidth: 28, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: colors.primaryLight },
  barNow: { backgroundColor: colors.primary },
  barLabel: { fontSize: 11, color: colors.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    gap: 4,
  },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileTitle: { fontSize: text.md, fontWeight: '500', color: colors.text },
  tileHint: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  exTitle: { fontSize: text.md, fontWeight: '500', color: colors.text },
  exHint: { fontSize: text.xs, lineHeight: 16, color: colors.muted, marginTop: -6 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: text.md, fontWeight: '500', color: colors.text, minWidth: 96, textAlign: 'center', ...tabular },
  tallyRow: { alignItems: 'flex-start' },
});
