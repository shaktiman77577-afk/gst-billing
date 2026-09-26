import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { IconName } from './ui';

export function EmptyState({
  icon,
  title,
  hint,
  badge,
}: {
  icon: IconName;
  title: string;
  hint: string;
  badge?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {badge ? (
        <View style={styles.badge}>
          <Ionicons name="time-outline" size={14} color={colors.warning} />
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, gap: 8 },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  hint: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.warning },
});
