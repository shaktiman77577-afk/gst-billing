import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BillLineCard } from '../../src/components/BillLineCard';
import { DateField } from '../../src/components/DateField';
import { FormHeader } from '../../src/components/FormHeader';
import { ItemPicker } from '../../src/components/ItemPicker';
import { PartyPicker } from '../../src/components/PartyPicker';
import { Button, Card, ErrorText, Field, IconChip, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import type { LineDraft } from '../../src/db/invoices';
import { Item, listItems, roundQty } from '../../src/db/items';
import { listParties, PartyWithBalance } from '../../src/db/parties';
import { getPurchase, savePurchase } from '../../src/db/purchases';
import { todayIso } from '../../src/lib/dates';
import type { LineResult } from '../../src/lib/gst';
import { qtyTimesRatePaise } from '../../src/lib/gst';
import { formatPaise } from '../../src/lib/money';
import { colors, radius } from '../../src/theme';

type Line = LineDraft & { key: string };
type SupplierChoice = PartyWithBalance | null | undefined; // null = cash purchase, undefined = not chosen

let keySeq = 0;
const nextKey = () => `pl${++keySeq}`;

// Purchases are plain qty × rate — no GST maths (they never feed GST reports).
function lineAmount(l: Line): number {
  return qtyTimesRatePaise(l.qty, l.ratePaise);
}

function toResult(amount: number): LineResult {
  return { grossPaise: amount, discountPaise: 0, taxablePaise: amount, taxPaise: 0, amountPaise: amount };
}

export default function PurchaseFormScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ?? null;

  const [parties, setParties] = useState<PartyWithBalance[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [supplier, setSupplier] = useState<SupplierChoice>(undefined);
  const [editSupplierId, setEditSupplierId] = useState<string | null | undefined>(undefined);
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [billNo, setBillNo] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedEdit = useRef(false);

  // Parties and items reload when coming back from "New party / New item".
  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      listParties(db, businessId).then(setParties);
      listItems(db, businessId).then(setItems);
    }, [db, businessId]),
  );

  // Load the purchase when editing.
  useEffect(() => {
    if (!editId || loadedEdit.current) return;
    loadedEdit.current = true;
    (async () => {
      const data = await getPurchase(db, editId);
      if (!data) return;
      const { purchase: p, lines: ls } = data;
      setPurchaseDate(p.purchase_date);
      setBillNo(p.supplier_bill_no ?? '');
      setNote(p.note ?? '');
      setEditSupplierId(p.party_id);
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
    })();
  }, [db, editId]);

  // Editing: pick the saved supplier once the party list is loaded.
  useEffect(() => {
    if (editSupplierId === undefined) return;
    if (editSupplierId === null) setSupplier(null);
    else {
      const p = parties.find((x) => x.id === editSupplierId);
      if (p) setSupplier(p);
    }
  }, [editSupplierId, parties]);

  const totalPaise = useMemo(() => lines.reduce((s, l) => s + lineAmount(l), 0), [lines]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lines) if (l.itemId) c[l.itemId] = (c[l.itemId] ?? 0) + l.qty;
    return c;
  }, [lines]);

  const addItem = (item: Item) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.itemId === item.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: roundQty(l.qty + 1) } : l));
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
        .map((l) => (l.itemId === item.id ? { ...l, qty: Math.max(0, roundQty(l.qty - 1)) } : l))
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

  const pickSupplier = (p: PartyWithBalance | null) => {
    setSupplier(p);
    setSupplierOpen(false);
    setError(null);
  };

  const onSave = async () => {
    if (supplier === undefined) return setError(t('pur_errNoSupplier'));
    const valid = lines.filter((l) => l.qty > 0 && l.ratePaise >= 0);
    if (valid.length === 0) return setError(t('pur_errNoItems'));
    if (!businessId) return;
    setError(null);
    setSaving(true);
    try {
      await savePurchase(db, {
        businessId,
        purchaseId: editId,
        purchaseDate,
        partyId: supplier?.id ?? null,
        partyName: supplier?.name ?? t('pur_cashPurchase'),
        supplierBillNo: billNo.trim() || null,
        note: note.trim() || null,
        lines: valid.map((l) => ({
          itemId: l.itemId,
          itemType: l.itemType,
          name: l.name,
          unit: l.unit,
          qty: l.qty,
          ratePaise: l.ratePaise,
        })),
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
      <FormHeader title={editId ? t('pur_editPurchase') : t('pur_newPurchase')} />
      <Screen
        edges={['bottom']}
        footer={
          <View style={styles.footerRow}>
            <View style={styles.flex}>
              <Text style={styles.footerLabel}>{t('totalAmount')}</Text>
              <Text style={styles.footerTotal}>{formatPaise(totalPaise)}</Text>
            </View>
            <View style={styles.footerBtn}>
              <Button
                label={t('pur_savePurchase')}
                icon="checkmark-circle"
                onPress={onSave}
                loading={saving}
              />
            </View>
          </View>
        }
      >
        {/* Date & supplier bill no */}
        <Card>
          <DateField label={t('pur_date')} value={purchaseDate} onChange={(d) => d && setPurchaseDate(d)} />
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
                <View style={styles.flex}>
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
          <SectionHeader icon="cube" title={`${t('itemsLabel')}${lines.length ? ` (${lines.length})` : ''}`} />
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

        {/* Totals */}
        {lines.length > 0 ? (
          <Card>
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>{t('totalAmount')}</Text>
              <Text style={styles.totalValue}>{formatPaise(totalPaise)}</Text>
            </View>
            <Text style={styles.note}>{t('pur_stockNote')}</Text>
          </Card>
        ) : null}

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
      </Screen>

      <PartyPicker
        visible={supplierOpen}
        parties={parties}
        onClose={() => setSupplierOpen(false)}
        onPick={pickSupplier}
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
  flex: { flex: 1, backgroundColor: 'transparent' },
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
  partyName: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  partySub: { fontSize: 13, color: colors.muted, marginTop: 1 },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: radius.md,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: colors.primary },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  note: { fontSize: 12, color: colors.faint },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLabel: { fontSize: 12, color: colors.muted },
  footerTotal: { fontSize: 20, fontWeight: '800', color: colors.text },
  footerBtn: { flex: 1.4 },
});
