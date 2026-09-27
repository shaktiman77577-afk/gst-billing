import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { formatQty, isLowStock, Item, roundQty } from '../db/items';
import { formatPaise } from '../lib/money';
import { colors, radius, text } from '../theme';
import { QTY_PATTERN } from './BillLineCard';
import { SearchBar } from './SearchBar';
import { Button } from './ui';

type Props = {
  visible: boolean;
  items: Item[];
  counts: Record<string, number>; // itemId → qty already in the bill
  onClose: () => void;
  onAdd: (item: Item) => void;
  onRemoveOne: (item: Item) => void;
  onSetQty: (item: Item, qty: number) => void; // exact qty typed by the user (0 removes the line)
  onAddNew: () => void;
};

// Stepper with an editable qty box: tap +/- for whole steps, or type an
// exact decimal (e.g. 1.24 KG) directly.
function PickerQtyStepper({
  item,
  value,
  onAdd,
  onRemoveOne,
  onSetQty,
}: {
  item: Item;
  value: number;
  onAdd: () => void;
  onRemoveOne: () => void;
  onSetQty: (qty: number) => void;
}) {
  const [qtyText, setQtyText] = useState(formatQty(value));

  // Qty can change from the bill screen behind the modal; keep the box in sync.
  useEffect(() => {
    setQtyText((txt) => (Number(txt) === value ? txt : formatQty(value)));
  }, [value]);

  return (
    <View style={styles.stepper}>
      <Pressable onPress={onRemoveOne} hitSlop={8} style={styles.stepBtn}>
        <Ionicons name="remove" size={18} color={colors.primary} />
      </Pressable>
      <TextInput
        value={qtyText}
        onChangeText={(v) => {
          if (!QTY_PATTERN.test(v)) return;
          setQtyText(v);
          onSetQty(Math.max(0, roundQty(Number(v) || 0)));
        }}
        keyboardType="decimal-pad"
        style={styles.countInput}
        selectTextOnFocus
      />
      <Pressable onPress={onAdd} hitSlop={8} style={styles.stepBtn}>
        <Ionicons name="add" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

// Tap an item to add it; tap again to add one more.
export function ItemPicker({ visible, items, counts, onClose, onAdd, onRemoveOne, onSetQty, onAddNew }: Props) {
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
                  <PickerQtyStepper
                    item={item}
                    value={n}
                    onAdd={() => onAdd(item)}
                    onRemoveOne={() => onRemoveOne(item)}
                    onSetQty={(q) => onSetQty(item, q)}
                  />
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
  title: { fontSize: text.xl, fontWeight: '700', color: colors.text },
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
  newText: { fontSize: text.md, fontWeight: '700', color: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rowActive: { borderColor: colors.primary },
  name: { fontSize: text.md, fontWeight: '600', color: colors.text },
  sub: { fontSize: text.sm, color: colors.muted, marginTop: 2 },
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
  countInput: {
    minWidth: 48,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: text.md,
    color: colors.primary,
    paddingVertical: 2,
  },
  footer: { padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
});
