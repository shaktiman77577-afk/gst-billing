import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { FormHeader } from '../../src/components/FormHeader';
import { SearchBar } from '../../src/components/SearchBar';
import { ListRow } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { listProformas } from '../../src/db/proformas';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, shadowSm, text } from '../../src/theme';

type Row = Awaited<ReturnType<typeof listProformas>>[number];

export default function ProformaListScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      listProformas(db, businessId).then((r) => {
        setRows(r);
        setLoaded(true);
      });
    }, [db, businessId]),
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.party_name.toLowerCase().includes(q) || r.invoice_no.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('pf_proformas')} />
      <View style={styles.searchWrap}>
        <SearchBar value={query} onChange={setQuery} placeholder={t('pf_proformas')} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loaded ? (
            <EmptyState icon="document-text-outline" title={t('pf_noProformas')} hint={t('pf_noProformasHint')} />
          ) : null
        }
        renderItem={({ item, index }) => (
          <ProformaRow row={item} convertedLabel={t('pf_convertedTo')} first={index === 0} last={index === visible.length - 1} />
        )}
      />
      <Fab label={t('pf_newProforma')} onPress={() => router.push('/proforma/new')} />
    </View>
  );
}

function ProformaRow({
  row,
  convertedLabel,
  first,
  last,
}: {
  row: Row;
  convertedLabel: string;
  first: boolean;
  last: boolean;
}) {
  const cancelled = !!row.cancelled_at;
  const converted = !!row.ref_invoice_id;
  return (
    <ListRow first={first} last={last} onPress={() => router.push(`/proforma/${row.id}`)}>
      <View style={styles.flexOnly}>
        <Text style={styles.party} numberOfLines={1}>
          {row.party_name}
        </Text>
        <Text style={styles.sub}>
          {row.invoice_no} · {formatDate(row.invoice_date)}
        </Text>
        {converted && !cancelled ? (
          <Text style={styles.converted}>
            {convertedLabel} {row.ref_invoice_no}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, cancelled && styles.strike]}>{formatPaise(row.total_paise)}</Text>
        {cancelled ? (
          <Text style={styles.cancelledTag}>{row.status}</Text>
        ) : converted ? (
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        ) : null}
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  list: { padding: 16, paddingBottom: 96 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadowSm,
  },
  party: { fontSize: text.md, fontWeight: '500', color: colors.text },
  sub: { fontSize: text.xs, color: colors.muted, marginTop: 2 },
  converted: { fontSize: text.xs, color: colors.success, fontWeight: '700', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: text.md, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  strike: { textDecorationLine: 'line-through', color: colors.faint },
  cancelledTag: { fontSize: text.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
});
