import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, Field, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { updateBillDesign } from '../../src/db/businesses';
import { nextInvoiceNo } from '../../src/db/invoices';
import { useBusiness } from '../../src/hooks/useBusiness';
import { todayIso } from '../../src/lib/dates';
import { pickImage } from '../../src/lib/pickImage';
import { DEFAULT_TERMS } from '../../src/pdf/data';
import { TEMPLATES } from '../../src/pdf/templates';
import { colors, radius } from '../../src/theme';

const PREFIX = /^[A-Z0-9-]{1,6}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const clean = (v: string) => (v.trim() ? v.trim() : null);

export default function BillSettingsScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
  const [loaded, setLoaded] = useState(false);
  const [prefix, setPrefix] = useState('INV');
  const [preview, setPreview] = useState('');
  const [tagline, setTagline] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [accName, setAccName] = useState('');
  const [accNo, setAccNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [upi, setUpi] = useState('');
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [errors, setErrors] = useState<{ prefix?: string; ifsc?: string }>({});
  const [saving, setSaving] = useState(false);

  // Fill the form once from the saved business.
  useEffect(() => {
    if (!business || loaded) return;
    setPrefix(business.invoice_prefix);
    setTagline(business.tagline ?? '');
    setLogo(business.logo);
    setSignature(business.signature);
    setAccName(business.bank_account_name ?? '');
    setAccNo(business.bank_account_no ?? '');
    setIfsc(business.bank_ifsc ?? '');
    setBankName(business.bank_name ?? '');
    setUpi(business.upi_id ?? '');
    setTerms(business.terms ?? DEFAULT_TERMS);
    setLoaded(true);
  }, [business, loaded]);

  useEffect(() => {
    if (!businessId || !PREFIX.test(prefix)) return;
    nextInvoiceNo(db, businessId, prefix, todayIso()).then((n) => setPreview(n.invoiceNo));
  }, [db, businessId, prefix]);

  const choose = async (kind: 'logo' | 'signature') => {
    const img = await pickImage(kind === 'logo' ? [1, 1] : [3, 1]);
    if (img === 'too-big') return Alert.alert(t('appName'), t('imageTooBig'));
    if (!img) return;
    if (kind === 'logo') setLogo(img);
    else setSignature(img);
  };

  const onSave = async () => {
    const e: typeof errors = {};
    if (!PREFIX.test(prefix)) e.prefix = t('errPrefix');
    if (ifsc && !IFSC.test(ifsc)) e.ifsc = 'IFSC: ABCD0123456';
    setErrors(e);
    if (Object.keys(e).length || !business || !businessId) return;
    setSaving(true);
    try {
      await updateBillDesign(db, businessId, {
        invoicePrefix: prefix,
        template: business.template,
        themeColor: business.theme_color,
        logo,
        signature,
        bankAccountName: clean(accName),
        bankAccountNo: clean(accNo),
        bankIfsc: clean(ifsc),
        bankName: clean(bankName),
        upiId: clean(upi),
        terms: terms.trim(),
        tagline: clean(tagline),
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const tpl = TEMPLATES.find((x) => x.id === business?.template) ?? TEMPLATES[0];

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('billSettings')} />
      <Screen
        edges={['bottom']}
        footer={<Button label={t('save')} icon="checkmark-circle" onPress={onSave} loading={saving} />}
      >
        {/* Design */}
        <Pressable onPress={() => router.push('/settings/template')}>
          <Card style={styles.designCard}>
            <View style={[styles.swatch, { backgroundColor: business?.theme_color ?? colors.primary }]}>
              <Ionicons name="color-palette" size={22} color={colors.white} />
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.designTitle}>{t('billDesign')}</Text>
              <Text style={styles.muted}>
                {tpl.name}
                {tpl.premium ? ' 👑' : ''} · {t('billDesignHint')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.faint} />
          </Card>
        </Pressable>

        {/* Number */}
        <Card>
          <SectionHeader icon="document-text" title={t('invoicePrefix')} subtitle={t('prefixHint')} />
          <Field
            label={t('invoicePrefix')}
            value={prefix}
            onChangeText={(v) => setPrefix(v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 6))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            icon="pricetag-outline"
            error={errors.prefix}
          />
          {PREFIX.test(prefix) && preview ? (
            <View style={styles.preview}>
              <Text style={styles.muted}>{t('nextBillNo')}</Text>
              <Text style={styles.previewValue}>{preview}</Text>
            </View>
          ) : null}
        </Card>

        {/* Logo & signature */}
        <Card>
          <SectionHeader icon="image" title={t('sectionLogo')} />
          <ImageRow label={t('logo')} uri={logo} square onPick={() => choose('logo')} onRemove={() => setLogo(null)} />
          <ImageRow
            label={t('signature')}
            uri={signature}
            onPick={() => choose('signature')}
            onRemove={() => setSignature(null)}
          />
          <Field
            label={t('taglineLabel')}
            optionalLabel={t('optional')}
            placeholder={t('taglinePlaceholder')}
            value={tagline}
            onChangeText={setTagline}
            maxLength={60}
          />
        </Card>

        {/* Bank & UPI */}
        <Card>
          <SectionHeader icon="card" title={t('sectionBank')} />
          <Field label={t('bankAccountName')} value={accName} onChangeText={setAccName} autoCapitalize="words" />
          <Field
            label={t('bankAccountNo')}
            value={accNo}
            onChangeText={(v) => setAccNo(v.replace(/\D/g, '').slice(0, 18))}
            keyboardType="number-pad"
          />
          <View style={styles.row}>
            <View style={styles.flexOnly}>
              <Field
                label={t('bankIfsc')}
                value={ifsc}
                onChangeText={(v) => setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                autoCapitalize="characters"
                error={errors.ifsc}
              />
            </View>
            <View style={styles.flexOnly}>
              <Field label={t('bankName')} value={bankName} onChangeText={setBankName} />
            </View>
          </View>
          <Field
            label={t('upiId')}
            placeholder="yourname@upi"
            value={upi}
            onChangeText={(v) => setUpi(v.replace(/\s/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
            icon="qr-code-outline"
            helper={upi.includes('@') ? t('upiHint') : null}
          />
        </Card>

        {/* Terms */}
        <Card>
          <SectionHeader icon="list" title={t('sectionTerms')} subtitle={t('termsHint')} />
          <Field
            label={t('sectionTerms')}
            value={terms}
            onChangeText={setTerms}
            multiline
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />
        </Card>
      </Screen>
    </View>
  );
}

function ImageRow({
  label,
  uri,
  square,
  onPick,
  onRemove,
}: {
  label: string;
  uri: string | null;
  square?: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  const { t } = useApp();
  return (
    <View style={styles.imgRow}>
      <Pressable onPress={onPick} style={[styles.imgBox, square ? styles.imgSquare : styles.imgWide]}>
        {uri ? (
          <Image source={{ uri }} style={styles.img} resizeMode="contain" />
        ) : (
          <Ionicons name="image-outline" size={26} color={colors.faint} />
        )}
      </Pressable>
      <View style={styles.flexOnly}>
        <Text style={styles.imgLabel}>{label}</Text>
        <View style={styles.imgActions}>
          <Pressable onPress={onPick} hitSlop={6}>
            <Text style={styles.link}>{t('choosePhoto')}</Text>
          </Pressable>
          {uri ? (
            <Pressable onPress={onRemove} hitSlop={6}>
              <Text style={[styles.link, { color: colors.danger }]}>{t('remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  muted: { fontSize: 12, color: colors.muted },
  designCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  designTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  preview: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12, gap: 2 },
  previewValue: { fontSize: 20, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  imgRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  imgBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imgSquare: { width: 72, height: 72 },
  imgWide: { width: 120, height: 48 },
  img: { width: '100%', height: '100%' },
  imgLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  imgActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  link: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
