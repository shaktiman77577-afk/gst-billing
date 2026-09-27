import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Header } from '../../src/components/Header';
import { SearchBar } from '../../src/components/SearchBar';
import { StatusBadge } from '../../src/components/StatusBadge';
import { useApp } from '../../src/context/AppContext';
import { InvoiceListRow } from '../../src/db/invoices';
import { listChallans } from '../../src/db/challans';
import type { StringKey } from '../../src/i18n/strings';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, shadowSm, text } from '../../src/theme';

function ChallanRow({ challan, tr }: { challan: InvoiceListRow; tr: (k: StringKey) => string }) {
  const cancelled = challan.status === 'cancelled';
  const converted = !!challan.ref_invoice_no;
  return (
    <Pressable
      onPress={() => router.push(`/challans/${challan.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.flex}>
        <Text style={styles.party} numberOfLines={1}>
          {challan.party_name}
        </Text>
        <Text style={styles.sub}>
          {challan.invoice_no} · {formatDate(challan.invoice_date)}
        </Text>
        {converted ? (
          <View style={styles.convertedPill}>
            <Ionicons name="checkmark-circle" size={12} color={colors.success} />
            <Text style={styles.convertedText}>
              {tr('ch_convertedTo')} {challan.ref_invoice_no}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, cancelled && styles.strike]}>{formatPaise(challan.total_paise)}</Text>
        <StatusBadge status={challan.status} kind={challan.kind} />
      </View>
    </Pressable>
  );
}

export default function ChallansScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const [challans, setChallans] = useState<InvoiceListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      listChallans(db, businessId).then((rows) => {
        setChallans(rows);
        setLoaded(true);
      });
    }, [db, businessId]),
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q
      ? challans
      : challans.filter(
          (c) => c.party_name.toLowerCase().includes(q) || c.invoice_no.toLowerCase().includes(q),
        );
  }, [challans, query]);

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <Header title={t('ch_title')}>
        <SearchBar value={query} onChange={setQuery} placeholder={t('ch_search')} />
      </Header>
      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loaded ? (
            challans.length === 0 ? (
              <EmptyState icon="car-outline" title={t('ch_noChallansYet')} hint={t('ch_noChallansHint')} />
            ) : (
              <EmptyState icon="search-outline" title={t('ch_noChallansYet')} hint="" />
            )
          ) : null
        }
        renderItem={({ item }) => <ChallanRow challan={item} tr={t} />}
      />
      <Fab label={t('ch_newChallan')} onPress={() => router.push('/challans/new')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10, paddingBottom: 96 },
  card: {
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
  party: { fontSize: text.md, fontWeight: '700', color: colors.text },
  sub: { fontSize: text.sm, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: text.md, fontWeight: '800', color: colors.text },
  strike: { color: colors.faint, textDecorationLine: 'line-through' },
  convertedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  convertedText: { fontSize: text.xs, fontWeight: '700', color: colors.success },
});
