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
import { Overline, Segmented } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { listParties, PartyWithBalance } from '../../src/db/parties';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, spacing, tabular, text } from '../../src/theme';

type Filter = 'all' | 'customer' | 'supplier';

export default function PartiesScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
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
            <Segmented
              options={[
                { value: 'all', label: t('all') },
                { value: 'customer', label: t('customers') },
                { value: 'supplier', label: t('suppliers') },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={styles.totalLabel}>{t('toCollect')}</Text>
                <Text style={[styles.totalValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatPaise(totals.collect)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.total}>
                <Text style={styles.totalLabel}>{t('toPay')}</Text>
                <Text style={[styles.totalValue, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatPaise(totals.pay)}
                </Text>
              </View>
            </View>
            {visible.length > 0 ? <Overline>{`${visible.length} · ${t('tabParties')}`}</Overline> : null}
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
        renderItem={({ item, index }) => (
          <PartyRow party={item} first={index === 0} last={index === visible.length - 1} />
        )}
      />

      <Fab label={t('addParty')} onPress={() => router.push('/party/new')} />
    </View>
  );
}

// Rows sit together in one card: the first row rounds the top corners, the
// last row the bottom ones, and rows in between share hairline dividers.
function PartyRow({ party, first, last }: { party: PartyWithBalance; first: boolean; last: boolean }) {
  const { t } = useApp();
  const bal = party.balance_paise;
  const initials =
    party.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?';
  const isSupplier = party.party_type === 'supplier';
  const sub = [party.gstin || party.phone, isSupplier ? t('supplier') : t('customer')].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/party/ledger', params: { id: party.id } })}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last ? styles.rowLast : styles.rowDivider,
        pressed && { backgroundColor: colors.primaryTint },
      ]}
    >
      <View style={[styles.avatar, isSupplier && { backgroundColor: colors.warningSoft }]}>
        <Text style={[styles.avatarText, isSupplier && { color: colors.warning }]}>{initials}</Text>
      </View>
      <View style={styles.flexOnly}>
        <Text style={styles.name} numberOfLines={1}>
          {party.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
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
  flexOnly: { flex: 1, minWidth: 0 },
  list: { padding: spacing.lg, paddingBottom: 96 },
  top: { gap: spacing.md, marginBottom: spacing.sm },
  totals: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  total: { flex: 1, gap: 2 },
  totalLabel: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  totalValue: { fontSize: 17, lineHeight: 22, fontWeight: '700', ...tabular },
  divider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: text.sm, fontWeight: '700', color: colors.primary },
  name: { fontSize: text.md, lineHeight: 20, fontWeight: '500', color: colors.text },
  sub: { fontSize: text.xs, lineHeight: 16, color: colors.muted, marginTop: 1 },
  balance: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: text.md, fontWeight: '700', ...tabular },
  balLabel: { fontSize: 11, color: colors.muted },
  settled: { fontSize: text.xs, color: colors.muted },
});
