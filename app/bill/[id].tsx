import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormHeader } from '../../src/components/FormHeader';
import { StatusBadge } from '../../src/components/StatusBadge';
import { Button, Card } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { stateName } from '../../src/data/states';
import { formatQty } from '../../src/db/items';
import { getInvoice, Invoice, InvoiceLine } from '../../src/db/invoices';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatDate } from '../../src/lib/dates';
import { amountInWords } from '../../src/lib/gst';
import { formatPaise } from '../../src/lib/money';
import { invoiceHtml, printBill, sharePdf, whatsappMessage } from '../../src/pdf/share';
import { colors, radius } from '../../src/theme';

export default function BillDetailScreen() {
  const db = useSQLiteContext();
  const { t } = useApp();
  const business = useBusiness();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ invoice: Invoice; lines: InvoiceLine[] } | null>(null);
  const [busy, setBusy] = useState<'share' | 'print' | null>(null);

  useFocusEffect(
    useCallback(() => {
      getInvoice(db, id).then(setData);
    }, [db, id]),
  );

  if (!data) return <View style={styles.flex} />;
  const { invoice: inv, lines } = data;
  const balance = inv.total_paise - inv.received_paise;

  const run = async (kind: 'share' | 'print') => {
    if (!business) return;
    setBusy(kind);
    try {
      const html = invoiceHtml(business, inv, lines);
      if (kind === 'share') await sharePdf(html, inv.invoice_no);
      else await printBill(html);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // Closing the print dialog is not an error.
      if (!/cancel/i.test(msg)) Alert.alert(t('appName'), t('pdfError'));
    } finally {
      setBusy(null);
    }
  };

  const onWhatsapp = () => {
    if (!inv.party_phone) return;
    let text = t('waMessage')
      .replace('{name}', inv.party_name)
      .replace('{no}', inv.invoice_no)
      .replace('{date}', formatDate(inv.invoice_date))
      .replace('{amount}', formatPaise(inv.total_paise));
    if (balance > 0) text += `\n${t('waBalance').replace('{balance}', formatPaise(balance))}`;
    if (business?.name) text += `\n\n– ${business.name}`;
    whatsappMessage(inv.party_phone, text).catch(() => undefined);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={inv.invoice_no} />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Summary */}
          <Card>
            <View style={styles.rowBetween}>
              <Text style={styles.docType}>{inv.doc_type === 'tax_invoice' ? t('taxInvoice') : t('billOfSupply')}</Text>
              <StatusBadge status={inv.status} />
            </View>
            <Text style={styles.total}>{formatPaise(inv.total_paise)}</Text>
            <Text style={styles.words}>{amountInWords(inv.total_paise)}</Text>
            <View style={styles.metaRow}>
              <Meta icon="calendar-outline" text={formatDate(inv.invoice_date)} />
              {inv.due_date ? <Meta icon="alarm-outline" text={`${t('dueDate')}: ${formatDate(inv.due_date)}`} /> : null}
            </View>
          </Card>

          {/* Party */}
          <Card>
            <Text style={styles.cardLabel}>{t('party')}</Text>
            <Text style={styles.partyName}>{inv.party_name}</Text>
            {inv.party_phone ? <Text style={styles.meta}>{inv.party_phone}</Text> : null}
            {inv.party_gstin ? <Text style={styles.meta}>GSTIN {inv.party_gstin}</Text> : null}
            {inv.billing_address ? <Text style={styles.meta}>{inv.billing_address}</Text> : null}
            {inv.doc_type === 'tax_invoice' ? (
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
                    {inv.doc_type === 'tax_invoice' ? ` · GST ${l.gst_rate}%` : ''}
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
            <Row label={t('received')} value={formatPaise(inv.received_paise)} color={colors.success} />
            <Row
              label={t('balanceDue')}
              value={formatPaise(Math.max(balance, 0))}
              color={balance > 0 ? colors.danger : colors.success}
              bold
            />
          </Card>

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

          <View style={styles.actions}>
            <View style={styles.flexOnly}>
              <Button
                variant="outline"
                icon="create-outline"
                label={t('edit')}
                onPress={() => router.push({ pathname: '/bill/new', params: { id: inv.id } })}
              />
            </View>
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
          {inv.party_phone ? (
            <Pressable onPress={onWhatsapp} style={({ pressed }) => [styles.wa, pressed && { opacity: 0.85 }]}>
              <Ionicons name="logo-whatsapp" size={22} color={colors.white} />
              <Text style={styles.waText}>{t('whatsapp')}</Text>
            </Pressable>
          ) : null}
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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  docType: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  total: { fontSize: 30, fontWeight: '800', color: colors.primary },
  words: { fontSize: 12, color: colors.muted, fontStyle: 'italic', marginTop: -6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  divider: { height: 1, backgroundColor: colors.border, borderRadius: radius.sm },
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
