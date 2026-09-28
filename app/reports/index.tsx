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
import { Button, Card, Hairline, IconChip, MenuRow } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatPaise } from '../../src/lib/money';
import { receivablesTotal } from '../../src/lib/reports';
import { exportGstr1Csv } from '../../src/lib/gstr1';
import { exportGstr1Json, fpForDate, fpLabel, shiftFp } from '../../src/lib/gstr1json';
import { exportTallyXml } from '../../src/lib/tally';
import { DateRange, makeRange } from '../../src/lib/dateRange';
import { colors } from '../../src/theme';

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const { t, language } = useApp();
  const business = useBusiness();
  const [due, setDue] = useState<number | null>(null);
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

  const menu = [
    { route: '/reports/sales' as const, icon: 'trending-up' as const, title: t('r_salesReport'), hint: t('r_salesReportHint') },
    { route: '/reports/gst' as const, icon: 'receipt' as const, title: t('r_gstSummary'), hint: t('r_gstSummaryHint') },
    { route: '/reports/top' as const, icon: 'trophy' as const, title: t('r_topLists'), hint: t('r_topListsHint') },
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
          <Card>
            <View style={styles.dueRow}>
              <IconChip icon="wallet" bg={colors.warningSoft} fg={colors.warning} />
              <View style={styles.grow}>
                <Text style={styles.dueLabel}>{t('r_receivables')}</Text>
                {due === null ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.dueLoading} />
                ) : (
                  <Text style={styles.dueAmount}>{formatPaise(due)}</Text>
                )}
              </View>
            </View>
          </Card>

          <Card>
            <Text style={styles.rowText}>{t('g1_exportTitle')}</Text>
            <Text style={styles.meta}>{t('g1_exportHint')}</Text>
            <Button label={t('g1_export')} icon="document-text" onPress={onExportGstr1} loading={exporting} />
          </Card>

          <Card>
            <Text style={styles.rowText}>{t('gj_exportTitle')}</Text>
            <Text style={styles.meta}>{t('gj_exportHint')}</Text>
            <View style={styles.monthRow}>
              <Pressable
                style={styles.monthBtn}
                onPress={() => setFp((p) => shiftFp(p, -1))}
                hitSlop={8}
              >
                <IconChip icon="chevron-back" />
              </Pressable>
              <Text style={styles.monthLabel}>{fpLabel(fp)}</Text>
              <Pressable
                style={styles.monthBtn}
                onPress={() => setFp((p) => shiftFp(p, 1))}
                hitSlop={8}
              >
                <IconChip icon="chevron-forward" />
              </Pressable>
            </View>
            <Button label={t('gj_export')} icon="cloud-upload" onPress={onExportGstr1Json} loading={exportingJson} />
          </Card>

          <Card>
            <Text style={styles.rowText}>{t('tal_title')}</Text>
            <Text style={styles.meta}>{t('tal_hint')}</Text>
            <View style={styles.tallyRow}>
              <DateRangeButton range={talRange} onPress={() => setTalSheet(true)} />
            </View>
            <Button label={t('tal_export')} icon="swap-horizontal" onPress={onExportTally} loading={tallying} />
          </Card>

          <Card list>
            {menu.map((m, i) => (
              <View key={m.route}>
                {i > 0 ? <Hairline /> : null}
                <MenuRow
                  icon={m.icon}
                  title={m.title}
                  subtitle={m.hint}
                  onPress={() => router.push(m.route)}
                />
              </View>
            ))}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  grow: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dueLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  dueAmount: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  dueLoading: { alignSelf: 'flex-start', marginTop: 8 },
  rowText: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  monthBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5, // 34px chip + 10 padding = 44px touch target (plus hitSlop)
  },
  monthLabel: { fontSize: 15, fontWeight: '700', color: colors.text, minWidth: 96, textAlign: 'center' },
  tallyRow: { alignItems: 'flex-start', marginVertical: 8 },
});
