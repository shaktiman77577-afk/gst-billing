// Purchase return (Worker B). Goods sent back to a supplier: saved with
// kind='purchase_return', a PR/fy/seq return number, and stock going OUT
// (reverse of a purchase). The original purchase is optional: pick one from
// the picker to prefill lines and supplier, or build the return manually.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { BillLineCard } from '../../src/components/BillLineCard';
import { DateField } from '../../src/components/DateField';
import { EmptyState } from '../../src/components/EmptyState';
import { FormHeader } from '../../src/components/FormHeader';
import { ItemPicker } from '../../src/components/ItemPicker';
import { PartyPicker } from '../../src/components/PartyPicker';
import { Button, Card, ErrorText, Field, Hairline, Hint, IconChip, MenuRow, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import type { LineDraft } from '../../src/db/invoices';
import { Item, listItems, roundQty } from '../../src/db/items';
import { listParties, PartyWithBalance } from '../../src/db/parties';
import {
  createPurchaseReturn,
  getPurchase,
  linkablePurchases,
  PurchaseLineDraft,
} from '../../src/db/purchases';
import { formatDate, todayIso } from '../../src/lib/dates';
import type { LineResult } from '../../src/lib/gst';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, text } from '../../src/theme';

type Line = LineDraft & { key: string };
type SupplierChoice = PartyWithBalance | null | undefined; // null = cash, undefined = not chosen

let keySeq = 0;
const nextKey = () => `pr${++keySeq}`;

type PurchasePick = {
  id: string;
  party_name: string;
  purchase_date: string;
  supplier_bill_no: string | null;
  total_paise: number;
};

function lineAmount(l: Line): number {
  return Math.round(l.qty * l.ratePaise);
}

function toResult(amount: number): LineResult {
  return { grossPaise: amount, discountPaise: 0, taxablePaise: amount, taxPaise: 0, amountPaise: amount };
}

export default function PurchaseReturnScreen() {
  const db = useSQLiteContext();
  const { t, language, businessId } = useApp();
  const { purchaseId } = useLocalSearchParams<{ purchaseId?: string }>();

  const [parties, setParties] = useState<PartyWithBalance[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [supplier, setSupplier] = useState<SupplierChoice>(undefined);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState(todayIso());
  const [billNo, setBillNo] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picks, setPicks] = useState<PurchasePick[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      listParties(db, businessId).then(setParties);
      listItems(db, businessId).then(setItems);
    }, [db, businessId]),
  );

  const loadPurchase = useCallback(
    async (id: string) => {
      const data = await getPurchase(db, id);
      if (!data || data.purchase.kind !== 'purchase') return;
      const { purchase: p, lines: ls } = data;
      setLinkedId(p.id);
      setSupplier(parties.find((x) => x.id === p.party_id) ?? null);
      setLines(
        ls.map((l) => ({
          key: nextKey(),
          itemId: l.item_id,
          itemType: l.item_type,
          name: l.name,
          hsn: null,
          unit: l.unit,
          qty: l.qty,
          ratePaise: l.rate_paise,
          rateWithTax: false,
          discountType: 'pct' as const,
          discountValue: 0,
          gstRate: 0,
        })),
      );
      setError(null);
      setPicking(false);
    },
    [db, parties],
  );

  useEffect(() => {
    if (!purchaseId || loadedRef.current) return;
    loadedRef.current = true;
    loadPurchase(purchaseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId]);

  useEffect(() => {
    if (businessId) linkablePurchases(db, businessId).then(setPicks);
  }, [db, businessId]);

  const totalPaise = useMemo(() => lines.reduce((s, l) => s + lineAmount(l), 0), [lines]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lines) if (l.itemId) c[l.itemId] = (c[l.itemId] ?? 0) + l.qty;
    return c;
  }, [lines]);

  const addItem = (item: Item) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.itemId === item.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...ls,
        {
          key: nextKey(),
          itemId: item.id,
          itemType: item.item_type,
          name: item.name,
          hsn: item.hsn,
          unit: item.unit,
          qty: 1,
          ratePaise: item.purchase_price_paise ?? item.sales_price_paise,
          rateWithTax: false,
          discountType: 'pct' as const,
          discountValue: 0,
          gstRate: 0,
        },
      ];
    });
    setError(null);
  };

  const removeOne = (item: Item) => {
    setLines((ls) =>
      ls
        .map((l) => (l.itemId === item.id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.itemId !== item.id || l.qty > 0),
    );
  };

  // Exact qty typed in the item picker (decimals allowed, e.g. 1.24 KG); 0 removes the line.
  const setItemQty = (item: Item, qty: number) => {
    const q = Math.max(0, roundQty(qty));
    setLines((ls) => {
      const i = ls.findIndex((l) => l.itemId === item.id);
      if (i < 0) return ls;
      if (q <= 0) return ls.filter((_, j) => j !== i);
      return ls.map((l, j) => (j === i ? { ...l, qty: q } : l));
    });
  };

  const onSave = async () => {
    if (supplier === undefined) return setError(t('pur_errNoSupplier'));
    const valid = lines.filter((l) => l.qty > 0 && l.ratePaise >= 0);
    if (valid.length === 0) return setError(t('errNothingReturnedPR'));
    if (!businessId) return;
    setError(null);
    setSaving(true);
    try {
      await createPurchaseReturn(db, {
        businessId,
        purchaseDate: returnDate,
        partyId: supplier?.id ?? null,
        partyName: supplier?.name ?? t('pur_cashPurchase'),
        supplierBillNo: billNo.trim() || null,
        note: note.trim() || null,
        lines: valid.map(
          (l): PurchaseLineDraft => ({
            itemId: l.itemId,
            itemType: l.itemType,
            name: l.name,
            unit: l.unit,
            qty: l.qty,
            ratePaise: l.ratePaise,
          }),
        ),
      });
      router.back();
    } catch (e) {
      setError(`${t('somethingWrong')} (${String((e as Error)?.message ?? e)})`);
    } finally {
      setSaving(false);
    }
  };

  const openNew = (path: '/party/new' | '/item/new') => {
    setSupplierOpen(false);
    setItemsOpen(false);
    router.push(path);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('newPurchaseReturn')} />
      <Screen
        edges={['bottom']}
        footer={
          <View style={styles.footerRow}>
            <View style={styles.flexOnly}>
              <Text style={styles.footerLabel}>{t('purchaseReturn')}</Text>
              <Text style={styles.footerTotal}>{formatPaise(totalPaise)}</Text>
            </View>
            <View style={{ flex: 1.4 }}>
              <Button label={t('savePurchaseReturn')} icon="checkmark-circle" onPress={onSave} loading={saving} />
            </View>
          </View>
        }
      >
        {picking ? (
          <Card>
            <SectionHeader icon="bag-handle" title={t('linkPurchase')} />
            {picks.length === 0 ? (
              <EmptyState icon="bag-handle-outline" title={t('noPurchasesToLink')} hint="" />
            ) : (
              <View>
                {picks.map((p, i) => (
                  <Fragment key={p.id}>
                    {i > 0 ? <Hairline /> : null}
                    <MenuRow
                      icon="bag-handle-outline"
                      title={p.party_name}
                      subtitle={`${formatDate(p.purchase_date)}${p.supplier_bill_no ? ` · ${p.supplier_bill_no}` : ''} · ${formatPaise(p.total_paise)}`}
                      onPress={() => loadPurchase(p.id)}
                    />
                  </Fragment>
                ))}
              </View>
            )}
            <Button variant="outline" label={t('cancel')} onPress={() => setPicking(false)} />
          </Card>
        ) : (
          <>
            {/* Link original purchase */}
            <Card>
              {linkedId ? (
                <Pressable onPress={() => setPicking(true)} hitSlop={8}>
                  <Text style={styles.muted}>
                    {t('againstPurchase')} · <Text style={styles.link}>{t('changePurchase')}</Text>
                  </Text>
                </Pressable>
              ) : (
                <>
                  <Text style={styles.party}>{t('linkPurchase')}</Text>
                  <Hint>{t('linkPurchaseHint')}</Hint>
                  <Button
                    variant="outline"
                    icon="bag-handle-outline"
                    label={t('linkPurchase')}
                    onPress={() => setPicking(true)}
                  />
                </>
              )}
              <Hint>{t('purchaseReturnHint')}</Hint>
              <DateField label={t('pur_date')} value={returnDate} onChange={(d) => d && setReturnDate(d)} />
              <Field
                label={t('pur_supplierBillNo')}
                optionalLabel={t('optional')}
                placeholder={t('pur_supplierBillNoPlaceholder')}
                value={billNo}
                onChangeText={setBillNo}
              />
            </Card>

            {/* Supplier */}
            <Card>
              <SectionHeader icon="business" title={t('pur_supplier')} />
              <Pressable style={styles.partyBox} onPress={() => setSupplierOpen(true)}>
                {supplier === undefined ? (
                  <>
                    <Ionicons name="person-add-outline" size={20} color={colors.primary} />
                    <Text style={[styles.partyName, { color: colors.primary }]}>{t('pur_selectSupplier')}</Text>
                  </>
                ) : (
                  <>
                    <IconChip icon={supplier ? 'person' : 'cash-outline'} />
                    <View style={styles.flexOnly}>
                      <Text style={styles.partyName}>{supplier ? supplier.name : t('pur_cashPurchase')}</Text>
                      {supplier?.phone ? <Text style={styles.partySub}>{supplier.phone}</Text> : null}
                    </View>
                  </>
                )}
                <Ionicons name="chevron-down" size={18} color={colors.faint} />
              </Pressable>
            </Card>

            {/* Items */}
            <Card>
              <SectionHeader icon="cube" title={`${t('returnItems')}${lines.length ? ` (${lines.length})` : ''}`} />
              {lines.map((l) => (
                <BillLineCard
                  key={l.key}
                  line={l}
                  result={toResult(lineAmount(l))}
                  applyGst={false}
                  onChange={(patch) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))}
                  onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                />
              ))}
              <Button variant="outline" icon="add" label={t('addItems')} onPress={() => setItemsOpen(true)} />
            </Card>

            {/* Note */}
            <Card>
              <Field
                label={t('notes')}
                optionalLabel={t('optional')}
                placeholder={t('notesPlaceholder')}
                value={note}
                onChangeText={setNote}
                multiline
                style={{ minHeight: 60, textAlignVertical: 'top' }}
              />
            </Card>

            <ErrorText>{error}</ErrorText>
          </>
        )}
      </Screen>

      <PartyPicker
        visible={supplierOpen}
        parties={parties}
        onClose={() => setSupplierOpen(false)}
        onPick={(p) => {
          setSupplier(p);
          setSupplierOpen(false);
          setError(null);
        }}
        onAddNew={() => openNew('/party/new')}
        nullLabel={t('pur_cashPurchase')}
        nullHint={t('pur_cashPurchaseHint')}
      />
      <ItemPicker
        visible={itemsOpen}
        items={items}
        counts={counts}
        onClose={() => setItemsOpen(false)}
        onAdd={addItem}
        onRemoveOne={removeOne}
        onSetQty={setItemQty}
        onAddNew={() => openNew('/item/new')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  muted: { fontSize: text.sm, color: colors.muted },
  party: { fontSize: text.md, fontWeight: '700', color: colors.text, marginTop: -6 },
  link: { fontSize: text.sm, fontWeight: '700', color: colors.primary },
  partyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: colors.background,
  },
  partyName: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  partySub: { fontSize: 13, color: colors.muted, marginTop: 1 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLabel: { fontSize: text.xs, color: colors.muted },
  footerTotal: { fontSize: text.xl, fontWeight: '800', color: colors.primary },
});
