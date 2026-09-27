import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../src/components/EmptyState';
import { DateRangeButton } from '../../src/components/DateRangeButton';
import { DateRangePicker } from '../../src/components/DateRangePicker';
import { FormHeader } from '../../src/components/FormHeader';
import { Card } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatPaise } from '../../src/lib/money';
import { gstSummary, GstRateRow } from '../../src/lib/reports';
import { DateRange, makeRange } from '../../src/lib/dateRange';
import { colors, radius, text } from '../../src/theme';

function Cell({ children, bold, right, header }: { children: string; bold?: boolean; right?: boolean; header?: boolean }) {
  return (
    <Text
      style={[
        styles.cell,
        right && styles.right,
        header && styles.headerCell,
        bold && styles.bold,
      ]}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

export default function GstReportScreen() {
  const db = useSQLiteContext();
  const { t } = useApp();
  const business = useBusiness();
  const [range, setRange] = useState<DateRange>(() => makeRange('thisMonth'));
  const [sheet, setSheet] = useState(false);
  const [rows, setRows] = useState<GstRateRow[] | null>(null);

  const load = useCallback(async () => {
    if (!business) return;
    setRows(await gstSummary(db, business.id, range.from, range.to));
  }, [db, business, range]);

  useFocusEffect(
    useCallback(() => {
      setRows(null);
      load();
    }, [load]),
  );

  const totals = (rows ?? []).reduce(
    (a, r) => ({
      taxable: a.taxable + r.taxablePaise,
      cgst: a.cgst + r.cgstPaise,
      sgst: a.sgst + r.sgstPaise,
      igst: a.igst + r.igstPaise,
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
  );
  const grandTotal = totals.taxable + totals.cgst + totals.sgst + totals.igst;

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('r_gstSummary')} />
      <DateRangePicker
        visible={sheet}
        onClose={() => setSheet(false)}
        value={range}
        allowClear={false}
        onApply={(r) => {
          if (r) setRange(r);
          setSheet(false);
        }}
      />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <DateRangeButton range={range} onPress={() => setSheet(true)} />

          {rows === null ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState icon="receipt" title={t('r_noData')} hint={t('r_noDataHint')} />
            </Card>
          ) : (
            <Card style={styles.tableCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.table}>
                  <View style={[styles.tr, styles.trHead]}>
                    <Cell header>{t('r_rate')}</Cell>
                    <Cell header right>{t('r_taxable')}</Cell>
                    <Cell header right>CGST</Cell>
                    <Cell header right>SGST</Cell>
                    <Cell header right>IGST</Cell>
                    <Cell header right>{t('r_total')}</Cell>
                  </View>
                  {rows.map((r) => (
                    <View key={r.rate} style={styles.tr}>
                      <Cell bold>{r.rate}%</Cell>
                      <Cell right>{formatPaise(r.taxablePaise)}</Cell>
                      <Cell right>{formatPaise(r.cgstPaise)}</Cell>
                      <Cell right>{formatPaise(r.sgstPaise)}</Cell>
                      <Cell right>{formatPaise(r.igstPaise)}</Cell>
                      <Cell right bold>
                        {formatPaise(r.taxablePaise + r.cgstPaise + r.sgstPaise + r.igstPaise)}
                      </Cell>
                    </View>
                  ))}
                  <View style={[styles.tr, styles.trTotal]}>
                    <Cell bold>{t('r_total')}</Cell>
                    <Cell right bold>{formatPaise(totals.taxable)}</Cell>
                    <Cell right bold>{formatPaise(totals.cgst)}</Cell>
                    <Cell right bold>{formatPaise(totals.sgst)}</Cell>
                    <Cell right bold>{formatPaise(totals.igst)}</Cell>
                    <Cell right bold>{formatPaise(grandTotal)}</Cell>
                  </View>
                </View>
              </ScrollView>
              <Text style={styles.note}>{t('r_gstNote')}</Text>
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const COL = 108;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  loader: { marginTop: 40 },
  tableCard: { padding: 12 },
  table: { minWidth: COL * 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  trHead: { backgroundColor: colors.primaryTint, borderRadius: radius.sm },
  trTotal: { borderBottomWidth: 0, backgroundColor: colors.primarySoft, borderRadius: radius.sm, marginTop: 4 },
  cell: { width: COL, paddingVertical: 10, paddingHorizontal: 8, fontSize: 13, color: colors.text },
  right: { textAlign: 'right' },
  headerCell: { fontSize: 12, fontWeight: '500', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  bold: { fontWeight: '700' },
  note: { fontSize: 12, color: colors.faint, marginTop: 10, paddingHorizontal: 4 },
});
