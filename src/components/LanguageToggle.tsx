import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useApp } from '../context/AppContext';
import { Language } from '../i18n/strings';
import { colors, radius } from '../theme';

const OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'hi', label: 'Hinglish' },
];

// Small EN | Hinglish switch. `onDark` for use on the navy header.
export function LanguageToggle({ onDark = false }: { onDark?: boolean }) {
  const { language, chooseLanguage } = useApp();
  const current = language ?? 'en';
  return (
    <View style={[styles.wrap, onDark ? styles.wrapDark : styles.wrapLight]}>
      {OPTIONS.map((o) => {
        const active = o.value === current;
        return (
          <Pressable
            key={o.value}
            onPress={() => chooseLanguage(o.value)}
            style={[styles.option, active && (onDark ? styles.activeDark : styles.activeLight)]}
            hitSlop={6}
          >
            <Text
              style={[
                styles.label,
                { color: onDark ? 'rgba(255,255,255,0.8)' : colors.muted },
                active && { color: onDark ? colors.primary : colors.text },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: radius.md + 2, padding: 3, gap: 3 },
  wrapDark: { backgroundColor: 'rgba(255,255,255,0.15)' },
  wrapLight: { backgroundColor: colors.divider },
  option: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.md },
  activeDark: { backgroundColor: colors.white },
  activeLight: {
    backgroundColor: colors.card,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontSize: 13, fontWeight: '500' },
});
