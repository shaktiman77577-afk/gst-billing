import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { FormHeader } from '../../src/components/FormHeader';
import { AppAlert } from '../../src/components/AppDialog';
import { Button, Overline } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { setTemplateDesign } from '../../src/db/businesses';
import { useBusiness } from '../../src/hooks/useBusiness';
import { useMembership } from '../../src/hooks/useMembership';
import { buildDoc } from '../../src/pdf/data';
import { sampleInvoice } from '../../src/pdf/sample';
import { forPreview } from '../../src/pdf/share';
import { renderInvoiceHtml, TEMPLATES, THEME_COLORS } from '../../src/pdf/templates';
import { colors, radius, spacing, text } from '../../src/theme';

export default function TemplateScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
  const mem = useMembership();
  const isPro = mem.status === 'pro';
  const [template, setTemplate] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (business && template === null) {
      setTemplate(business.template);
      setColor(business.theme_color);
    }
  }, [business, template]);

  const html = useMemo(() => {
    if (!business || !template || !color) return null;
    const { invoice, lines } = sampleInvoice(business);
    return forPreview(renderInvoiceHtml(buildDoc(business, invoice, lines, { color }), template));
  }, [business, template, color]);

  const chosen = TEMPLATES.find((x) => x.id === template);
  const locked = !!chosen?.premium && !isPro;

  const onSave = async () => {
    if (!businessId || !template || !color) return;
    if (locked) {
      // Free users can preview every design, but only the free ones print.
      AppAlert.alert(t('v2_tplLockedTitle'), t('v2_tplLockedMsg'), [
        { text: t('v2_close'), style: 'cancel' },
        { text: t('v2_seePro'), onPress: () => router.push('/settings/membership') },
      ]);
      return;
    }
    setSaving(true);
    try {
      await setTemplateDesign(db, businessId, template, color);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('billDesign')} />
      <View style={styles.previewWrap}>
        {html ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            style={styles.web}
            scalesPageToFit
            setBuiltInZoomControls
            setDisplayZoomControls={false}
          />
        ) : null}
      </View>
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        {(['A4', 'A5'] as const).map((size) => (
          <View key={size} style={styles.group}>
            <Overline>{size === 'A4' ? t('v2_tplA4') : t('v2_tplA5')}</Overline>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {TEMPLATES.filter((tp) => tp.size === size).map((tp) => {
                const active = tp.id === template;
                const lockedChip = tp.premium && !isPro;
                return (
                  <Pressable
                    key={tp.id}
                    onPress={() => setTemplate(tp.id)}
                    hitSlop={6}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    {lockedChip ? <Ionicons name="lock-closed" size={12} color={active ? colors.primary : colors.warning} /> : null}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{tp.name}</Text>
                    {!tp.premium ? <Text style={styles.freeTag}>{t('v2_free')}</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ))}
        {locked ? <Text style={styles.premium}>{t('v2_tplLockedHint')}</Text> : null}
        <Overline>{t('colour')}</Overline>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colors}>
          {THEME_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              hitSlop={8}
              style={[styles.dot, { backgroundColor: c }]}
            >
              {c === color ? <Ionicons name="checkmark" size={22} color={colors.white} /> : null}
            </Pressable>
          ))}
        </ScrollView>
        <Button label={t('save')} onPress={onSave} loading={saving} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  previewWrap: { flex: 1, margin: 12, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  web: { flex: 1, backgroundColor: colors.white },
  panel: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  group: { gap: 6 },
  label: { fontSize: 12, fontWeight: '500', color: colors.muted },
  chips: { gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: text.sm, fontWeight: '500', color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  freeTag: { fontSize: 10, fontWeight: '500', color: colors.success, backgroundColor: colors.successSoft, paddingHorizontal: 5, borderRadius: 4, overflow: 'hidden' },
  premium: { fontSize: 12, lineHeight: 16, color: colors.warning },
  colors: { gap: 12, paddingVertical: 2 },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
