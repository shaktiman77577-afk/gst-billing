import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { FormHeader } from '../../src/components/FormHeader';
import { Button } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { getInvoice, Invoice, InvoiceLine } from '../../src/db/invoices';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { billWhatsappText, forPreview, invoiceHtml, printBill, sharePdf, sharePdfOnWhatsApp } from '../../src/pdf/share';
import { colors, radius } from '../../src/theme';

export default function BillPreviewScreen() {
  const db = useSQLiteContext();
  const { t } = useApp();
  const business = useBusiness();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ invoice: Invoice; lines: InvoiceLine[] } | null>(null);
  const [busy, setBusy] = useState<'share' | 'print' | 'whatsapp' | null>(null);

  useEffect(() => {
    getInvoice(db, id).then(setData);
  }, [db, id]);

  const html = useMemo(
    () => (business && data ? invoiceHtml(business, data.invoice, data.lines) : null),
    [business, data],
  );

  const run = async (kind: 'share' | 'print') => {
    if (!html || !data) return;
    setBusy(kind);
    try {
      if (kind === 'share') await sharePdf(html, data.invoice.invoice_no);
      else await printBill(html);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) Alert.alert(t('appName'), t('pdfError'));
    } finally {
      setBusy(null);
    }
  };

  const onWhatsapp = async () => {
    if (!html || !data || !business) return;
    const inv = data.invoice;
    setBusy('whatsapp');
    try {
      const balance = inv.total_paise - inv.received_paise - inv.credited_paise;
      const caption = billWhatsappText(t, {
        name: inv.party_name,
        no: inv.invoice_no,
        date: formatDate(inv.invoice_date),
        amount: formatPaise(inv.total_paise),
        balance: inv.kind !== 'credit_note' && balance > 0 ? formatPaise(balance) : undefined,
        business: business.name,
      });
      await sharePdfOnWhatsApp(html, inv.invoice_no, inv.party_phone, caption);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) Alert.alert(t('appName'), t('pdfError'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={data?.invoice.invoice_no ?? t('preview')} />
      <View style={styles.previewWrap}>
        {html ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: forPreview(html) }}
            style={styles.web}
            scalesPageToFit
            setBuiltInZoomControls
            setDisplayZoomControls={false}
          />
        ) : null}
      </View>
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {data && !data.invoice.cancelled_at ? (
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
        <View style={styles.bar}>
          <View style={styles.flexOnly}>
            <Button variant="outline" icon="print-outline" label={t('print')} onPress={() => run('print')} loading={busy === 'print'} />
          </View>
          <View style={styles.flexOnly}>
            <Button icon="share-social-outline" label={t('sharePdf')} onPress={() => run('share')} loading={busy === 'share'} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  previewWrap: { flex: 1, margin: 12, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.white },
  web: { flex: 1, backgroundColor: colors.white },
  bar: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingTop: 12,
  },
  footer: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  wa: {
    marginHorizontal: 16,
    marginTop: 12,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#25D366',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
