import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { BillLineCard } from '../../src/components/BillLineCard';
import { DateField } from '../../src/components/DateField';
import { FormHeader } from '../../src/components/FormHeader';
import { ItemPicker } from '../../src/components/ItemPicker';
import { PartyPicker } from '../../src/components/PartyPicker';
import { Button, Card, ErrorText, Field, IconChip, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { stateName } from '../../src/data/states';
import { DUPLICATE_INVOICE_NO, getInvoice, LineDraft } from '../../src/db/invoices';
import { nextProformaNo, saveProforma } from '../../src/db/proformas';
import { Item, listItems, roundQty } from '../../src/db/items';
import { listParties, PartyWithBalance } from '../../src/db/parties';
import { useBusiness } from '../../src/hooks/useBusiness';
import { todayIso } from '../../src/lib/dates';
import { amountInWords, calcBill } from '../../src/lib/gst';
import { formatPaise, paiseToInput, toPaise } from '../../src/lib/money';
import { colors, radius, text } from '../../src/theme';

type Line = LineDraft & { key: string };
type PartyChoice = PartyWithBalance | null | undefined; // null = Cash Sale, undefined = not chosen

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

export default function ProformaFormScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const business = useBusiness();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id && id !== 'new' ? id : null;

  const [parties, setParties] = useState<PartyWithBalance[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [party, setParty] = useState<PartyChoice>(undefined);
  const [editPartyId, setEditPartyId] = useState<string | null | undefined>(undefined);
  const [proformaNo, setProformaNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [chargesLabel, setChargesLabel] = useState('');
  const [chargesText, setChargesText] = useState('');
  const [roundOff, setRoundOff] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [poNo, setPoNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [notes, setNotes] = useState('');
  const [partyOpen, setPartyOpen] = useState(false);
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

  // Load the proforma when editing.
  useEffect(() => {
    if (!editId || loadedEdit.current) return;
    loadedEdit.current = true;
    (async () => {
      const data = await getInvoice(db, editId);
      if (!data || data.invoice.doc_type !== 'proforma') return;
      const { invoice: inv, lines: ls } = data;
      setProformaNo(inv.invoice_no);
      setInvoiceDate(inv.invoice_date);
      setDueDate(inv.due_date);
      setEditPartyId(inv.party_id);
      setLines(
        ls.map((l) => ({
          key: nextKey(),
          itemId: l.item_id,
          itemType: l.item_type,
          name: l.name,
          hsn: l.hsn,
          unit: l.unit,
          qty: l.qty,
          ratePaise: l.rate_paise,
          rateWithTax: l.rate_with_tax === 1,
          discountType: l.discount_type,
          discountValue: l.discount_value,
          gstRate: l.gst_rate,
        })),
      );
      setChargesLabel(inv.charges_label ?? '');
      setChargesText(paiseToInput(inv.charges_paise || null));
      setRoundOff(inv.round_off === 1);
      setPoNo(inv.po_no ?? '');
      setVehicleNo(inv.vehicle_no ?? '');
      setNotes(inv.notes ?? '');
      setShowMore(Boolean(inv.po_no || inv.vehicle_no || inv.notes));
    })();
  }, [db, editId]);

  // Editing: pick the saved party once the party list is loaded.
  useEffect(() => {
    if (editPartyId === undefined) return;
    if (editPartyId === null) setParty(null);
    else {
      const p = parties.find((x) => x.id === editPartyId);
      if (p) setParty(p);
    }
  }, [editPartyId, parties]);

  // Proformas follow the business's GST treatment (they usually become tax invoices).
  const applyGst = business?.gst_registered === 1;
  const placeOfSupply = (party && party.state_code) || business?.state_code || '';
  const isIgst = applyGst && !!business && placeOfSupply !== business.state_code;

  // New proforma: preview the next PI number (own series per FY).
  useEffect(() => {
    if (editId || !business || !businessId) return;
    nextProformaNo(db, businessId, invoiceDate).then((n) => setProformaNo(n.proformaNo));
  }, [db, editId, business, businessId, invoiceDate]);

  const chargesPaise = toPaise(chargesText) ?? 0;
  const totals = useMemo(
    () => calcBill(lines, { applyGst, isIgst, chargesPaise, roundOff }),
    [lines, applyGst, isIgst, chargesPaise, roundOff],
  );

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
          ratePaise: item.sales_price_paise,
          rateWithTax: item.sales_price_with_tax === 1,
          discountType: 'pct',
          discountValue: 0,
          gstRate: item.gst_rate,
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

  const pickParty = (p: PartyWithBalance | null) => {
    setParty(p);
    setPartyOpen(false);
    setError(null);
  };

  const onSave = async () => {
    if (party === undefined) return setError(t('errNoParty'));
    const valid = lines.filter((l) => l.qty > 0);
    if (valid.length === 0) return setError(t('errNoItems'));
    if (!business || !businessId) return;
    setError(null);

    const finalTotals = calcBill(valid, { applyGst, isIgst, chargesPaise, roundOff });
    setSaving(true);
    try {
      const draft = {
        docType: 'proforma' as const,
        invoiceDate,
        dueDate,
        partyId: party?.id ?? null,
        partyName: party?.name ?? t('cashSale'),
        partyPhone: party?.phone ?? null,
        partyGstin: party?.gstin ?? null,
        partyStateCode: party?.state_code ?? null,
        billingAddress: party?.billing_address ?? null,
        shippingAddress: party ? (party.same_shipping ? party.billing_address : party.shipping_address) : null,
        placeOfSupply,
        isIgst,
        chargesLabel: chargesLabel.trim() || null,
        roundOff,
        poNo: poNo.trim() || null,
        vehicleNo: vehicleNo.trim() || null,
        notes: notes.trim() || null,
        receivedPaise: 0,
        paymentMode: 'cash' as const,
      };
      const savedId = await saveProforma(db, { businessId, proformaId: editId, draft, lines: valid, totals: finalTotals });
      if (editId) router.back();
      else router.replace(`/proforma/${savedId}`);
    } catch (e) {
      if ((e as Error)?.message === DUPLICATE_INVOICE_NO) setError(t('errDuplicateBillNo'));
      else setError(`${t('somethingWrong')} (${String((e as Error)?.message ?? e)})`);
    } finally {
      setSaving(false);
    }
  };

  const openNew = (path: '/party/new' | '/item/new') => {
    setPartyOpen(false);
    setItemsOpen(false);
    router.push(path);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={editId ? t('pf_editProforma') : t('pf_newProforma')} />
      <Screen
        edges={['bottom']}
        footer={
          <View style={styles.footerRow}>
            <View style={styles.flex}>
              <Text style={styles.footerLabel}>{t('totalAmount')}</Text>
              <Text style={styles.footerTotal}>{formatPaise(totals.totalPaise)}</Text>
            </View>
            <View style={styles.footerBtn}>
              <Button label={t('pf_saveProforma')} icon="checkmark-circle" onPress={onSave} loading={saving} />
            </View>
          </View>
        }
      >
        <Card>
          <Text style={styles.note}>{t('pf_proformaHint')}</Text>
        </Card>

        {/* Number & dates */}
        <Card>
          <Field
            label={t('billNo')}
            value={proformaNo}
            editable={false}
            autoCapitalize="characters"
            autoCorrect={false}
            icon="document-text-outline"
          />
          <View style={styles.row}>
            <DateField label={t('billDate')} value={invoiceDate} onChange={(d) => d && setInvoiceDate(d)} />
            <DateField label={t('dueDate')} value={dueDate} onChange={setDueDate} placeholder="—" clearable />
          </View>
          {!applyGst ? <Text style={styles.note}>{t('noGstNote')}</Text> : null}
        </Card>

        {/* Party */}
        <Card>
          <SectionHeader icon="person" title={t('party')} />
          <Pressable style={styles.partyBox} onPress={() => setPartyOpen(true)}>
            {party === undefined ? (
              <>
                <Ionicons name="person-add-outline" size={20} color={colors.primary} />
                <Text style={[styles.partyName, { color: colors.primary }]}>{t('selectParty')}</Text>
              </>
            ) : (
              <>
                <IconChip icon={party ? 'person' : 'cash-outline'} />
                <View style={styles.flex}>
                  <Text style={styles.partyName}>{party ? party.name : t('cashSale')}</Text>
                  {party ? (
                    <Text style={styles.partySub}>
                      {[party.phone, party.gstin].filter(Boolean).join(' · ') || stateName(party.state_code)}
                    </Text>
                  ) : null}
                </View>
              </>
            )}
            <Ionicons name="chevron-down" size={18} color={colors.faint} />
          </Pressable>
          {applyGst && placeOfSupply ? (
            <View style={styles.posRow}>
              <Text style={styles.posText}>
                {t('placeOfSupply')}: {stateName(placeOfSupply)}
              </Text>
              <View style={[styles.taxChip, isIgst && { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.taxChipText, isIgst && { color: colors.warning }]}>
                  {isIgst ? 'IGST' : 'CGST + SGST'}
                </Text>
              </View>
            </View>
          ) : null}
        </Card>

        {/* Items */}
        <Card>
          <SectionHeader icon="cube" title={`${t('itemsLabel')}${lines.length ? ` (${lines.length})` : ''}`} />
          {lines.map((l, i) => (
            <BillLineCard
              key={l.key}
              line={l}
              result={totals.lines[i]}
              applyGst={applyGst}
              onChange={(patch) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))}
              onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
            />
          ))}
          <Button variant="outline" icon="add" label={t('addItems')} onPress={() => setItemsOpen(true)} />
        </Card>

        {/* Totals */}
        {lines.length > 0 ? (
          <Card>
            <SumRow label={t('taxableAmount')} value={formatPaise(totals.taxablePaise)} />
            {totals.discountPaise > 0 ? (
              <SumRow label={t('discount')} value={`− ${formatPaise(totals.discountPaise)}`} muted />
            ) : null}
            {totals.taxRows
              .filter((r) => r.rate > 0)
              .map((r) =>
                isIgst ? (
                  <SumRow key={r.rate} label={`IGST @${r.rate}%`} value={formatPaise(r.igstPaise)} />
                ) : (
                  <View key={r.rate} style={{ gap: 8 }}>
                    <SumRow label={`CGST @${r.rate / 2}%`} value={formatPaise(r.cgstPaise)} />
                    <SumRow label={`SGST @${r.rate / 2}%`} value={formatPaise(r.sgstPaise)} />
                  </View>
                ),
              )}

            <View style={styles.chargesRow}>
              <TextInput
                value={chargesLabel}
                onChangeText={setChargesLabel}
                placeholder={t('chargesLabelPlaceholder')}
                placeholderTextColor={colors.faint}
                style={[styles.smallInput, styles.flex]}
              />
              <TextInput
                value={chargesText}
                onChangeText={setChargesText}
                placeholder={`${t('extraCharges')} ₹`}
                placeholderTextColor={colors.faint}
                keyboardType="decimal-pad"
                style={[styles.smallInput, { width: 120, textAlign: 'right' }]}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.flexText}>{t('roundOff')}</Text>
              <Text style={styles.muted}>
                {totals.roundOffPaise > 0 ? '+' : totals.roundOffPaise < 0 ? '−' : ''}
                {formatPaise(Math.abs(totals.roundOffPaise))}
              </Text>
              <Switch
                value={roundOff}
                onValueChange={setRoundOff}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.white}
              />
            </View>

            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>{t('totalAmount')}</Text>
              <Text style={styles.totalValue}>{formatPaise(totals.totalPaise)}</Text>
            </View>
            <Text style={styles.words}>{amountInWords(totals.totalPaise)}</Text>
          </Card>
        ) : null}

        {/* More details */}
        <Card>
          <Pressable style={styles.moreHeader} onPress={() => setShowMore((s) => !s)}>
            <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
            <Text style={styles.moreText}>{t('moreDetails')}</Text>
            <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
          </Pressable>
          {showMore ? (
            <>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Field label={t('poNo')} value={poNo} onChangeText={setPoNo} />
                </View>
                <View style={styles.flex}>
                  <Field
                    label={t('vehicleNo')}
                    value={vehicleNo}
                    onChangeText={(v) => setVehicleNo(v.toUpperCase())}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
              <Field
                label={t('notes')}
                placeholder={t('notesPlaceholder')}
                value={notes}
                onChangeText={setNotes}
                multiline
                style={{ minHeight: 60, textAlignVertical: 'top' }}
              />
            </>
          ) : null}
        </Card>

        <ErrorText>{error}</ErrorText>
      </Screen>

      <PartyPicker
        visible={partyOpen}
        parties={parties}
        onClose={() => setPartyOpen(false)}
        onPick={pickParty}
        onAddNew={() => openNew('/party/new')}
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

function SumRow({
  label,
  value,
  muted,
  bold,
  color,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  color?: string;
}) {
  return (
    <View style={styles.sumRow}>
      <Text style={[styles.sumLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.sumValue, muted && { color: colors.muted }, bold && styles.bold, color ? { color } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', gap: 12 },
  note: { fontSize: text.xs, color: colors.warning, backgroundColor: colors.accentSoft, padding: 8, borderRadius: radius.sm },
  partyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: colors.surfaceAlt,
  },
  partyName: { fontSize: text.md, fontWeight: '700', color: colors.text, flexShrink: 1 },
  partySub: { fontSize: text.sm, color: colors.muted, marginTop: 1 },
  posRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posText: { flex: 1, fontSize: text.sm, color: colors.muted },
  taxChip: { backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  taxChipText: { fontSize: text.xs, fontWeight: '800', color: colors.primary },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel: { fontSize: 14, color: colors.muted },
  sumValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  bold: { fontWeight: '800', color: colors.text, fontSize: text.md },
  chargesRow: { flexDirection: 'row', gap: 8 },
  smallInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flexText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  muted: { fontSize: text.sm, color: colors.muted },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: radius.md,
  },
  totalLabel: { fontSize: text.md, fontWeight: '700', color: colors.primary },
  totalValue: { fontSize: text.xl, fontWeight: '800', color: colors.primary },
  words: { fontSize: text.xs, color: colors.faint, fontStyle: 'italic' },
  moreHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLabel: { fontSize: text.xs, color: colors.muted },
  footerTotal: { fontSize: text.xl, fontWeight: '800', color: colors.primary },
  footerBtn: { flex: 1.4 },
});
