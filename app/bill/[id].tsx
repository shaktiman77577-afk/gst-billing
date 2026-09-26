import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BillRow } from '../../src/components/BillRow';
import { FormHeader } from '../../src/components/FormHeader';
import { StatusBadge } from '../../src/components/StatusBadge';
import { Button, Card } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { stateName } from '../../src/data/states';
import { formatQty } from '../../src/db/items';
import {
  cancelInvoice,
  creditNotesFor,
  deletePayment,
  getInvoice,
  Invoice,
  InvoiceLine,
  InvoiceListRow,
  Payment,
  paymentsForInvoice,
} from '../../src/db/invoices';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatDate } from '../../src/lib/dates';
import { amountInWords } from '../../src/lib/gst';
import { formatPaise } from '../../src/lib/money';
import { billWhatsappText, invoiceHtml, printBill, sharePdf, sharePdfOnWhatsApp } from '../../src/pdf/share';
import { colors, radius } from '../../src/theme';

type Data = { invoice: Invoice; lines: InvoiceLine[]; payments: Payment[]; creditNotes: InvoiceListRow[] };

export default function BillDetailScreen() {
  const db = useSQLiteContext();
  const { t } = useApp();
  const business = useBusiness();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<'share' | 'print' | 'whatsapp' | null>(null);

  const load = useCallback(async () => {
    const d = await getInvoice(db, id);
    if (!d) return;
    const [payments, creditNotes] = await Promise.all([paymentsForInvoice(db, id), creditNotesFor(db, id)]);
    setData({ ...d, payments, creditNotes });
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!data) return <View style={styles.flex} />;
  const { invoice: inv, lines, payments, creditNotes } = data;
  const isCn = inv.kind === 'credit_note';
  const cancelled = !!inv.cancelled_at;
  const balance = inv.total_paise - inv.received_paise - inv.credited_paise;
  const gst = inv.doc_type === 'tax_invoice';

  const run = async (kind: 'share' | 'print') => {
    if (!business) return;
    setBusy(kind);
    try {
      const html = invoiceHtml(business, inv, lines);
      if (kind === 'share') await sharePdf(html, inv.invoice_no);
      else await printBill(html);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) Alert.alert(t('appName'), t('pdfError'));
    } finally {
      setBusy(null);
    }
  };

  const onWhatsapp = async () => {
    if (!business) return;
    setBusy('whatsapp');
    try {
      const html = invoiceHtml(business, inv, lines);
      const caption = billWhatsappText(t, {
        name: inv.party_name,
        no: inv.invoice_no,
        date: formatDate(inv.invoice_date),
        amount: formatPaise(inv.total_paise),
        balance: !isCn && balance > 0 ? formatPaise(balance) : undefined,
        business: business.name,
      });
      await sharePdfOnWhatsApp(html, inv.invoice_no, inv.party_phone, caption);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) Alert.alert(t('appName'), t('pdfError'));
    } finally {
      setBusy(null);
    }
  };

  const onCancel = () => {
    Alert.alert(t('cancelBill'), t('cancelBillConfirm'), [
      { text: t('no'), style: 'cancel' },
      {
        text: t('cancelBill'),
        style: 'destructive',
        onPress: async () => {
          const res = await cancelInvoice(db, inv.id);
          if (res === 'has-credit-notes') Alert.alert(t('cancelBill'), t('cancelHasCn'));
          load();
        },
      },
    ]);
  };

  const onDeletePayment = (p: Payment) => {
    Alert.alert(t('delete'), t('deletePaymentConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deletePayment(db, p.id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={inv.invoice_no} />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {cancelled ? (
            <View style={styles.cancelBanner}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
              <Text style={styles.cancelText}>{t('cancelledNote')}</Text>
            </View>
          ) : null}

          {/* Summary */}
          <Card>
            <View style={styles.rowBetween}>
              <Text style={styles.docType}>
                {isCn ? t('creditNote') : gst ? t('taxInvoice') : t('billOfSupply')}
              </Text>
              <StatusBadge status={inv.status} kind={inv.kind} />
            </View>
            <Text style={[styles.total, cancelled && styles.strike]}>{formatPaise(inv.total_paise)}</Text>
            <Text style={styles.words}>{amountInWords(inv.total_paise)}</Text>
            <View style={styles.metaRow}>
              <Meta icon="calendar-outline" text={formatDate(inv.invoice_date)} />
              {inv.due_date ? <Meta icon="alarm-outline" text={`${t('dueDate')}: ${formatDate(inv.due_date)}`} /> : null}
            </View>
            {isCn && inv.ref_invoice_id ? (
              <Pressable onPress={() => router.push(`/bill/${inv.ref_invoice_id}`)} style={styles.refLink}>
                <Ionicons name="link-outline" size={16} color={colors.primary} />
                <Text style={styles.refText}>
                  {t('againstBill')} {inv.ref_invoice_no}
                </Text>
              </Pressable>
            ) : null}
          </Card>

          {/* Party */}
          <Card>
            <Text style={styles.cardLabel}>{t('party')}</Text>
            <Pressable
              disabled={!inv.party_id}
              onPress={() => inv.party_id && router.push({ pathname: '/party/ledger', params: { id: inv.party_id } })}
            >
              <Text style={styles.partyName}>
                {inv.party_name}
                {inv.party_id ? '  ›' : ''}
              </Text>
            </Pressable>
            {inv.party_phone ? <Text style={styles.meta}>{inv.party_phone}</Text> : null}
            {inv.party_gstin ? <Text style={styles.meta}>GSTIN {inv.party_gstin}</Text> : null}
            {inv.billing_address ? <Text style={styles.meta}>{inv.billing_address}</Text> : null}
            {gst ? (
              <Text style={styles.meta}>
                {t('placeOfSupply')}: {stateName(inv.place_of_supply)} · {inv.is_igst ? 'IGST' : 'CGST + SGST'}
              </Text>
            ) : null}
          </Card>

          {/* Lines */}
          <Card>
            <Text style={styles.cardLabel}>
              {t('itemsLabel')} ({lines.length})
            </Text>
            {lines.map((l) => (
              <View key={l.id} style={styles.line}>
                <View style={styles.flexOnly}>
                  <Text style={styles.lineName}>{l.name}</Text>
                  <Text style={styles.meta}>
                    {formatQty(l.qty)} {l.unit} × {formatPaise(l.rate_paise)}
                    {gst ? ` · GST ${l.gst_rate}%` : ''}
                    {l.hsn ? ` · HSN ${l.hsn}` : ''}
                    {l.discount_paise > 0 ? ` · −${formatPaise(l.discount_paise)}` : ''}
                  </Text>
                </View>
                <Text style={styles.lineAmt}>{formatPaise(l.amount_paise)}</Text>
              </View>
            ))}
          </Card>

          {/* Totals */}
          <Card>
            <Row label={t('taxableAmount')} value={formatPaise(inv.taxable_paise)} />
            {inv.discount_paise > 0 ? <Row label={t('discount')} value={`− ${formatPaise(inv.discount_paise)}`} /> : null}
            {inv.cgst_paise > 0 ? <Row label="CGST" value={formatPaise(inv.cgst_paise)} /> : null}
            {inv.sgst_paise > 0 ? <Row label="SGST" value={formatPaise(inv.sgst_paise)} /> : null}
            {inv.igst_paise > 0 ? <Row label="IGST" value={formatPaise(inv.igst_paise)} /> : null}
            {inv.charges_paise > 0 ? (
              <Row label={inv.charges_label || t('extraCharges')} value={formatPaise(inv.charges_paise)} />
            ) : null}
            {inv.round_off_paise !== 0 ? (
              <Row
                label={t('roundOff')}
                value={`${inv.round_off_paise > 0 ? '+' : '−'} ${formatPaise(Math.abs(inv.round_off_paise))}`}
              />
            ) : null}
            <View style={styles.divider} />
            <Row label={t('totalAmount')} value={formatPaise(inv.total_paise)} bold />
            {isCn ? (
              inv.received_paise > 0 ? <Row label={t('refund')} value={formatPaise(inv.received_paise)} /> : null
            ) : (
              <>
                <Row label={t('received')} value={formatPaise(inv.received_paise)} color={colors.success} />
                {inv.credited_paise > 0 ? (
                  <Row label={t('credited')} value={`− ${formatPaise(inv.credited_paise)}`} color={colors.primary} />
                ) : null}
                {!cancelled ? (
                  <Row
                    label={t('balanceDue')}
                    value={formatPaise(Math.max(balance, 0))}
                    color={balance > 0 ? colors.danger : colors.success}
                    bold
                  />
                ) : null}
              </>
            )}
          </Card>

          {/* Payments */}
          {!isCn ? (
            <Card>
              <Text style={styles.cardLabel}>{t('payments')}</Text>
              {payments.length === 0 ? <Text style={styles.meta}>{t('noPayments')}</Text> : null}
              {payments.map((p) => (
                <View key={p.id} style={styles.payRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <View style={styles.flexOnly}>
                    <Text style={styles.payAmt}>{formatPaise(p.amount_paise)}</Text>
                    <Text style={styles.meta}>
                      {formatDate(p.paid_on)} · {t(p.mode)}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => onDeletePayment(p)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.faint} />
                  </Pressable>
                </View>
              ))}
              {!cancelled && balance > 0 ? (
                <Button
                  variant="outline"
                  icon="add"
                  label={t('recordPayment')}
                  onPress={() => router.push({ pathname: '/payment/new', params: { invoiceId: inv.id, direction: 'in' } })}
                />
              ) : null}
            </Card>
          ) : null}

          {/* Credit notes */}
          {creditNotes.length ? (
            <Card style={{ gap: 0, paddingVertical: 8 }}>
              <Text style={styles.cardLabel}>{t('creditNotes')}</Text>
              {creditNotes.map((c) => (
                <BillRow key={c.id} bill={c} flat />
              ))}
            </Card>
          ) : null}

          {inv.po_no || inv.vehicle_no || inv.notes ? (
            <Card>
              {inv.po_no ? <Row label={t('poNo')} value={inv.po_no} /> : null}
              {inv.vehicle_no ? <Row label={t('vehicleNo')} value={inv.vehicle_no} /> : null}
              {inv.notes ? (
                <View style={{ gap: 2 }}>
                  <Text style={styles.cardLabel}>{t('notes')}</Text>
                  <Text style={styles.meta}>{inv.notes}</Text>
                </View>
              ) : null}
            </Card>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            {!isCn && !cancelled ? (
              <View style={styles.flexOnly}>
                <Button
                  variant="outline"
                  icon="create-outline"
                  label={t('edit')}
                  onPress={() => router.push({ pathname: '/bill/new', params: { id: inv.id } })}
                />
              </View>
            ) : null}
            <View style={styles.flexOnly}>
              <Button
                variant="outline"
                icon="eye-outline"
                label={t('preview')}
                onPress={() => router.push({ pathname: '/bill/preview', params: { id: inv.id } })}
              />
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.flexOnly}>
              <Button
                variant="outline"
                icon="print-outline"
                label={t('print')}
                onPress={() => run('print')}
                loading={busy === 'print'}
              />
            </View>
            <View style={styles.flexOnly}>
              <Button
                icon="share-social-outline"
                label={t('sharePdf')}
                onPress={() => run('share')}
                loading={busy === 'share'}
              />
            </View>
          </View>
          {!cancelled ? (
            <Pressable
              onPress={onWhatsapp}
              disabled={busy === 'whatsapp'}
              style={({ pressed }) => [styles.wa, pressed && { opacity: 0.85 }, busy === 'whatsapp' && { opacity: 0.7 }]}
            >
              {busy === 'whatsapp' ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="logo-whatsapp" size={22} color={colors.white} />
                  <Text style={styles.waText}>{t('whatsapp')}</Text>
                </>
              )}
            </Pressable>
          ) : null}
          {!isCn && !cancelled ? (
            <Button
              variant="outline"
              icon="return-down-back-outline"
              label={t('creditNote')}
              onPress={() => router.push({ pathname: '/bill/credit', params: { invoiceId: inv.id } })}
            />
          ) : null}
          {!cancelled ? <Button variant="danger" icon="close-circle-outline" label={t('cancelBill')} onPress={onCancel} /> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Meta({ icon, text }: { icon: 'calendar-outline' | 'alarm-outline'; text: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={styles.meta}>{text}</Text>
    </View>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  cancelBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.border,
    padding: 12,
    borderRadius: radius.md,
  },
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  docType: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  total: { fontSize: 30, fontWeight: '800', color: colors.primary },
  strike: { textDecorationLine: 'line-through', color: colors.faint },
  words: { fontSize: 12, color: colors.muted, fontStyle: 'italic', marginTop: -6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  refLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  cardLabel: { fontSize: 12, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.6 },
  partyName: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: -6 },
  meta: { fontSize: 13, color: colors.muted },
  line: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineName: { fontSize: 15, fontWeight: '600', color: colors.text },
  lineAmt: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowLabel: { fontSize: 14, color: colors.muted, flexShrink: 1 },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  bold: { fontWeight: '800', color: colors.text, fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.border },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payAmt: { fontSize: 15, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 12 },
  wa: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: '#25D366',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
