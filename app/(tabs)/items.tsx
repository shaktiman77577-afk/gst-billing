import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { Text } from '../../src/components/Text';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Header } from '../../src/components/Header';
import { SearchBar } from '../../src/components/SearchBar';
import { Chips, Overline } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { formatQty, isLowStock, Item, listItems } from '../../src/db/items';
import { useBusiness } from '../../src/hooks/useBusiness';
import { todayIso } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { catalogHtml } from '../../src/pdf/catalog';
import { sharePdfOnWhatsApp } from '../../src/pdf/share';
import { colors, radius, spacing, tabular, text } from '../../src/theme';

type Filter = 'all' | 'low' | 'service';

export default function ItemsScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);
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
  const serviceCount = useMemo(() => items.filter((i) => i.item_type === 'service').length, [items]);

  // Stock value: goods in hand × purchase price (sale price when no purchase
  // price is saved). Services and negative stock count as 0.
  const stockValue = useMemo(
    () =>
      items.reduce((sum, i) => {
        if (i.item_type === 'service' || i.stock_qty <= 0) return sum;
        const rate = i.purchase_price_paise ?? i.sales_price_paise;
        return sum + Math.round(i.stock_qty * rate);
      }, 0),
    [items],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (filter === 'all' ||
          (filter === 'low' && isLowStock(i)) ||
          (filter === 'service' && i.item_type === 'service')) &&
        (!q || i.name.toLowerCase().includes(q) || (i.hsn ?? '').includes(q)),
    );
  }, [items, query, filter]);

  // Price list → WhatsApp PDF. Reuses the already-loaded, active items
  // (listItems filters out deleted rows and orders by name). Only items
  // with a sale rate > 0 go in the catalog.
  const onShareCatalog = async () => {
    if (!business || !businessId || sharing) return;
    setSharing(true);
    try {
      const priced = items.filter((i) => i.sales_price_paise > 0);
      if (priced.length === 0) {
        AppAlert.alert(t('appName'), t('cat_empty'));
        return;
      }
      const html = catalogHtml(business, priced, t);
      const stamp = todayIso(); // YYYY-MM-DD → file "Price-List-<date>.pdf"
      const caption = t('cat_caption').replace('{business}', business.name);
      // Same one-tap path as the bill share: PDF attaches to WhatsApp;
      // no phone → WhatsApp's own share picker; not installed → system sheet.
      await sharePdfOnWhatsApp(html, `Price-List-${stamp}`, null, caption);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) AppAlert.alert(t('appName'), t('pdfError'));
    } finally {
      setSharing(false);
    }
  };

  const showShare = loaded && items.some((i) => i.sales_price_paise > 0);

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <Header
        title={t('tabItems')}
        right={
          showShare ? (
            <Pressable
              onPress={onShareCatalog}
              disabled={sharing}
              accessibilityLabel={t('cat_shareCatalog')}
              style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.8 }, sharing && { opacity: 0.6 }]}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={colors.success} />
              ) : (
                <Ionicons name="logo-whatsapp" size={16} color="#1DA851" />
              )}
              <Text style={styles.shareText}>{t('v2_priceList')}</Text>
            </Pressable>
          ) : undefined
        }
      >
        <SearchBar value={query} onChange={setQuery} placeholder={t('searchItems')} />
        {items.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <Chips
              options={[
                { value: 'all', label: `${t('all')} (${items.length})` },
                { value: 'low', label: `${t('lowStock')} (${lowCount})` },
                ...(serviceCount > 0 ? [{ value: 'service' as Filter, label: `${t('v2_services')} (${serviceCount})` }] : []),
              ]}
              value={filter}
              onChange={setFilter}
            />
          </ScrollView>
        ) : null}
      </Header>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={styles.top}>
              <View style={styles.summary}>
                <View style={styles.sumCol}>
                  <Text style={styles.sumLabel}>{t('v2_stockValue')}</Text>
                  <Text style={styles.sumValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPaise(stockValue)}
                  </Text>
                </View>
                <View style={styles.sumDivider} />
                <Pressable style={styles.sumCol} onPress={() => setFilter('low')}>
                  <Text style={styles.sumLabel}>{t('lowStock')}</Text>
                  <Text style={[styles.sumValue, lowCount > 0 && { color: colors.warning }]}>
                    {lowCount} {t('v2_itemsWord')}
                  </Text>
                </Pressable>
              </View>
              {visible.length > 0 ? <Overline>{`${visible.length} ${t('v2_itemsWord')}`}</Overline> : null}
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
        renderItem={({ item, index }) => (
          <ItemRow item={item} first={index === 0} last={index === visible.length - 1} />
        )}
      />

      <Fab label={t('addItem')} onPress={() => router.push('/item/new')} />
    </View>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

function ItemRow({ item, first, last }: { item: Item; first: boolean; last: boolean }) {
  const { t } = useApp();
  const low = isLowStock(item);
  const isService = item.item_type === 'service';
  const meta = [
    item.hsn ? `${isService ? 'SAC' : 'HSN'} ${item.hsn}` : null,
    `GST ${item.gst_rate}%`,
    isService ? t('v2_service') : item.unit,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => router.push(`/item/${item.id}`)}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last ? styles.rowLast : styles.rowDivider,
        pressed && { backgroundColor: colors.primaryTint },
      ]}
    >
      <View style={[styles.avatar, isService && { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.avatarText, isService && { color: colors.warning }]}>{initialsOf(item.name)}</Text>
      </View>
      <View style={styles.flexOnly}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>{formatPaise(item.sales_price_paise)}</Text>
        {isService ? (
          <Text style={styles.stockText}>{item.sales_price_with_tax ? t('inclGst') : t('plusGst')}</Text>
        ) : low ? (
          <View style={styles.lowTag}>
            <Text style={styles.lowText}>
              {t('v2_low')} · {formatQty(item.stock_qty)} {item.unit}
            </Text>
          </View>
        ) : (
          <Text style={styles.stockText}>
            {t('stock')} {formatQty(item.stock_qty)} {item.unit}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1, minWidth: 0 },
  list: { padding: spacing.lg, paddingBottom: 100 },
  chipsRow: { paddingRight: spacing.lg },
  top: { gap: spacing.md, marginBottom: spacing.sm },
  shareBtn: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  shareText: { fontSize: text.sm, fontWeight: '500', color: colors.textSecondary },
  summary: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sumCol: { flex: 1, gap: 2 },
  sumLabel: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  sumValue: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text, ...tabular },
  sumDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
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
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: text.sm, fontWeight: '700', color: colors.textSecondary },
  name: { fontSize: text.md, lineHeight: 20, fontWeight: '500', color: colors.text },
  sub: { fontSize: text.xs, lineHeight: 16, color: colors.muted, marginTop: 1 },
  right: { alignItems: 'flex-end', gap: 3 },
  price: { fontSize: text.md, fontWeight: '700', color: colors.text, ...tabular },
  stockText: { fontSize: text.xs, color: colors.muted, ...tabular },
  lowTag: { backgroundColor: colors.warningSoft, borderRadius: radius.sm - 2, paddingHorizontal: 7, paddingVertical: 1 },
  lowText: { fontSize: 11, lineHeight: 16, fontWeight: '500', color: colors.warning, ...tabular },
});
