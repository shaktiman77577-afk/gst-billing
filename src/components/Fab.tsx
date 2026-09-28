import Ionicons from '@expo/vector-icons/Ionicons';
import { useSegments } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { colors, radius, shadowLg, spacing, text } from '../theme';

// Floating "+ Add" button at the bottom-right of list screens.
// On tab screens the tab bar already sits above the phone's navigation bar;
// on other screens (Challans, Proforma, Purchases…) the button is lifted
// above the navigation bar itself.
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const inTabs = useSegments()[0] === '(tabs)';
  const insets = useSafeAreaInsets();
  const bottom = spacing.lg + (inTabs ? 0 : insets.bottom);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, { bottom }, pressed && { opacity: 0.9 }]}>
      <Ionicons name="add" size={20} color={colors.white} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    height: 48,
    borderRadius: radius.lg,
    ...shadowLg,
  },
  label: { color: colors.white, fontSize: text.md, fontWeight: '500' },
});
