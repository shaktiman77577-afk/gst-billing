import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { colors, radius, shadowLg, spacing, text } from '../theme';

// Floating "+ Add" button at the bottom-right of list screens.
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}>
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
