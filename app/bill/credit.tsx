import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { DateField } from '../../src/components/DateField';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, Chips, ErrorText, Field, Hairline, Hint, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { formatQty } from '../../src/db/items';
import {
  CREDIT_NOTE_PREFIX,
  getInvoice,
  Invoice,
  InvoiceLine,
  LineDraft,
  PaymentMode,
  returnedQty,
  saveInvoice,
} from '../../src/db/invoices';
import { todayIso } from '../../src/lib/dates';
import { amountInWords, calcBill } from '../../src/lib/gst';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, text } from '../../src/theme';

const MODES: PaymentMode[] = ['cash', 'upi', 'card', 'bank', 'cheque'];
const lineKey = (l: InvoiceLine) => l.item_id ?? l.name;

export default function CreditNoteScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [max, setMax] = useState<Record<string, number>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayIso());
  const [refund, setRefund] = useState(false);
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getInvoice(db, invoiceId);
      if (!data) return;
      const done = await returnedQty(db, invoiceId);
      // Several lines can share an item; hand out what is already returned line by line.
      const left = { ...done };
      const m: Record<string, number> = {};
      data.lines.forEach((l) => {
        const k = lineKey(l);
        const used = Math.min(left[k] ?? 0, l.qty);
        left[k] = (left[k] ?? 0) - used;
        m[l.id] = Math.max(0, Math.round((l.qty - used) * 1000) / 1000);
      });
      setInv(data.invoice);
      setLines(data.lines);
      setMax(m);
    })();
  }, [db, invoiceId]);

  const drafts = useMemo(() => {
    const out: LineDraft[] = [];
    for (const l of lines) {
      const q = Math.min(Number(qty[l.id] ?? 0) || 0, max[l.id] ?? 0);
      if (q <= 0) continue;
      out.push({
        itemId: l.item_id,
        itemType: l.item_type,
        name: l.name,
        hsn: l.hsn,
        unit: l.unit,
        qty: q,
        ratePaise: l.rate_paise,
        rateWithTax: l.rate_with_tax === 1,
        discountType: l.discount_type,
        // A fixed ₹ discount is shared out by quantity.
        discountValue: l.discount_type === 'amt' ? Math.round((l.discount_value * q) / l.qty) : l.discount_value,
        gstRate: l.gst_rate,
      });
    }
    return out;
  }, [lines, qty, max]);

  const totals = useMemo(
    () =>
      calcBill(drafts, {
        applyGst: inv?.doc_type === 'tax_invoice',
        isIgst: inv?.is_igst === 1,
        chargesPaise: 0,
        roundOff: inv?.round_off === 1,
      }),
    [drafts, inv],
  );

  const setQ = (id: string, v: number) => {
    const m = max[id] ?? 0;
    const q = Math.max(0, Math.min(m, Math.round(v * 1000) / 1000));
    setQty((s) => ({ ...s, [id]: formatQty(q) }));
  };

  const onSave = async () => {
    if (!inv || !businessId) return;
    if (drafts.length === 0) return setError(t('errNothingReturned'));
    setError(null);
    setSaving(true);
    try {
      const id = await saveInvoice(db, {
        businessId,
        invoiceId: null,
        prefix: CREDIT_NOTE_PREFIX,
        kind: 'credit_note',
        refInvoice: { id: inv.id, no: inv.invoice_no },
        lines: drafts,
        totals,
        draft: {
          docType: inv.doc_type,
          invoiceDate: date,
          dueDate: null,
          partyId: inv.party_id,
          partyName: inv.party_name,
          partyPhone: inv.party_phone,
          partyGstin: inv.party_gstin,
          partyStateCode: inv.party_state_code,
          billingAddress: inv.billing_address,
          shippingAddress: inv.shipping_address,
          placeOfSupply: inv.place_of_supply,
          isIgst: inv.is_igst === 1,
          chargesLabel: null,
          roundOff: inv.round_off === 1,
          poNo: null,
          vehicleNo: null,
          notes: notes.trim() || null,
          receivedPaise: refund ? totals.totalPaise : 0,
          paymentMode: mode,
        },
      });
      router.replace(`/bill/${id}`);
    } catch (e) {
      setError(`${t('somethingWrong')} (${String((e as Error)?.message ?? e)})`);
    } finally {
      setSaving(false);
    }
  };

  if (!inv) return <View style={styles.flex} />;

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('newCreditNote')} />
      <Screen
        edges={['bottom']}
        footer={
          <View style={styles.footerRow}>
            <View style={styles.flexOnly}>
              <Text style={styles.footerLabel}>{t('creditNote')}</Text>
              <Text style={styles.footerTotal}>{formatPaise(totals.totalPaise)}</Text>
            </View>
            <View style={{ flex: 1.4 }}>
              <Button label={t('saveCreditNote')} icon="checkmark-circle" onPress={onSave} loading={saving} />
            </View>
          </View>
        }
      >
        <Card>
          <Text style={styles.muted}>
            {t('againstBill')} {inv.invoice_no}
          </Text>
          <Text style={styles.party}>{inv.party_name}</Text>
          <Hint>{t('creditNoteHint')}</Hint>
          <DateField label={t('billDate')} value={date} onChange={(d) => d && setDate(d)} />
        </Card>

        <Card>
          <SectionHeader icon="return-down-back" title={t('itemsLabel')} />
          {lines.map((l, i) => {
            const m = max[l.id] ?? 0;
            const cur = Number(qty[l.id] ?? 0) || 0;
            return (
              <View key={l.id} style={[m === 0 && { opacity: 0.45 }]}>
                {i > 0 ? <Hairline /> : null}
                <View style={styles.line}>
                  <View style={styles.flexOnly}>
                    <Text style={styles.lineName}>{l.name}</Text>
                    <Text style={styles.lineSub}>
                      {formatPaise(l.rate_paise)} · {t('returnQty')}: {formatQty(m)} {l.unit}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => setQ(l.id, cur - 1)} hitSlop={10} style={styles.stepBtn} disabled={m === 0}>
                      <Ionicons name="remove" size={18} color={colors.primary} />
                    </Pressable>
                  <TextInput
                    value={qty[l.id] ?? '0'}
                    onChangeText={(v) => /^\d*\.?\d{0,3}$/.test(v) && setQty((s) => ({ ...s, [l.id]: v }))}
                    onBlur={() => setQ(l.id, Number(qty[l.id] ?? 0) || 0)}
                    keyboardType="decimal-pad"
                    style={styles.qty}
                    editable={m > 0}
                    selectTextOnFocus
                  />
                  <Pressable onPress={() => setQ(l.id, cur + 1)} hitSlop={10} style={styles.stepBtn} disabled={m === 0}>
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </Pressable>
                </View>
                </View>
              </View>
            );
          })}
        </Card>

        {drafts.length ? (
          <Card>
            <Row label={t('taxableAmount')} value={formatPaise(totals.taxablePaise)} />
            {totals.taxPaise > 0 ? <Row label="GST" value={formatPaise(totals.taxPaise)} /> : null}
            {totals.roundOffPaise !== 0 ? <Row label={t('roundOff')} value={formatPaise(totals.roundOffPaise)} /> : null}
            <Row label={t('creditNote')} value={formatPaise(totals.totalPaise)} bold />
            <Text style={styles.words}>{amountInWords(totals.totalPaise)}</Text>
            <View style={styles.switchRow}>
              <View style={styles.flexOnly}>
                <Text style={styles.switchText}>{t('refund')}</Text>
                <Text style={styles.muted}>{t('refundHint')}</Text>
              </View>
              <Switch
                value={refund}
                onValueChange={setRefund}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.white}
              />
            </View>
            {refund ? (
              <Chips options={MODES.map((m) => ({ value: m, label: t(m) }))} value={mode} onChange={setMode} />
            ) : null}
            <Field label={t('notes')} optionalLabel={t('optional')} value={notes} onChangeText={setNotes} />
          </Card>
        ) : null}

        <ErrorText>{error}</ErrorText>
      </Screen>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  muted: { fontSize: text.xs, color: colors.muted },
  party: { fontSize: text.md, fontWeight: '700', color: colors.text, marginTop: -6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, minHeight: 52 },
  lineName: { fontSize: text.md, fontWeight: '700', color: colors.text },
  lineSub: { fontSize: text.sm, color: colors.muted, marginTop: 2 },
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
  qty: { minWidth: 40, textAlign: 'center', fontSize: text.md, fontWeight: '800', color: colors.primary, paddingVertical: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: text.md, color: colors.muted },
  rowValue: { fontSize: text.md, color: colors.text, fontWeight: '600' },
  bold: { fontWeight: '800', color: colors.text, fontSize: text.md },
  words: { fontSize: text.xs, color: colors.muted, fontStyle: 'italic' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchText: { fontSize: text.md, fontWeight: '600', color: colors.text },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLabel: { fontSize: text.xs, color: colors.muted },
  footerTotal: { fontSize: text.xl, fontWeight: '800', color: colors.primary },
});
