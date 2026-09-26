import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../theme';

// Floating "+ Add" button at the bottom-right of list screens.
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}>
      <Ionicons name="add" size={22} color={colors.white} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: radius.pill,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  label: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
