import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, Field, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { setInvoicePrefix } from '../../src/db/businesses';
import { nextInvoiceNo } from '../../src/db/invoices';
import { useBusiness } from '../../src/hooks/useBusiness';
import { todayIso } from '../../src/lib/dates';
import { colors, radius } from '../../src/theme';

const PREFIX = /^[A-Z0-9-]{1,6}$/;

export default function BillSettingsScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
  const [prefix, setPrefix] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (business && !prefix) setPrefix(business.invoice_prefix);
  }, [business, prefix]);

  useEffect(() => {
    if (!businessId || !PREFIX.test(prefix)) return;
    nextInvoiceNo(db, businessId, prefix, todayIso()).then((n) => setPreview(n.invoiceNo));
  }, [db, businessId, prefix]);

  const onSave = async () => {
    if (!PREFIX.test(prefix)) return setError(t('errPrefix'));
    if (!businessId) return;
    setSaving(true);
    try {
      await setInvoicePrefix(db, businessId, prefix);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('billSettings')} />
      <Screen
        edges={['bottom']}
        footer={<Button label={t('save')} icon="checkmark-circle" onPress={onSave} loading={saving} />}
      >
        <Card>
          <SectionHeader icon="document-text" title={t('invoicePrefix')} subtitle={t('prefixHint')} />
          <Field
            label={t('invoicePrefix')}
            value={prefix}
            onChangeText={(v) => {
              setPrefix(v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 6));
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            icon="pricetag-outline"
            error={error}
          />
          {PREFIX.test(prefix) && preview ? (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>{t('nextBillNo')}</Text>
              <Text style={styles.previewValue}>{preview}</Text>
            </View>
          ) : null}
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  preview: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12, gap: 2 },
  previewLabel: { fontSize: 12, color: colors.muted },
  previewValue: { fontSize: 20, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
});
