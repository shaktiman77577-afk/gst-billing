import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Header } from '../../src/components/Header';
import { SearchBar } from '../../src/components/SearchBar';
import { Chips } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { listParties, PartyWithBalance } from '../../src/db/parties';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, shadow, shadowSm, text } from '../../src/theme';

type Filter = 'all' | 'customer' | 'supplier';

export default function PartiesScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const [parties, setParties] = useState<PartyWithBalance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      listParties(db, businessId).then((rows) => {
        setParties(rows);
        setLoaded(true);
      });
    }, [db, businessId]),
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parties.filter(
      (p) =>
        (filter === 'all' || p.party_type === filter) &&
        (!q || p.name.toLowerCase().includes(q) || (p.phone ?? '').includes(q)),
    );
  }, [parties, query, filter]);

  const totals = useMemo(() => {
    let collect = 0;
    let pay = 0;
    for (const p of parties) {
      if (p.balance_paise > 0) collect += p.balance_paise;
      else pay -= p.balance_paise;
    }
    return { collect, pay };
  }, [parties]);

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <Header title={t('tabParties')}>
        <SearchBar value={query} onChange={setQuery} placeholder={t('searchParties')} />
      </Header>

      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.top}>
            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={styles.totalLabel}>{t('toCollect')}</Text>
                <Text style={[styles.totalValue, { color: colors.success }]}>{formatPaise(totals.collect)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.total}>
                <Text style={styles.totalLabel}>{t('toPay')}</Text>
                <Text style={[styles.totalValue, { color: colors.danger }]}>{formatPaise(totals.pay)}</Text>
              </View>
            </View>
            <Chips
              options={[
                { value: 'all', label: t('all') },
                { value: 'customer', label: t('customers') },
                { value: 'supplier', label: t('suppliers') },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </View>
        }
        ListEmptyComponent={
          loaded ? (
            parties.length === 0 ? (
              <EmptyState icon="people-outline" title={t('partiesEmpty')} hint={t('partiesEmptyHint')} />
            ) : (
              <EmptyState icon="search-outline" title={t('noPartiesFound')} hint="" />
            )
          ) : null
        }
        renderItem={({ item }) => <PartyRow party={item} />}
      />

      <Fab label={t('addParty')} onPress={() => router.push('/party/new')} />
    </View>
  );
}

function PartyRow({ party }: { party: PartyWithBalance }) {
  const { t } = useApp();
  const bal = party.balance_paise;
  const initial = party.name.trim().charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/party/ledger', params: { id: party.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.avatar, party.party_type === 'supplier' && { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.avatarText, party.party_type === 'supplier' && { color: colors.warning }]}>{initial}</Text>
      </View>
      <View style={styles.flexOnly}>
        <Text style={styles.name} numberOfLines={1}>
          {party.name}
        </Text>
        <View style={styles.subRow}>
          <Ionicons
            name={party.party_type === 'supplier' ? 'cube-outline' : 'person-outline'}
            size={12}
            color={colors.faint}
          />
          <Text style={styles.sub} numberOfLines={1}>
            {party.party_type === 'supplier' ? t('supplier') : t('customer')}
            {party.phone ? ` · ${party.phone}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.balance}>
        {bal === 0 ? (
          <Text style={styles.settled}>{t('settled')}</Text>
        ) : (
          <>
            <Text style={[styles.amount, { color: bal > 0 ? colors.success : colors.danger }]}>
              {formatPaise(Math.abs(bal))}
            </Text>
            <Text style={styles.balLabel}>{bal > 0 ? t('toCollect') : t('toPay')}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  list: { padding: 16, paddingBottom: 100, gap: 10 },
  top: { gap: 12, marginBottom: 4 },
  totals: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 14,
    ...shadow,
  },
  total: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: 1, backgroundColor: colors.border },
  totalLabel: { fontSize: text.xs, color: colors.muted, fontWeight: '600' },
  totalValue: { fontSize: text.lg, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    ...shadowSm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '800', color: colors.primary },
  name: { fontSize: text.md, fontWeight: '700', color: colors.text },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sub: { fontSize: text.xs, color: colors.muted, flex: 1 },
  balance: { alignItems: 'flex-end' },
  amount: { fontSize: text.md, fontWeight: '800' },
  balLabel: { fontSize: text.xs, color: colors.muted, marginTop: 1 },
  settled: { fontSize: text.xs, color: colors.muted, fontWeight: '600' },
});
