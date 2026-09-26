import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../src/components/EmptyState';
import { FormHeader } from '../../src/components/FormHeader';
import { Card, Chips, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatPaise } from '../../src/lib/money';
import {
  formatRange,
  reportRange,
  RangePreset,
  topItems,
  TopItem,
  topParties,
  TopParty,
} from '../../src/lib/reports';
import { colors, radius, text } from '../../src/theme';

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function RankRow({
  rank,
  name,
  meta,
  amount,
}: {
  rank: number;
  name: string;
  meta?: string;
  amount: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rank, rank <= 3 && styles.rankTop]}>
        <Text style={[styles.rankText, rank <= 3 && styles.rankTopText]}>{rank}</Text>
      </View>
      <View style={styles.grow}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <Text style={styles.amount}>{amount}</Text>
    </View>
  );
}

export default function TopReportScreen() {
  const db = useSQLiteContext();
  const { t } = useApp();
  const business = useBusiness();
  const [preset, setPreset] = useState<RangePreset>('month');
  const [items, setItems] = useState<TopItem[] | null>(null);
  const [parties, setParties] = useState<TopParty[] | null>(null);

  const ranges: { value: RangePreset; label: string }[] = [
    { value: 'today', label: t('r_today') },
    { value: 'week', label: t('r_week') },
    { value: 'month', label: t('r_month') },
    { value: 'lastMonth', label: t('r_lastMonth') },
  ];

  const load = useCallback(async () => {
    if (!business) return;
    const { from, to } = reportRange(preset);
    const [it, pa] = await Promise.all([
      topItems(db, business.id, from, to),
      topParties(db, business.id, from, to),
    ]);
    setItems(it);
    setParties(pa);
  }, [db, business, preset]);

  useFocusEffect(
    useCallback(() => {
      setItems(null);
      setParties(null);
      load();
    }, [load]),
  );

  const { from, to } = reportRange(preset);
  const loading = items === null || parties === null;

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('r_topLists')} />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View>
            <Chips options={ranges} value={preset} onChange={setPreset} />
            <Text style={styles.range}>{formatRange(from, to)}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <>
              <SectionHeader icon="trophy" title={t('r_topItems')} subtitle={t('r_byValue')} />
              {(items ?? []).length > 0 ? (
                <Card style={styles.listCard}>
                  {items!.map((it, i) => (
                    <View key={`${it.name}-${i}`}>
                      {i > 0 ? <View style={styles.sep} /> : null}
                      <RankRow
                        rank={i + 1}
                        name={it.name}
                        meta={`${formatQty(it.qty)} ${t('r_sold')}`}
                        amount={formatPaise(it.amountPaise)}
                      />
                    </View>
                  ))}
                </Card>
              ) : (
                <Card>
                  <EmptyState icon="trophy" title={t('r_noData')} hint={t('r_noDataHint')} />
                </Card>
              )}

              <SectionHeader icon="people" title={t('r_topParties')} subtitle={t('r_byPurchase')} />
              {(parties ?? []).length > 0 ? (
                <Card style={styles.listCard}>
                  {parties!.map((p, i) => (
                    <View key={`${p.name}-${i}`}>
                      {i > 0 ? <View style={styles.sep} /> : null}
                      <RankRow rank={i + 1} name={p.name} amount={formatPaise(p.amountPaise)} />
                    </View>
                  ))}
                </Card>
              ) : (
                <Card>
                  <EmptyState icon="people" title={t('r_noData')} hint={t('r_noDataHint')} />
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
  grow: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  range: { fontSize: 13, color: colors.muted, marginTop: 8 },
  loader: { marginTop: 40 },
  listCard: { paddingVertical: 6, paddingHorizontal: 14 },
  sep: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rank: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankTop: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  rankText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  rankTopText: { color: colors.warning },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: text.md, fontWeight: '700', color: colors.text },
});
