import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { formatQty, GST_RATES } from '../db/items';
import { LineDraft } from '../db/invoices';
import { LineResult } from '../lib/gst';
import { formatPaise, paiseToInput, toPaise } from '../lib/money';
import { colors, radius } from '../theme';
import { Chips } from './ui';

type Props = {
  line: LineDraft;
  result: LineResult;
  applyGst: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
};

const QTY = /^\d*\.?\d{0,3}$/;

export function BillLineCard({ line, result, applyGst, onChange, onRemove }: Props) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [qtyText, setQtyText] = useState(formatQty(line.qty));
  const [rateText, setRateText] = useState(paiseToInput(line.ratePaise));
  const [discText, setDiscText] = useState(
    line.discountValue ? (line.discountType === 'amt' ? paiseToInput(line.discountValue) : String(line.discountValue)) : '',
  );

  // Qty can also change from the item picker; keep the box in sync.
  useEffect(() => {
    setQtyText((txt) => (Number(txt) === line.qty ? txt : formatQty(line.qty)));
  }, [line.qty]);

  // Keep the qty box in sync when +/- buttons are used.
  const setQty = (q: number) => {
    const next = Math.max(0, Math.round(q * 1000) / 1000);
    setQtyText(formatQty(next));
    onChange({ qty: next });
  };

  const onDiscount = (text: string, type = line.discountType) => {
    setDiscText(text);
    if (type === 'pct') {
      const n = Number(text);
      onChange({ discountType: 'pct', discountValue: Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0 });
    } else {
      onChange({ discountType: 'amt', discountValue: toPaise(text) ?? 0 });
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {line.name}
          </Text>
          <Text style={styles.sub}>
            {formatPaise(line.ratePaise)} × {formatQty(line.qty)} {line.unit}
            {applyGst ? ` · GST ${line.gstRate}%` : ''}
            {result.discountPaise > 0 ? ` · −${formatPaise(result.discountPaise)}` : ''}
          </Text>
        </View>
        <Text style={styles.amount}>{formatPaise(result.amountPaise)}</Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.stepper}>
          <Pressable onPress={() => setQty(line.qty - 1)} hitSlop={6} style={styles.stepBtn}>
            <Ionicons name="remove" size={18} color={colors.primary} />
          </Pressable>
          <TextInput
            value={qtyText}
            onChangeText={(v) => {
              if (!QTY.test(v)) return;
              setQtyText(v);
              onChange({ qty: Number(v) || 0 });
            }}
            keyboardType="decimal-pad"
            style={styles.qtyInput}
            selectTextOnFocus
          />
          <Pressable onPress={() => setQty(line.qty + 1)} hitSlop={6} style={styles.stepBtn}>
            <Ionicons name="add" size={18} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.flex} />
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6} style={styles.linkBtn}>
          <Ionicons name={open ? 'chevron-up' : 'create-outline'} size={16} color={colors.primary} />
          <Text style={styles.link}>{t('edit')}</Text>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={6} style={styles.linkBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </Pressable>
      </View>

      {open ? (
        <View style={styles.editor}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>{t('rate')} (₹)</Text>
              <TextInput
                value={rateText}
                onChangeText={(v) => {
                  setRateText(v);
                  const p = toPaise(v);
                  if (p !== null || !v) onChange({ ratePaise: p ?? 0 });
                }}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>
                {t('discount')} ({line.discountType === 'pct' ? '%' : '₹'})
              </Text>
              <View style={styles.discRow}>
                <TextInput
                  value={discText}
                  onChangeText={(v) => onDiscount(v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.faint}
                  style={[styles.input, styles.flex]}
                />
                <Pressable
                  onPress={() => onDiscount(discText, line.discountType === 'pct' ? 'amt' : 'pct')}
                  style={styles.unitToggle}
                >
                  <Text style={styles.unitText}>{line.discountType === 'pct' ? '%' : '₹'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
          {applyGst ? (
            <>
              <Chips
                options={[
                  { value: 'with', label: t('withTax') },
                  { value: 'without', label: t('withoutTax') },
                ]}
                value={line.rateWithTax ? 'with' : 'without'}
                onChange={(v) => onChange({ rateWithTax: v === 'with' })}
              />
              <Text style={styles.label}>{t('gstRate')}</Text>
              <Chips
                options={[...new Set([...GST_RATES, line.gstRate])]
                  .sort((a, b) => a - b)
                  .map((r) => ({ value: String(r), label: `${r}%` }))}
                value={String(line.gstRate)}
                onChange={(v) => onChange({ gstRate: Number(v) })}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    gap: 10,
    backgroundColor: colors.card,
  },
  flex: { flex: 1 },
  top: { flexDirection: 'row', gap: 10 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  qtyInput: {
    minWidth: 44,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 15,
    color: colors.primary,
    paddingVertical: 2,
  },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  editor: { gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  row: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.text,
  },
  discRow: { flexDirection: 'row', gap: 6 },
  unitToggle: {
    width: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitText: { fontWeight: '800', color: colors.primary, fontSize: 15 },
});
