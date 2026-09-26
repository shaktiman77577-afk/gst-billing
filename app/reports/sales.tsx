import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BillRow } from '../../src/components/BillRow';
import { EmptyState } from '../../src/components/EmptyState';
import { FormHeader } from '../../src/components/FormHeader';
import { Card, Chips, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { InvoiceListRow } from '../../src/db/invoices';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatPaise } from '../../src/lib/money';
import { billsInRange, formatRange, reportRange, RangePreset, salesSummary, SalesSummary } from '../../src/lib/reports';
import { colors, text } from '../../src/theme';

export default function SalesReportScreen() {
  const db = useSQLiteContext();
  const { t } = useApp();
  const business = useBusiness();
  const [preset, setPreset] = useState<RangePreset>('month');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [bills, setBills] = useState<InvoiceListRow[] | null>(null);

  const ranges: { value: RangePreset; label: string }[] = [
    { value: 'today', label: t('r_today') },
    { value: 'week', label: t('r_week') },
    { value: 'month', label: t('r_month') },
    { value: 'lastMonth', label: t('r_lastMonth') },
  ];

  const load = useCallback(async () => {
    if (!business) return;
    const { from, to } = reportRange(preset);
    const [s, b] = await Promise.all([
      salesSummary(db, business.id, from, to),
      billsInRange(db, business.id, from, to),
    ]);
    setSummary(s);
    setBills(b);
  }, [db, business, preset]);

  useFocusEffect(
    useCallback(() => {
      setSummary(null);
      setBills(null);
      load();
    }, [load]),
  );

  const { from, to } = reportRange(preset);
  const loading = summary === null || bills === null;

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('r_salesReport')} />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View>
            <Chips options={ranges} value={preset} onChange={setPreset} />
            <Text style={styles.range}>{formatRange(from, to)}</Text>
          </View>

          {loading || !summary ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <>
              <Card>
                <View style={styles.stats}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>{t('r_totalSales')}</Text>
                    <Text style={styles.statValue}>{formatPaise(summary.totalPaise)}</Text>
                  </View>
                  <View style={styles.statSep} />
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>{t('r_taxCollected')}</Text>
                    <Text style={styles.statValue}>{formatPaise(summary.taxPaise)}</Text>
                  </View>
                  <View style={styles.statSep} />
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>{t('r_bills')}</Text>
                    <Text style={styles.statValue}>{summary.count}</Text>
                  </View>
                </View>
              </Card>

              <SectionHeader icon="document-text" title={t('r_bills')} subtitle={formatRange(from, to)} />
              {bills && bills.length > 0 ? (
                <Card style={styles.listCard}>
                  {bills.map((b, i) => (
                    <View key={b.id}>
                      {i > 0 ? <View style={styles.sep} /> : null}
                      <BillRow bill={b} flat />
                    </View>
                  ))}
                </Card>
              ) : (
                <Card>
                  <EmptyState icon="document-text" title={t('r_noData')} hint={t('r_noDataHint')} />
                </Card>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  range: { fontSize: 13, color: colors.muted, marginTop: 8 },
  loader: { marginTop: 40 },
  stats: { flexDirection: 'row', alignItems: 'stretch' },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  statSep: { width: 1, backgroundColor: colors.border },
  statLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  statValue: { fontSize: text.lg, fontWeight: '800', color: colors.text, textAlign: 'center' },
  listCard: { paddingVertical: 6, paddingHorizontal: 14 },
  sep: { height: 1, backgroundColor: colors.border },
});
