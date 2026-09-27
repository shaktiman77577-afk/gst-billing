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
                active && { color: onDark ? colors.primary : colors.white },
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
  wrap: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  wrapDark: { backgroundColor: 'rgba(255,255,255,0.15)' },
  wrapLight: { backgroundColor: colors.primarySoft },
  option: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  activeDark: { backgroundColor: colors.white },
  activeLight: { backgroundColor: colors.primary },
  label: { fontSize: 13, fontWeight: '700' },
});
