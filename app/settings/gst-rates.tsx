import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { FormHeader } from '../../src/components/FormHeader';
import { SearchBar } from '../../src/components/SearchBar';
import { Chips, Hint } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { GST_RATES, GST_SLABS, GstRateEntry, searchGstRates } from '../../src/lib/gstRates';
import { colors, radius, spacing, text } from '../../src/theme';

type SlabFilter = 'all' | '0' | '5' | '12' | '18' | '28';
type KindFilter = 'all' | 'goods' | 'service';

// Pill colours per GST slab.
const SLAB_STYLE: Record<string, { bg: string; fg: string }> = {
  '0': { bg: colors.successSoft, fg: colors.success },
  '5': { bg: colors.primarySoft, fg: colors.primary },
  '12': { bg: colors.warningSoft, fg: colors.warning },
  '18': { bg: colors.accentSoft, fg: colors.warning },
  '28': { bg: colors.dangerSoft, fg: colors.danger },
};

export default function GstRatesScreen() {
  const { t, language } = useApp();

  const [query, setQuery] = useState('');
  const [slab, setSlab] = useState<SlabFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const slabOptions = useMemo(
    () => [
      { value: 'all' as SlabFilter, label: t('gr_slabAll') },
      ...GST_SLABS.map((s) => ({ value: String(s) as SlabFilter, label: `${s}%` })),
    ],
    [language],
  );
  const kindOptions = useMemo(
    () => [
      { value: 'all' as KindFilter, label: t('gr_kindAll') },
      { value: 'goods' as KindFilter, label: t('gr_goods') },
      { value: 'service' as KindFilter, label: t('gr_services') },
    ],
    [language],
  );

  const results = useMemo(() => {
    const base = query.trim() ? searchGstRates(query) : GST_RATES;
    return base.filter(
      (e) =>
        (slab === 'all' || e.rate === Number(slab)) && (kind === 'all' || e.kind === kind),
    );
  }, [query, slab, kind]);

  const renderRow = ({ item }: { item: GstRateEntry }) => {
    const key = `${item.hsn}|${item.desc}`;
    const open = expanded === key;
    const pill = SLAB_STYLE[String(item.rate)];
    return (
      <Pressable
        onPress={() => setExpanded(open ? null : key)}
        style={[styles.row, open && styles.rowOpen]}
      >
        <View style={styles.hsnBadge}>
          <Text style={styles.hsnText} numberOfLines={1}>
            {item.hsn}
          </Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.desc} numberOfLines={open ? undefined : 2}>
            {item.desc}
          </Text>
          <Text style={styles.meta}>
            {item.kind === 'goods' ? t('gr_goods') : t('gr_services')}
          </Text>
          {open ? (
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>{t('gr_hsnLabel')}</Text>
              {/* selectable: long-press copies the code natively (no extra dep). */}
              <Text selectable style={styles.detailHsn}>
                {item.hsn}
              </Text>
              <Text style={styles.copyHint}>{t('gr_tapHint')}</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.pillText, { color: pill.fg }]}>{item.rate}%</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.flex}>
      <FormHeader title={t('gr_title')} />
      <View style={styles.body}>
        <SearchBar value={query} onChange={setQuery} placeholder={t('gr_searchPlaceholder')} />
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t('gr_slabLabel')}</Text>
          <Chips options={slabOptions} value={slab} onChange={setSlab} />
        </View>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t('gr_typeLabel')}</Text>
          <Chips options={kindOptions} value={kind} onChange={setKind} />
        </View>
        <Text style={styles.count}>
          {results.length} {t('gr_resultsFound')}
        </Text>
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.hsn}|${item.desc}`}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={40}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="search-outline" title={t('gr_noResults')} hint="" />
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <Hint>{t('gr_disclaimer')}</Hint>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  filterRow: { marginTop: spacing.sm },
  filterLabel: {
    fontSize: text.xs,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  count: {
    fontSize: text.sm,
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  list: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowOpen: { borderColor: colors.primary },
  hsnBadge: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 64,
    alignItems: 'center',
  },
  hsnText: { fontSize: text.sm, fontWeight: '700', color: colors.primary },
  rowMain: { flex: 1 },
  desc: { fontSize: text.md, color: colors.text, fontWeight: '500' },
  meta: { fontSize: text.xs, color: colors.faint, marginTop: 2 },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pillText: { fontSize: text.sm, fontWeight: '700' },
  detail: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  detailLabel: { fontSize: text.xs, color: colors.muted, marginBottom: 2 },
  detailHsn: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: 1 },
  copyHint: { fontSize: text.xs, color: colors.faint, marginTop: spacing.xs },
  footer: { marginTop: spacing.md },
});
