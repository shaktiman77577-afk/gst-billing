import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { ComponentProps, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BillRow } from '../../src/components/BillRow';
import { FormHeader } from '../../src/components/FormHeader';
import { StatusBadge } from '../../src/components/StatusBadge';
import { Button, Card, Hairline, MenuRow } from '../../src/components/ui';
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
  isReturnKind,
  Payment,
  paymentsForInvoice,
} from '../../src/db/invoices';
import { convertQuotationToBill } from '../../src/db/quotations';
import { useBusiness } from '../../src/hooks/useBusiness';
import { useMembership } from '../../src/hooks/useMembership';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { CopyKind } from '../../src/pdf/data';
import { billWhatsappText, invoiceHtml, printBill, sharePdf, sharePdfOnWhatsApp } from '../../src/pdf/share';
import { qrDataUrl, upiLink } from '../../src/pdf/qr';
import { colors, radius, text } from '../../src/theme';

type Data = { invoice: Invoice; lines: InvoiceLine[]; payments: Payment[]; creditNotes: InvoiceListRow[] };

const COPIES: { kind: CopyKind; key: 'copyOriginal' | 'copyDuplicate' | 'copyTriplicate' }[] = [
  { kind: 'original', key: 'copyOriginal' },
  { kind: 'duplicate', key: 'copyDuplicate' },
  { kind: 'triplicate', key: 'copyTriplicate' },
];

export default function BillDetailScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const business = useBusiness();
  const mem = useMembership();
  const isPro = mem.status === 'pro';
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<'share' | 'print' | 'whatsapp' | 'convert' | null>(null);
  const [copy, setCopy] = useState<CopyKind>('original');

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

  // In-app "Scan to Pay" QR — the hook must run before any early return.
  const upiId = business?.upi_id?.trim() ?? '';
  const qrUri = useMemo(() => {
    if (!data) return '';
    const qInv = data.invoice;
    const qBal = qInv.total_paise - qInv.received_paise - qInv.credited_paise;
    const ok =
      !!upiId && !qInv.cancelled_at && !isReturnKind(qInv.kind) && qInv.doc_type !== 'quotation' && qBal > 0;
    return ok && business ? qrDataUrl(upiLink(upiId, business.name ?? '', qBal, qInv.invoice_no)) : '';
  }, [data, business, upiId]);

  if (!data) return <View style={styles.flex} />;
  const { invoice: inv, lines, payments, creditNotes } = data;
  const isCn = isReturnKind(inv.kind);
  const isQuotation = inv.doc_type === 'quotation';
  const cancelled = !!inv.cancelled_at;
  const balance = inv.total_paise - inv.received_paise - inv.credited_paise;
  const gst = inv.doc_type === 'tax_invoice';

  // In-app "Scan to Pay" QR — same conditions as the QR printed on the PDF.
  const showQr = !!upiId && !cancelled && !isCn && !isQuotation && balance > 0;

  const run = async (kind: 'share' | 'print') => {
    if (!business) return;
    setBusy(kind);
    try {
      const html = invoiceHtml(business, inv, lines, { isPro, copy });
      if (kind === 'share') await sharePdf(html, inv.invoice_no);
      else await printBill(html);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) AppAlert.alert(t('appName'), t('pdfError'));
    } finally {
      setBusy(null);
    }
  };

  const onWhatsapp = async () => {
    if (!business) return;
    setBusy('whatsapp');
    try {
      const html = invoiceHtml(business, inv, lines, { isPro, copy });
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
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) AppAlert.alert(t('appName'), t('pdfError'));
    } finally {
      setBusy(null);
    }
  };

  const onConvert = async () => {
    if (!business || !businessId) return;
    setBusy('convert');
    try {
      const billId = await convertQuotationToBill(db, {
        businessId,
        quotationId: inv.id,
        prefix: business.invoice_prefix,
        gstRegistered: business.gst_registered === 1,
        stateCode: business.state_code,
      });
      router.replace(`/bill/${billId}`);
    } catch (e) {
      AppAlert.alert(t('appName'), `${t('somethingWrong')} (${String((e as Error)?.message ?? e)})`);
    } finally {
      setBusy(null);
    }
  };

  const onCancel = () => {
    AppAlert.alert(t('cancelBill'), t('cancelBillConfirm'), [
      { text: t('no'), style: 'cancel' },
      {
        text: t('cancelBill'),
        style: 'destructive',
        onPress: async () => {
          const res = await cancelInvoice(db, inv.id);
          if (res === 'has-credit-notes') AppAlert.alert(t('cancelBill'), t('cancelHasCn'));
          load();
        },
      },
    ]);
  };

  const onDeletePayment = (p: Payment) => {
    AppAlert.alert(t('delete'), t('deletePaymentConfirm'), [
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
        {/* Fixed action zone — summary + actions visible without scrolling */}
        <View style={styles.topZone}>
          {cancelled ? (
            <View style={styles.cancelBanner}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
              <Text style={styles.cancelText}>{t('cancelledNote')}</Text>
            </View>
          ) : null}

          {/* Summary card: document, party, money and the main actions */}
          <Card style={styles.summaryCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.docType}>
                {isQuotation ? t('q_quotation') : isCn ? t('creditNote') : gst ? t('taxInvoice') : t('billOfSupply')}
              </Text>
              <StatusBadge status={inv.status} kind={inv.kind} />
            </View>
            <Text style={styles.summaryParty} numberOfLines={1}>
              {inv.party_name}
            </Text>
            <Text style={styles.partyLine} numberOfLines={1}>
              {formatDate(inv.invoice_date)}
              {gst ? ` · ${inv.is_igst ? 'IGST' : 'CGST + SGST'}` : ''}
            </Text>
            {isCn && inv.ref_invoice_id ? (
              <Pressable onPress={() => router.push(`/bill/${inv.ref_invoice_id}`)} hitSlop={10} style={styles.refLink}>
                <Ionicons name="link-outline" size={16} color={colors.primary} />
                <Text style={styles.refText}>
                  {t('againstBill')} {inv.ref_invoice_no}
                </Text>
              </Pressable>
            ) : null}
            {isQuotation && inv.ref_invoice_id ? (
              <Pressable onPress={() => router.push(`/bill/${inv.ref_invoice_id}`)} hitSlop={10} style={styles.refLink}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.refText}>
                  {t('q_convertedTo')} {inv.ref_invoice_no}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.moneyBox}>
              <View style={styles.flexOnly}>
                <Text style={styles.moneyLabel}>{t('totalAmount')}</Text>
                <Text style={[styles.moneyValue, cancelled && styles.strike]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatPaise(inv.total_paise)}
                </Text>
              </View>
              {!isCn && !isQuotation && !cancelled ? (
                <View style={styles.flexOnly}>
                  <Text style={styles.moneyLabel}>{t('balanceDue')}</Text>
                  <Text
                    style={[styles.moneyValue, { color: balance > 0 ? colors.danger : colors.success }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatPaise(Math.max(balance, 0))}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Original / Duplicate / Triplicate — applies to Share and Print */}
            <View style={styles.copyRow}>
              <Text style={styles.copyLabel}>{t('invoiceCopy')}</Text>
              <View style={styles.chips}>
                {COPIES.map((c) => (
                  <Pressable
                    key={c.kind}
                    onPress={() => setCopy(c.kind)}
                    style={[styles.chip, copy === c.kind && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, copy === c.kind && styles.chipTextActive]} numberOfLines={1}>
                      {t(c.key)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.actions}>
              <ActionBtn
                primary
                icon="share-social-outline"
                label={t('v2_share')}
                busy={busy === 'share'}
                onPress={() => run('share')}
              />
              {!cancelled ? (
                <ActionBtn
                  icon="logo-whatsapp"
                  iconColor="#1DA851"
                  label={t('whatsapp')}
                  busy={busy === 'whatsapp'}
                  onPress={onWhatsapp}
                />
              ) : null}
              <ActionBtn icon="print-outline" label={t('print')} busy={busy === 'print'} onPress={() => run('print')} />
            </View>
          </Card>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Scan to Pay */}
          {showQr && qrUri ? (
            <Card>
              <View style={styles.qrWrap}>
                <Text style={styles.qrTitle}>{t('scanToPay')}</Text>
                <Image source={{ uri: qrUri }} style={styles.qr} />
                <Text style={styles.qrAmount}>{formatPaise(balance)}</Text>
                <Text style={styles.qrUpi}>{upiId}</Text>
              </View>
            </Card>
          ) : null}

          {/* Party */}
          <Card>
            <Text style={styles.cardLabel}>{t('party')}</Text>
            <Pressable
              disabled={!inv.party_id}
              hitSlop={10}
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
            {lines.map((l, idx) => (
              <View key={l.id} style={[styles.line, idx === lines.length - 1 && { borderBottomWidth: 0 }]}>
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
          {!isCn && !isQuotation ? (
            <Card>
              <Text style={styles.cardLabel}>{t('payments')}</Text>
              {payments.length === 0 ? <Text style={styles.meta}>{t('noPayments')}</Text> : null}
              {payments.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Hairline /> : null}
                  <MenuRow
                    icon="checkmark-circle"
                    iconBg={colors.successSoft}
                    iconFg={colors.success}
                    title={formatPaise(p.amount_paise)}
                    subtitle={`${formatDate(p.paid_on)} · ${t(p.mode)}${p.notes ? ` · ${p.notes}` : ''}`}
                    right={
                      <Pressable onPress={() => onDeletePayment(p)} hitSlop={8} style={styles.payDel}>
                        <Ionicons name="trash-outline" size={18} color={colors.faint} />
                      </Pressable>
                    }
                  />
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

          {/* Actions (edit/preview stay in scroll; WhatsApp/Print/Share are fixed on top) */}
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
          {isQuotation && !cancelled ? (
            <Button
              icon="document-text"
              label={t('q_convertToBill')}
              onPress={onConvert}
              loading={busy === 'convert'}
            />
          ) : null}
          {!isCn && !isQuotation && !cancelled ? (
            <Button
              variant="outline"
              icon="return-down-back-outline"
              label={t('creditNote')}
              onPress={() => router.push({ pathname: '/bill/credit', params: { invoiceId: inv.id } })}
            />
          ) : null}
          {!isCn && !isQuotation && !cancelled ? (
            <Button
              variant="outline"
              icon="arrow-undo-outline"
              label={t('createSalesReturn')}
              onPress={() => router.push({ pathname: '/returns/sales', params: { invoiceId: inv.id } })}
            />
          ) : null}
          {!cancelled ? <Button variant="danger" icon="close-circle-outline" label={t('cancelBill')} onPress={onCancel} /> : null}
        </ScrollView>
      </SafeAreaView>
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

function ActionBtn({
  icon,
  label,
  onPress,
  busy,
  primary,
  iconColor,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  busy?: boolean;
  primary?: boolean;
  iconColor?: string;
}) {
  const fg = primary ? colors.white : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.actBtn, primary && styles.actBtnPrimary, (pressed || busy) && { opacity: 0.75 }]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.white : colors.primary} />
      ) : (
        <>
          <Ionicons name={icon} size={16} color={iconColor ?? (primary ? colors.white : colors.textSecondary)} />
          <Text style={[styles.actText, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  topZone: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 10 },
  summaryCard: { gap: 2 },
  summaryParty: { fontSize: text.lg, lineHeight: 22, fontWeight: '700', color: colors.text, marginTop: 4 },
  partyLine: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  moneyBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 10,
  },
  moneyLabel: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  moneyValue: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  actBtn: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  actBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actText: { fontSize: text.sm, fontWeight: '500', flexShrink: 1 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  copyLabel: {
    fontSize: text.xs,
    fontWeight: '500',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chips: { flex: 1, flexDirection: 'row', gap: 3, backgroundColor: colors.divider, borderRadius: radius.md + 2, padding: 3 },
  chip: {
    flex: 1,
    height: 30,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipActive: {
    backgroundColor: colors.card,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipText: { fontSize: text.xs, fontWeight: '500', color: colors.muted },
  chipTextActive: { color: colors.text, fontWeight: '700' },
  cancelBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    borderRadius: radius.md,
  },
  cancelText: { fontSize: text.sm, fontWeight: '500', color: colors.muted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  docType: { fontSize: text.xs, fontWeight: '500', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  strike: { textDecorationLine: 'line-through', color: colors.faint },
  refLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  refText: { fontSize: text.sm, fontWeight: '500', color: colors.primary },
  cardLabel: { fontSize: text.xs, fontWeight: '500', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  partyName: { fontSize: text.md, fontWeight: '500', color: colors.text, marginTop: -6 },
  meta: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  line: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  lineName: { fontSize: text.md, fontWeight: '500', color: colors.text },
  lineAmt: { fontSize: text.md, fontWeight: '500', color: colors.text, fontVariant: ['tabular-nums'] },
  rowLabel: { fontSize: text.sm, color: colors.muted, flexShrink: 1 },
  rowValue: { fontSize: text.sm, color: colors.text, fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700', color: colors.text, fontSize: text.md },
  divider: { height: 1, backgroundColor: colors.border },
  payDel: { padding: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  wa: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#25D366',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waText: { color: colors.white, fontSize: text.md, fontWeight: '700' },
  qrWrap: { alignItems: 'center', paddingVertical: 8 },
  qrTitle: { fontSize: text.md, fontWeight: '500', color: colors.text, marginBottom: 12 },
  qr: { width: 200, height: 200, borderRadius: radius.sm },
  qrAmount: { marginTop: 12, fontSize: text.xl, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  qrUpi: { marginTop: 4, fontSize: text.sm, color: colors.muted },
});
