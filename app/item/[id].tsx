import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, Chips, Field, Hairline, Label, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import {
  createItem,
  deleteItem,
  getItem,
  GST_RATES,
  ItemType,
  UNITS,
  updateItem,
} from '../../src/db/items';
import { formatPaise, paiseToInput, toPaise } from '../../src/lib/money';
import { colors, radius, text } from '../../src/theme';

type Errors = Partial<Record<'name' | 'price' | 'purchase' | 'rate' | 'stock' | 'low', string>>;

const QTY_PATTERN = /^-?\d+(\.\d{1,3})?$/;

function parseQty(text: string): number | null {
  const s = text.trim();
  if (!s) return 0;
  return QTY_PATTERN.test(s) ? Number(s) : null;
}

export default function ItemFormScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<ItemType>('product');
  const [unit, setUnit] = useState('PCS');
  const [price, setPrice] = useState('');
  const [withTax, setWithTax] = useState<'with' | 'without'>('with');
  const [purchase, setPurchase] = useState('');
  const [rateChoice, setRateChoice] = useState<string>('18');
  const [customRate, setCustomRate] = useState('');
  const [hsn, setHsn] = useState('');
  const [openingStock, setOpeningStock] = useState('');
  const [lowStock, setLowStock] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    getItem(db, id).then((it) => {
      if (!it) return;
      setName(it.name);
      setItemType(it.item_type);
      setUnit(it.unit);
      setPrice(paiseToInput(it.sales_price_paise));
      setWithTax(it.sales_price_with_tax ? 'with' : 'without');
      setPurchase(paiseToInput(it.purchase_price_paise));
      if (GST_RATES.includes(it.gst_rate)) setRateChoice(String(it.gst_rate));
      else {
        setRateChoice('other');
        setCustomRate(String(it.gst_rate));
      }
      setHsn(it.hsn ?? '');
      setOpeningStock(it.opening_stock ? String(it.opening_stock) : '');
      setLowStock(it.low_stock_qty !== null ? String(it.low_stock_qty) : '');
    });
  }, [db, id, isNew]);

  const gstRate = rateChoice === 'other' ? Number(customRate) : Number(rateChoice);
  const isService = itemType === 'service';

  // Live breakdown: base price + GST amount.
  const breakdown = useMemo(() => {
    const p = toPaise(price);
    if (!p || !Number.isFinite(gstRate) || gstRate < 0) return null;
    const base = withTax === 'with' ? Math.round((p * 100) / (100 + gstRate)) : p;
    const tax = withTax === 'with' ? p - base : Math.round((p * gstRate) / 100);
    return { base, tax, total: base + tax };
  }, [price, gstRate, withTax]);

  const onSave = async () => {
    const e: Errors = {};
    if (!name.trim()) e.name = t('errItemName');
    const pricePaise = price.trim() ? toPaise(price) : 0;
    if (pricePaise === null) e.price = t('errPrice');
    const purchasePaise = purchase.trim() ? toPaise(purchase) : null;
    if (purchase.trim() && purchasePaise === null) e.purchase = t('errPrice');
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100 || (rateChoice === 'other' && !customRate.trim())) {
      e.rate = t('errGstRate');
    }
    const opening = parseQty(openingStock);
    if (!isService && opening === null) e.stock = t('errQty');
    const low = lowStock.trim() ? parseQty(lowStock) : null;
    if (!isService && lowStock.trim() && low === null) e.low = t('errQty');
    setErrors(e);
    if (Object.keys(e).length > 0 || !businessId) return;

    const input = {
      name: name.trim(),
      itemType,
      unit,
      salesPricePaise: pricePaise ?? 0,
      salesPriceWithTax: withTax === 'with',
      purchasePricePaise: purchasePaise,
      gstRate,
      hsn: hsn.trim() || null,
      openingStock: isService ? 0 : (opening ?? 0),
      lowStockQty: isService ? null : low,
    };

    setSaving(true);
    try {
      if (isNew) await createItem(db, businessId, input);
      else await updateItem(db, id, input);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert(t('delete'), t('deleteItemConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteItem(db, id);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader
        title={isNew ? t('newItem') : t('editItem')}
        right={
          isNew ? null : (
            <Pressable onPress={onDelete} hitSlop={10} style={styles.trash}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
          )
        }
      />
      <Screen
        edges={['bottom']}
        footer={<Button label={t('save')} icon="checkmark-circle" onPress={onSave} loading={saving} />}
      >
        <Card>
          <SectionHeader icon="cube" title={t('sectionBasic')} />
          <Field
            label={t('itemName')}
            placeholder={t('itemNamePlaceholder')}
            value={name}
            onChangeText={setName}
            icon="pricetag-outline"
            error={errors.name}
          />
          <Label>{t('itemType')}</Label>
          <Chips
            options={[
              { value: 'product', label: t('product'), icon: 'cube-outline' },
              { value: 'service', label: t('service'), icon: 'construct-outline' },
            ]}
            value={itemType}
            onChange={(v) => {
              setItemType(v);
              if (v === 'service' && unit === 'PCS') setUnit('NOS');
            }}
          />
          <Label>{t('unit')}</Label>
          <Chips options={UNITS.map((u) => ({ value: u, label: u }))} value={unit} onChange={setUnit} />
        </Card>

        <Card>
          <SectionHeader icon="pricetags" title={t('sectionPricing')} />
          <Field
            label={t('salesPrice')}
            placeholder="0"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            icon="cash-outline"
            error={errors.price}
          />
          <Chips
            options={[
              { value: 'with', label: t('withTax') },
              { value: 'without', label: t('withoutTax') },
            ]}
            value={withTax}
            onChange={setWithTax}
          />

          <Label>{t('gstRate')}</Label>
          <Chips
            options={[
              ...GST_RATES.map((r) => ({ value: String(r), label: `${r}%` })),
              { value: 'other', label: t('otherRate') },
            ]}
            value={rateChoice}
            onChange={setRateChoice}
          />
          {rateChoice === 'other' ? (
            <Field
              label={t('gstRate')}
              placeholder={t('customRatePlaceholder')}
              value={customRate}
              onChangeText={setCustomRate}
              keyboardType="decimal-pad"
              error={errors.rate}
            />
          ) : errors.rate ? (
            <Text style={styles.error}>{errors.rate}</Text>
          ) : null}

          {breakdown ? (
            <View style={styles.breakdown}>
              <Row label={t('withoutTax')} value={formatPaise(breakdown.base)} />
              <Row label={`GST ${gstRate}%`} value={formatPaise(breakdown.tax)} />
              <Hairline />
              <Row label={t('withTax')} value={formatPaise(breakdown.total)} bold />
            </View>
          ) : null}

          <Field
            label={t('purchasePrice')}
            optionalLabel={t('optional')}
            placeholder="0"
            value={purchase}
            onChangeText={setPurchase}
            keyboardType="decimal-pad"
            icon="cart-outline"
            error={errors.purchase}
          />
          <Field
            label={isService ? t('sac') : t('hsn')}
            optionalLabel={t('optional')}
            placeholder={isService ? '998719' : '8415'}
            value={hsn}
            onChangeText={(v) => setHsn(v.replace(/\D/g, '').slice(0, 8))}
            keyboardType="number-pad"
            icon="barcode-outline"
          />
        </Card>

        {isService ? null : (
          <Card>
            <SectionHeader icon="layers" title={t('sectionStock')} />
            <Field
              label={`${t('openingStock')} (${unit})`}
              optionalLabel={t('optional')}
              placeholder="0"
              value={openingStock}
              onChangeText={setOpeningStock}
              keyboardType="numbers-and-punctuation"
              icon="file-tray-stacked-outline"
              error={errors.stock}
            />
            <Text style={styles.hint}>{t('openingStockHint')}</Text>
            <Field
              label={`${t('lowStockAlert')} (${unit})`}
              optionalLabel={t('optional')}
              placeholder="5"
              value={lowStock}
              onChangeText={setLowStock}
              keyboardType="decimal-pad"
              icon="warning-outline"
              error={errors.low}
            />
            <Text style={styles.hint}>{t('lowStockHint')}</Text>
          </Card>
        )}
      </Screen>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.breakRow}>
      <Text style={[styles.breakLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.breakValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  trash: { padding: 4 },
  hint: { fontSize: text.xs, color: colors.muted, marginTop: -6 },
  error: { color: colors.danger, fontSize: text.sm },
  breakdown: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 12,
    gap: 6,
  },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakLabel: { fontSize: text.sm, color: colors.muted },
  breakValue: { fontSize: text.sm, color: colors.text },
  bold: { fontWeight: '800', color: colors.primary },
});
