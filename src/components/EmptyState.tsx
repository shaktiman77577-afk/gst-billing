import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, text } from '../theme';
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
  wrap: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: text.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  hint: { fontSize: text.sm, color: colors.muted, textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  badgeText: { fontSize: text.xs, fontWeight: '600', color: colors.warning },
});
