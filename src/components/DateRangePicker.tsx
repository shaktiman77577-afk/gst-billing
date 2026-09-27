// Bottom-sheet date-range picker. Lists the 12 presets with computed date
// sublabels; "Custom range" expands two date fields. Returns the chosen
// { preset, from, to } (or null when the caller allows clearing).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { DateField } from './DateField';
import { Button } from './ui';
import { DR_PRESET_LABELS, drT } from '../i18n/parity_daterange';
import { DATE_PRESETS, DatePreset, DateRange, presetRange, todayIso } from '../lib/dateRange';
import { formatRange } from '../lib/reports';
import { colors, radius, shadow, text } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  value: DateRange | null;
  onApply: (range: DateRange | null) => void;
  /** Show a "Clear" action when a range is set. Defaults to true. */
  allowClear?: boolean;
};

export function DateRangePicker({ visible, onClose, value, onApply, allowClear = true }: Props) {
  const { language } = useApp();
  const tr = drT(language);
  const [showCustom, setShowCustom] = useState(value?.preset === 'custom');
  const [from, setFrom] = useState(value?.from ?? todayIso());
  const [to, setTo] = useState(value?.to ?? todayIso());
  const [error, setError] = useState<string | null>(null);

  // Snapshot the current selection each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setShowCustom(value?.preset === 'custom');
      setFrom(value?.from ?? todayIso());
      setTo(value?.to ?? todayIso());
      setError(null);
    }
  }, [visible, value]);

  const pick = (preset: DatePreset) => {
    if (preset === 'custom') {
      setShowCustom(true);
      setError(null);
      return;
    }
    const { from: f, to: t } = presetRange(preset);
    onApply({ preset, from: f, to: t });
  };

  const applyCustom = () => {
    if (from > to) {
      setError(tr('dr_invalidRange'));
      return;
    }
    onApply({ preset: 'custom', from, to });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{tr('dr_title')}</Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {DATE_PRESETS.map((p) => {
              const range = p === 'custom' ? null : presetRange(p);
              const selected = value?.preset === p;
              return (
                <View key={p}>
                  <Pressable
                    onPress={() => pick(p)}
                    style={[styles.row, selected && styles.rowSelected]}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                        {tr(DR_PRESET_LABELS[p])}
                      </Text>
                      {range ? (
                        <Text style={styles.rowSub}>{formatRange(range.from, range.to)}</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={selected ? colors.primary : colors.faint}
                    />
                  </Pressable>
                  {p === 'custom' && showCustom ? (
                    <View style={styles.custom}>
                      <View style={styles.customRow}>
                        <DateField
                          label={tr('dr_from')}
                          value={from}
                          onChange={(v) => {
                            if (v) {
                              setFrom(v);
                              setError(null);
                            }
                          }}
                        />
                        <DateField
                          label={tr('dr_to')}
                          value={to}
                          onChange={(v) => {
                            if (v) {
                              setTo(v);
                              setError(null);
                            }
                          }}
                        />
                      </View>
                      {error ? <Text style={styles.error}>{error}</Text> : null}
                      <Button label={tr('dr_apply')} icon="checkmark" onPress={applyCustom} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          {allowClear && value ? (
            <Button variant="text" label={tr('dr_clear')} onPress={() => onApply(null)} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  backdropPress: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 28,
    gap: 12,
    maxHeight: '82%',
    ...shadow,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  list: { marginHorizontal: -4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    minHeight: 56,
  },
  rowSelected: { backgroundColor: colors.primarySoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  rowText: { flex: 1 },
  rowLabel: { fontSize: text.md, fontWeight: '600', color: colors.text },
  rowLabelSelected: { color: colors.primary, fontWeight: '700' },
  rowSub: { fontSize: text.xs, color: colors.muted, marginTop: 2 },
  custom: { padding: 12, gap: 12, backgroundColor: colors.primaryTint, borderRadius: radius.md },
  customRow: { flexDirection: 'row', gap: 12 },
  error: { fontSize: text.sm, color: colors.danger, fontWeight: '600' },
});
