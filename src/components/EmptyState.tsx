import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
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
        <Ionicons name={icon} size={26} color={colors.primary} />
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
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: text.md, fontWeight: '700', color: colors.text, textAlign: 'center' },
  hint: { fontSize: text.sm, color: colors.muted, textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  badgeText: { fontSize: text.xs, fontWeight: '500', color: colors.warning },
});
