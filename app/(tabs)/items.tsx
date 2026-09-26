import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { formatQty, isLowStock, Item, listItems } from '../../src/db/items';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, shadow } from '../../src/theme';

type Filter = 'all' | 'low';

export default function ItemsScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const params = useLocalSearchParams<{ filter?: string }>();

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      listItems(db, businessId).then((rows) => {
        setItems(rows);
        setLoaded(true);
      });
      if (params.filter === 'low') setFilter('low');
    }, [db, businessId, params.filter]),
  );

  const lowCount = useMemo(() => items.filter(isLowStock).length, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (filter === 'all' || isLowStock(i)) &&
        (!q || i.name.toLowerCase().includes(q) || (i.hsn ?? '').includes(q)),
    );
  }, [items, query, filter]);

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <Header title={t('tabItems')}>
        <SearchBar value={query} onChange={setQuery} placeholder={t('searchItems')} />
      </Header>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={styles.top}>
              <Chips
                options={[
                  { value: 'all', label: `${t('all')} (${items.length})` },
                  { value: 'low', label: `${t('lowStock')} (${lowCount})`, icon: 'warning-outline' },
                ]}
                value={filter}
                onChange={setFilter}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loaded ? (
            items.length === 0 ? (
              <EmptyState icon="cube-outline" title={t('itemsEmpty')} hint={t('itemsEmptyHint')} />
            ) : (
              <EmptyState icon="search-outline" title={t('noItemsFound')} hint="" />
            )
          ) : null
        }
        renderItem={({ item }) => <ItemRow item={item} />}
      />

      <Fab label={t('addItem')} onPress={() => router.push('/item/new')} />
    </View>
  );
}

function ItemRow({ item }: { item: Item }) {
  const { t } = useApp();
  const low = isLowStock(item);
  const isService = item.item_type === 'service';
  return (
    <Pressable
      onPress={() => router.push(`/item/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.icon, isService && { backgroundColor: colors.accentSoft }]}>
        <Ionicons
          name={isService ? 'construct-outline' : 'cube-outline'}
          size={20}
          color={isService ? '#B45309' : colors.primary}
        />
      </View>
      <View style={styles.flexOnly}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {formatPaise(item.sales_price_paise)} {item.sales_price_with_tax ? t('inclGst') : t('plusGst')}
          {' · '}GST {item.gst_rate}%{item.hsn ? ` · ${item.hsn}` : ''}
        </Text>
      </View>
      {isService ? null : (
        <View style={styles.stockBox}>
          <Text style={[styles.stock, low && { color: colors.danger }]}>
            {formatQty(item.stock_qty)} {item.unit}
          </Text>
          <Text style={[styles.stockLabel, low && { color: colors.danger }]}>
            {low ? t('lowStock') : t('stock')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  list: { padding: 16, paddingBottom: 100, gap: 10 },
  top: { marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    ...shadow,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  stockBox: { alignItems: 'flex-end' },
  stock: { fontSize: 14, fontWeight: '800', color: colors.text },
  stockLabel: { fontSize: 11, color: colors.faint, marginTop: 1 },
});
