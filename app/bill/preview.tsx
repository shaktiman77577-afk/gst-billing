import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { FormHeader } from '../../src/components/FormHeader';
import { Button } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { getInvoice, Invoice, InvoiceLine } from '../../src/db/invoices';
import { useBusiness } from '../../src/hooks/useBusiness';
import { forPreview, invoiceHtml, printBill, sharePdf } from '../../src/pdf/share';
import { colors, radius } from '../../src/theme';

export default function BillPreviewScreen() {
  const db = useSQLiteContext();
  const { t } = useApp();
  const business = useBusiness();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ invoice: Invoice; lines: InvoiceLine[] } | null>(null);
  const [busy, setBusy] = useState<'share' | 'print' | null>(null);

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
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <View style={styles.flexOnly}>
          <Button variant="outline" icon="print-outline" label={t('print')} onPress={() => run('print')} loading={busy === 'print'} />
        </View>
        <View style={styles.flexOnly}>
          <Button icon="share-social-outline" label={t('sharePdf')} onPress={() => run('share')} loading={busy === 'share'} />
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
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
