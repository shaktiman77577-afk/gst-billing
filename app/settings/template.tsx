import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { FormHeader } from '../../src/components/FormHeader';
import { Button } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { setTemplateDesign } from '../../src/db/businesses';
import { useBusiness } from '../../src/hooks/useBusiness';
import { buildDoc } from '../../src/pdf/data';
import { sampleInvoice } from '../../src/pdf/sample';
import { forPreview } from '../../src/pdf/share';
import { renderInvoiceHtml, TEMPLATES, THEME_COLORS } from '../../src/pdf/templates';
import { colors, radius } from '../../src/theme';

export default function TemplateScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const business = useBusiness();
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

  const onSave = async () => {
    if (!businessId || !template || !color) return;
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
        <Text style={styles.label}>{t('template')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {TEMPLATES.map((tp) => {
            const active = tp.id === template;
            return (
              <Pressable
                key={tp.id}
                onPress={() => setTemplate(tp.id)}
                hitSlop={8}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {tp.name}
                  {tp.premium ? ' 👑' : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {TEMPLATES.find((x) => x.id === template)?.premium ? (
          <Text style={styles.premium}>{t('premiumFree')}</Text>
        ) : null}
        <Text style={styles.label}>{t('colour')}</Text>
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
        <Button label={t('save')} icon="checkmark-circle" onPress={onSave} loading={saving} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  previewWrap: { flex: 1, margin: 12, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.white },
  web: { flex: 1, backgroundColor: colors.white },
  panel: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted },
  chips: { gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  premium: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: -4 },
  colors: { gap: 12, paddingVertical: 2 },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
