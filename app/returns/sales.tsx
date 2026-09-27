// Sales return (Worker B). Like /bill/credit, but saves kind='sales_return'
// with its own SR/fy/seq series via createSalesReturn(). The original bill is
// optional: pick one from the picker, or prefill from the bill detail
// ("Create return"). Per-item quantity is capped at billed − already returned;
// the DB layer throws OVER_RETURN on any race.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DateField } from '../../src/components/DateField';
import { EmptyState } from '../../src/components/EmptyState';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, ErrorText, Field, Hint, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { formatQty } from '../../src/db/items';
import {
  getInvoice,
  Invoice,
  InvoiceLine,
  LineDraft,
  returnedQty,
} from '../../src/db/invoices';
import { createSalesReturn, linkableBills, OVER_RETURN } from '../../src/db/returns';
import { trReturns } from '../../src/i18n/parity_returns';
import { todayIso } from '../../src/lib/dates';
import { amountInWords, calcBill } from '../../src/lib/gst';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { colors, radius, text } from '../../src/theme';

const lineKey = (l: InvoiceLine) => l.item_id ?? l.name;

type BillPick = { id: string; invoice_no: string; party_name: string; invoice_date: string };

export default function SalesReturnScreen() {
  const db = useSQLiteContext();
  const { t, language, businessId } = useApp();
  const tr = (k: Parameters<typeof trReturns>[1]) => trReturns(language, k);
  const { invoiceId } = useLocalSearchParams<{ invoiceId?: string }>();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [max, setMax] = useState<Record<string, number>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [bills, setBills] = useState<BillPick[]>([]);

  const loadBill = async (id: string) => {
    const data = await getInvoice(db, id);
    if (!data || data.invoice.kind !== 'invoice') return;
    const done = await returnedQty(db, id);
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
    setQty({});
    setError(null);
    setPicking(false);
  };

  useEffect(() => {
    if (invoiceId) loadBill(invoiceId);
    linkableBills(db, businessId ?? '').then(setBills);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, businessId, invoiceId]);

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
    if (!businessId) return;
    if (drafts.length === 0) return setError(tr('errNothingReturnedSR'));
    setError(null);
    setSaving(true);
    try {
      const id = await createSalesReturn(db, {
        businessId,
        refInvoiceId: inv?.id ?? null,
        draft: {
          docType: inv?.doc_type ?? 'tax_invoice',
          invoiceDate: date,
          dueDate: null,
          partyId: inv?.party_id ?? null,
          partyName: inv?.party_name ?? '',
          partyPhone: inv?.party_phone ?? null,
          partyGstin: inv?.party_gstin ?? null,
          partyStateCode: inv?.party_state_code ?? null,
          billingAddress: inv?.billing_address ?? null,
          shippingAddress: inv?.shipping_address ?? null,
          placeOfSupply: inv?.place_of_supply ?? '',
          isIgst: inv?.is_igst === 1,
          chargesLabel: null,
          roundOff: inv?.round_off === 1,
          poNo: null,
          vehicleNo: null,
          notes: notes.trim() || null,
          receivedPaise: 0,
          paymentMode: 'cash',
        },
        lines: drafts,
        totals,
      });
      router.replace(`/bill/${id}`);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      setError(
        msg.startsWith(OVER_RETURN)
          ? `${tr('overReturn')} (${msg.slice(OVER_RETURN.length + 2)})`
          : `${t('somethingWrong')} (${msg})`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={tr('newSalesReturn')} />
      <Screen
        edges={['bottom']}
        footer={
          inv ? (
            <View style={styles.footerRow}>
              <View style={styles.flexOnly}>
                <Text style={styles.footerLabel}>{tr('salesReturn')}</Text>
                <Text style={styles.footerTotal}>{formatPaise(totals.totalPaise)}</Text>
              </View>
              <View style={{ flex: 1.4 }}>
                <Button label={tr('saveSalesReturn')} icon="checkmark-circle" onPress={onSave} loading={saving} />
              </View>
            </View>
          ) : undefined
        }
      >
        {picking ? (
          <Card>
            <SectionHeader icon="document-text" title={tr('linkBill')} />
            {bills.length === 0 ? (
              <EmptyState icon="receipt-outline" title={tr('noBillsToLink')} hint="" />
            ) : (
              <FlatList
                data={bills}
                keyExtractor={(b) => b.id}
                scrollEnabled={false}
                renderItem={({ item: b }) => (
                  <Pressable onPress={() => loadBill(b.id)} style={styles.pickRow}>
                    <View style={styles.flexOnly}>
                      <Text style={styles.pickNo}>{b.invoice_no}</Text>
                      <Text style={styles.muted}>
                        {b.party_name} · {formatDate(b.invoice_date)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                )}
              />
            )}
            <Button variant="outline" label={t('cancel')} onPress={() => setPicking(false)} />
          </Card>
        ) : (
          <>
            <Card>
              {inv ? (
                <>
                  <Text style={styles.muted}>
                    {tr('againstBill')} {inv.invoice_no}
                  </Text>
                  <Text style={styles.party}>{inv.party_name}</Text>
                  <Pressable onPress={() => setPicking(true)} hitSlop={8}>
                    <Text style={styles.link}>{tr('changeBill')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.party}>{tr('linkBill')}</Text>
                  <Hint>{tr('linkBillHint')}</Hint>
                  <Button
                    variant="outline"
                    icon="document-text-outline"
                    label={tr('linkBill')}
                    onPress={() => setPicking(true)}
                  />
                </>
              )}
              <Hint>{tr('salesReturnHint')}</Hint>
              <DateField label={t('billDate')} value={date} onChange={(d) => d && setDate(d)} />
            </Card>

            {inv ? (
              <Card>
                <SectionHeader icon="arrow-undo" title={tr('returnItems')} />
                {lines.map((l) => {
                  const m = max[l.id] ?? 0;
                  const cur = Number(qty[l.id] ?? 0) || 0;
                  return (
                    <View key={l.id} style={[styles.line, m === 0 && { opacity: 0.45 }]}>
                      <View style={styles.flexOnly}>
                        <Text style={styles.lineName}>{l.name}</Text>
                        <Text style={styles.muted}>
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
                  );
                })}
              </Card>
            ) : null}

            {drafts.length ? (
              <Card>
                <Row label={t('taxableAmount')} value={formatPaise(totals.taxablePaise)} />
                {totals.taxPaise > 0 ? <Row label="GST" value={formatPaise(totals.taxPaise)} /> : null}
                {totals.roundOffPaise !== 0 ? <Row label={t('roundOff')} value={formatPaise(totals.roundOffPaise)} /> : null}
                <Row label={tr('salesReturn')} value={formatPaise(totals.totalPaise)} bold />
                <Text style={styles.words}>{amountInWords(totals.totalPaise)}</Text>
                <Field label={t('notes')} optionalLabel={t('optional')} value={notes} onChangeText={setNotes} />
              </Card>
            ) : null}

            <ErrorText>{error}</ErrorText>
          </>
        )}
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
  party: { fontSize: text.lg, fontWeight: '700', color: colors.text, marginTop: -6 },
  link: { fontSize: text.sm, fontWeight: '700', color: colors.primary, marginTop: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  lineName: { fontSize: text.md, fontWeight: '700', color: colors.text },
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
  qty: { minWidth: 40, textAlign: 'center', fontWeight: '800', color: colors.primary, paddingVertical: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  bold: { fontWeight: '800', color: colors.text, fontSize: text.md },
  words: { fontSize: text.xs, color: colors.muted, fontStyle: 'italic' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLabel: { fontSize: text.xs, color: colors.muted },
  footerTotal: { fontSize: text.xl, fontWeight: '800', color: colors.primary },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  pickNo: { fontSize: text.md, fontWeight: '700', color: colors.text },
});
