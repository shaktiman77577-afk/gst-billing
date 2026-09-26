import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../src/components/ui';
import { useApp } from '../src/context/AppContext';
import { Language, STRINGS } from '../src/i18n/strings';
import { colors } from '../src/theme';

const OPTIONS: { value: Language; title: string; sample: string }[] = [
  { value: 'en', title: 'English', sample: 'Create invoice' },
  { value: 'hi', title: 'Hinglish', sample: 'Naya bill banayein' },
];

export default function LanguageScreen() {
  const { language, chooseLanguage } = useApp();
  const [selected, setSelected] = useState<Language>(language ?? 'en');
  const t = STRINGS[selected];

  const onContinue = async () => {
    await chooseLanguage(selected);
    router.replace('/');
  };

  return (
    <Screen>
      <View style={styles.brand}>
        <Text style={styles.appName}>{t.appName}</Text>
        <Text style={styles.tagline}>{t.tagline}</Text>
      </View>
      <Text style={styles.heading}>{t.chooseLanguage}</Text>
      {OPTIONS.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => setSelected(o.value)}
          style={[styles.option, selected === o.value && styles.optionSelected]}
        >
          <Text style={styles.optionTitle}>{o.title}</Text>
          <Text style={styles.optionSample}>{o.sample}</Text>
        </Pressable>
      ))}
      <Text style={styles.hint}>{t.chooseLanguageHint}</Text>
      <Button label={t.continue} onPress={onContinue} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: 40, marginBottom: 32 },
  appName: { fontSize: 32, fontWeight: '700', color: colors.primary },
  tagline: { fontSize: 16, color: colors.muted, marginTop: 4 },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
  option: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.card,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  optionSample: { fontSize: 14, color: colors.muted, marginTop: 2 },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center', marginVertical: 8 },
});
