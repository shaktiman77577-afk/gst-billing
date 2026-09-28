import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { Text } from '../../src/components/Text';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, Field, MenuRow, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { updateBillDesign } from '../../src/db/businesses';
import { getInvoiceNextSeq, setInvoiceNextSeq } from '../../src/db/invoices';
import { useBusiness } from '../../src/hooks/useBusiness';
import { todayIso } from '../../src/lib/dates';
import { financialYear, invoiceNumber } from '../../src/lib/gst';
import { pickImage } from '../../src/lib/pickImage';
import { DEFAULT_TERMS } from '../../src/pdf/data';
import { TEMPLATES } from '../../src/pdf/templates';
import { colors, radius } from '../../src/theme';

const PREFIX_ALLOWED = /^[A-Z0-9/\-_ ]{1,20}$/;
// Free text: letters, numbers, /, -, _, space — max 20 chars.
const normalizePrefixInput = (v: string) =>
  v.toUpperCase().replace(/[^A-Z0-9/\-_ ]/g, '').slice(0, 20);
const finalizePrefix = (v: string) => v.trim().replace(/[/\s]+$/, '');
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const clean = (v: string) => (v.trim() ? v.trim() : null);

export default function BillSettingsScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
  const [loaded, setLoaded] = useState(false);
  const [prefix, setPrefix] = useState('INV');
  const [nextSeq, setNextSeq] = useState('');
  const [nextSeqSeed, setNextSeqSeed] = useState(1);
  const [tagline, setTagline] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [accName, setAccName] = useState('');
  const [accNo, setAccNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [upi, setUpi] = useState('');
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [errors, setErrors] = useState<{ prefix?: string; ifsc?: string; nextSeq?: string }>({});
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
    if (!businessId) return;
    // Seed the "next bill number" from the current counter (max used + 1).
    getInvoiceNextSeq(db, businessId, todayIso(), 'invoice').then((n) => {
      setNextSeq(String(n.seq));
      setNextSeqSeed(n.seq);
    });
  }, [db, businessId]);

  // Live preview of the full next bill number from the entered values.
  const cleanPrefix = finalizePrefix(prefix);
  const parsedNext = /^\d+$/.test(nextSeq.trim()) ? parseInt(nextSeq.trim(), 10) : NaN;
  const previewNo =
    PREFIX_ALLOWED.test(cleanPrefix) && parsedNext >= 1
      ? invoiceNumber(cleanPrefix, financialYear(todayIso()), parsedNext)
      : '';

  const choose = async (kind: 'logo' | 'signature') => {
    const img = await pickImage(kind === 'logo' ? [1, 1] : [3, 1]);
    if (img === 'too-big') return AppAlert.alert(t('appName'), t('imageTooBig'));
    if (!img) return;
    if (kind === 'logo') setLogo(img);
    else setSignature(img);
  };

  const onSave = async () => {
    const e: typeof errors = {};
    const cp = finalizePrefix(prefix);
    if (!PREFIX_ALLOWED.test(cp)) e.prefix = t('errPrefix');
    const ns = /^\d+$/.test(nextSeq.trim()) ? parseInt(nextSeq.trim(), 10) : NaN;
    if (!(ns >= 1)) e.nextSeq = t('errNextSeq');
    if (ifsc && !IFSC.test(ifsc)) e.ifsc = 'IFSC: ABCD0123456';
    setErrors(e);
    if (Object.keys(e).length || !business || !businessId) return;
    setSaving(true);
    try {
      await updateBillDesign(db, businessId, {
        invoicePrefix: cp,
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
      // Persist a raised "next bill number" so future auto numbers start there.
      if (ns !== nextSeqSeed) {
        await setInvoiceNextSeq(db, businessId, financialYear(todayIso()), 'invoice', ns);
      }
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
        <Card list>
          <MenuRow
            icon="color-palette"
            iconBg={business?.theme_color ?? colors.primary}
            iconFg={colors.white}
            title={t('billDesign')}
            subtitle={`${tpl.name}${tpl.premium ? ' 👑' : ''} · ${t('billDesignHint')}`}
            onPress={() => router.push('/settings/template')}
          />
        </Card>

        {/* Number */}
        <Card>
          <SectionHeader icon="document-text" title={t('invoicePrefix')} subtitle={t('prefixHint')} />
          <Field
            label={t('invoicePrefix')}
            value={prefix}
            onChangeText={(v) => setPrefix(normalizePrefixInput(v))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            icon="pricetag-outline"
            error={errors.prefix}
          />
          <Field
            label={t('nextBillNo')}
            value={nextSeq}
            onChangeText={(v) => setNextSeq(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            icon="list-outline"
            error={errors.nextSeq}
          />
          {previewNo ? (
            <View style={styles.preview}>
              <Text style={styles.muted}>{t('billNoPreview')}</Text>
              <Text style={styles.previewValue}>{previewNo}</Text>
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
          <Pressable onPress={onPick} hitSlop={10}>
            <Text style={styles.link}>{t('choosePhoto')}</Text>
          </Pressable>
          {uri ? (
            <Pressable onPress={onRemove} hitSlop={10}>
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
  preview: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12, gap: 2 },
  previewValue: { fontSize: 18, fontWeight: '800', color: colors.primary, letterSpacing: 0.1 },
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
