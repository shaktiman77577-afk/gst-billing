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
import { Button, Card, ErrorText, Field, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { stateName } from '../../src/data/states';
import { DUPLICATE_INVOICE_NO, getInvoice, LineDraft } from '../../src/db/invoices';
import { nextChallanNo, saveChallan } from '../../src/db/challans';
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
const nextKey = () => `cl${++keySeq}`;

export default function ChallanFormScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const business = useBusiness();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id && id !== 'new' ? id : null;

  const [parties, setParties] = useState<PartyWithBalance[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [party, setParty] = useState<PartyChoice>(undefined);
  const [editPartyId, setEditPartyId] = useState<string | null | undefined>(undefined);
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState(todayIso());
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

  // Load the challan when editing.
  useEffect(() => {
    if (!editId || loadedEdit.current) return;
    loadedEdit.current = true;
    (async () => {
      const data = await getInvoice(db, editId);
      if (!data) return;
      const { invoice: inv, lines: ls } = data;
      setChallanNo(inv.invoice_no);
      setChallanDate(inv.invoice_date);
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
          rateWithTax: false,
          discountType: l.discount_type,
          discountValue: l.discount_value,
          gstRate: 0,
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

  // New challan: preview the next DC number for the chosen date.
  useEffect(() => {
    if (editId || !businessId) return;
    nextChallanNo(db, businessId, challanDate).then((n) => setChallanNo(n.challanNo));
  }, [db, editId, businessId, challanDate]);

  // A challan never carries GST.
  const totals = useMemo(
    () => calcBill(lines, { applyGst: false, isIgst: false, chargesPaise: toPaise(chargesText) ?? 0, roundOff }),
    [lines, chargesText, roundOff],
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
          rateWithTax: false,
          discountType: 'pct',
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

    const finalTotals = calcBill(valid, {
      applyGst: false,
      isIgst: false,
      chargesPaise: toPaise(chargesText) ?? 0,
      roundOff,
    });
    setSaving(true);
    try {
      const placeOfSupply = (party && party.state_code) || business.state_code || '';
      const draft = {
        docType: 'delivery_challan' as const,
        invoiceDate: challanDate,
        dueDate: null,
        partyId: party?.id ?? null,
        partyName: party?.name ?? t('cashSale'),
        partyPhone: party?.phone ?? null,
        partyGstin: party?.gstin ?? null,
        partyStateCode: party?.state_code ?? null,
        billingAddress: party?.billing_address ?? null,
        shippingAddress: party ? (party.same_shipping ? party.billing_address : party.shipping_address) : null,
        placeOfSupply,
        isIgst: false,
        chargesLabel: chargesLabel.trim() || null,
        roundOff,
        poNo: poNo.trim() || null,
        vehicleNo: vehicleNo.trim() || null,
        notes: notes.trim() || null,
        receivedPaise: 0,
        paymentMode: 'cash' as const,
      };
      const savedId = await saveChallan(db, { businessId, challanId: editId, draft, lines: valid, totals: finalTotals });
      if (editId) router.back();
      else router.replace(`/challans/${savedId}`);
    } catch (e) {
      if ((e as Error)?.message === DUPLICATE_INVOICE_NO) setError(t('ch_errDuplicateNo'));
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
      <FormHeader title={editId ? t('ch_editChallan') : t('ch_newChallan')} />
      <Screen
        edges={['bottom']}
        footer={
          <View style={styles.footerRow}>
            <View style={styles.flex}>
              <Text style={styles.footerLabel}>{t('totalAmount')}</Text>
              <Text style={styles.footerTotal}>{formatPaise(totals.totalPaise)}</Text>
            </View>
            <View style={styles.footerBtn}>
              <Button label={t('ch_saveChallan')} icon="checkmark-circle" onPress={onSave} loading={saving} />
            </View>
          </View>
        }
      >
        {/* Number & date — the DC series is fixed, the number is auto-assigned */}
        <Card>
          <Field
            label={t('ch_challanNo')}
            value={challanNo}
            onChangeText={() => {}}
            editable={false}
            autoCapitalize="characters"
            autoCorrect={false}
            icon="document-text-outline"
          />
          <DateField label={t('ch_challanDate')} value={challanDate} onChange={(d) => d && setChallanDate(d)} />
          <Text style={styles.note}>{t('ch_noGstNote')}</Text>
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
                <View style={styles.partyAvatar}>
                  <Ionicons name={party ? 'person' : 'cash-outline'} size={18} color={colors.primary} />
                </View>
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
        </Card>

        {/* Items */}
        <Card>
          <SectionHeader icon="cube" title={`${t('itemsLabel')}${lines.length ? ` (${lines.length})` : ''}`} />
          {lines.map((l, i) => (
            <BillLineCard
              key={l.key}
              line={l}
              result={totals.lines[i]}
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
            <SumRow label={t('taxableAmount')} value={formatPaise(totals.taxablePaise)} />
            {totals.discountPaise > 0 ? (
              <SumRow label={t('discount')} value={`− ${formatPaise(totals.discountPaise)}`} muted />
            ) : null}

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
  note: {
    fontSize: text.xs,
    color: colors.warning,
    backgroundColor: colors.accentSoft,
    padding: 8,
    borderRadius: radius.sm,
  },
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
  partyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyName: { fontSize: text.md, fontWeight: '700', color: colors.text, flexShrink: 1 },
  partySub: { fontSize: text.xs, color: colors.muted, marginTop: 1 },
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
  words: { fontSize: text.xs, color: colors.muted, fontStyle: 'italic' },
  moreHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLabel: { fontSize: text.xs, color: colors.muted },
  footerTotal: { fontSize: text.xl, fontWeight: '800', color: colors.primary },
  footerBtn: { flex: 1.4 },
});
