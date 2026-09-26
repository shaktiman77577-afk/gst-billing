import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { formatQty, isLowStock, Item } from '../db/items';
import { formatPaise } from '../lib/money';
import { colors, radius } from '../theme';
import { SearchBar } from './SearchBar';
import { Button } from './ui';

type Props = {
  visible: boolean;
  items: Item[];
  counts: Record<string, number>; // itemId → qty already in the bill
  onClose: () => void;
  onAdd: (item: Item) => void;
  onRemoveOne: (item: Item) => void;
  onAddNew: () => void;
};

// Tap an item to add it; tap again to add one more.
export function ItemPicker({ visible, items, counts, onClose, onAdd, onRemoveOne, onAddNew }: Props) {
  const { t } = useApp();
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.hsn ?? '').includes(q)) : items;
  }, [items, query]);
  const totalCount = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('addItems')}</Text>
        </View>
        <View style={styles.searchWrap}>
          <SearchBar value={query} onChange={setQuery} placeholder={t('searchItems')} />
        </View>
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Pressable style={styles.newRow} onPress={onAddNew}>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={styles.newText}>{t('newItemShort')}</Text>
            </Pressable>
          }
          renderItem={({ item }) => {
            const n = counts[item.id] ?? 0;
            const low = isLowStock(item);
            return (
              <Pressable style={[styles.row, n > 0 && styles.rowActive]} onPress={() => onAdd(item)}>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.sub}>
                    {formatPaise(item.sales_price_paise)} · GST {item.gst_rate}%
                    {item.item_type === 'product' ? (
                      <Text style={low ? { color: colors.danger } : undefined}>
                        {' · '}
                        {t('stock')} {formatQty(item.stock_qty)} {item.unit}
                      </Text>
                    ) : null}
                  </Text>
                </View>
                {n > 0 ? (
                  <View style={styles.stepper}>
                    <Pressable onPress={() => onRemoveOne(item)} hitSlop={8} style={styles.stepBtn}>
                      <Ionicons name="remove" size={18} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.count}>{formatQty(n)}</Text>
                    <Pressable onPress={() => onAdd(item)} hitSlop={8} style={styles.stepBtn}>
                      <Ionicons name="add" size={18} color={colors.primary} />
                    </Pressable>
                  </View>
                ) : (
                  <Ionicons name="add-circle" size={28} color={colors.primary} />
                )}
              </Pressable>
            );
          }}
        />
        <View style={styles.footer}>
          <Button
            label={totalCount > 0 ? `${t('done')} (${formatQty(totalCount)})` : t('done')}
            icon="checkmark"
            onPress={onClose}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.card },
  title: { fontSize: 19, fontWeight: '700', color: colors.text },
  searchWrap: { padding: 12, backgroundColor: colors.primarySoft },
  list: { padding: 12, gap: 8, paddingBottom: 24 },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.card,
    marginBottom: 6,
  },
  newText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rowActive: { borderColor: colors.primary },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    padding: 3,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { minWidth: 24, textAlign: 'center', fontWeight: '800', color: colors.primary },
  footer: { padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
});
