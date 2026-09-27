// Trigger pill for the DateRangePicker: shows the current range (preset name +
// date sublabel), or "Dates"/"Tareekh" when nothing is chosen. Optional clear
// (×) resets to null when the caller supports an unfiltered state.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useApp } from '../context/AppContext';
import { DR_PRESET_LABELS, drT } from '../i18n/parity_daterange';
import { DateRange } from '../lib/dateRange';
import { formatRange } from '../lib/reports';
import { colors, radius, text } from '../theme';

type Props = {
  range: DateRange | null;
  onPress: () => void;
  onClear?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function DateRangeButton({ range, onPress, onClear, style }: Props) {
  const { language } = useApp();
  const tr = drT(language);
  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
        <View style={styles.texts}>
          <Text style={styles.label} numberOfLines={1}>
            {range ? tr(DR_PRESET_LABELS[range.preset]) : tr('dr_filter')}
          </Text>
          {range ? (
            <Text style={styles.sub} numberOfLines={1}>
              {formatRange(range.from, range.to)}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={15} color={colors.faint} />
      </Pressable>
      {range && onClear ? (
        <Pressable onPress={onClear} hitSlop={10} style={styles.clear}>
          <Ionicons name="close-circle" size={20} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
  },
  texts: { maxWidth: 220 },
  label: { fontSize: text.sm, fontWeight: '700', color: colors.text },
  sub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  clear: { padding: 4 },
});
