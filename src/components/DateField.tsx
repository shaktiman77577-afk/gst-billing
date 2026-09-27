import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDate, fromIsoDate, toIsoDate } from '../lib/dates';
import { colors, radius, text } from '../theme';

type Props = {
  label: string;
  value: string | null; // YYYY-MM-DD
  onChange: (iso: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
};

export function DateField({ label, value, onChange, placeholder, clearable }: Props) {
  const [showIos, setShowIos] = useState(false);

  const open = () => {
    const current = value ? fromIsoDate(value) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toIsoDate(date));
        },
      });
    } else {
      setShowIos(true);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={open} style={styles.box}>
        <Ionicons name="calendar-outline" size={18} color={colors.faint} />
        <Text style={[styles.value, !value && { color: colors.faint }]} numberOfLines={1}>
          {value ? formatDate(value) : placeholder ?? '—'}
        </Text>
        {clearable && value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={12}>
            <Ionicons name="close-circle" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
      </Pressable>
      {showIos ? (
        <DateTimePicker
          value={value ? fromIsoDate(value) : new Date()}
          mode="date"
          onChange={(_, date) => {
            setShowIos(false);
            if (date) onChange(toIsoDate(date));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 6 },
  label: { fontSize: text.sm, fontWeight: '600', color: colors.text },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  value: { flex: 1, fontSize: text.md, color: colors.text },
});
