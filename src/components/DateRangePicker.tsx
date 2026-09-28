// Bottom-sheet date-range picker. Lists the 12 presets with computed date
// sublabels; "Custom range" expands two date fields. Returns the chosen
// { preset, from, to } (or null when the caller allows clearing).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useApp } from '../context/AppContext';
import { DateField } from './DateField';
import { Button } from './ui';
import { DR_PRESET_LABELS } from '../lib/dateRange';
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
  const { t, language } = useApp();
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
      setError(t('dr_invalidRange'));
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
          {showCustom ? (
            // Custom range gets its own panel so the From/To fields are always
            // on screen (they used to open below the list, out of view).
            <View style={styles.custom}>
              <View style={styles.customHead}>
                <Pressable onPress={() => setShowCustom(false)} hitSlop={10} style={styles.backBtn}>
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </Pressable>
                <Text style={[styles.title, styles.customTitle]}>{t(DR_PRESET_LABELS.custom)}</Text>
                <View style={styles.backBtn} />
              </View>
              <View style={styles.customRow}>
                <DateField
                  label={t('dr_from')}
                  value={from}
                  onChange={(v) => {
                    if (v) {
                      setFrom(v);
                      setError(null);
                    }
                  }}
                />
                <DateField
                  label={t('dr_to')}
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
              <Button label={t('dr_apply')} onPress={applyCustom} />
            </View>
          ) : (
            <>
              <Text style={styles.title}>{t('dr_title')}</Text>
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {DATE_PRESETS.map((p) => {
                  const range = p === 'custom' ? null : presetRange(p);
                  const selected = value?.preset === p;
                  return (
                    <Pressable key={p} onPress={() => pick(p)} style={[styles.row, selected && styles.rowSelected]}>
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
                      </View>
                      <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                          {t(DR_PRESET_LABELS[p])}
                        </Text>
                        {range ? <Text style={styles.rowSub}>{formatRange(range.from, range.to)}</Text> : null}
                        {p === 'custom' && value?.preset === 'custom' ? (
                          <Text style={styles.rowSub}>{formatRange(value.from, value.to)}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={selected ? colors.primary : colors.faint} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
          {allowClear && value ? (
            <Button variant="text" label={t('dr_clear')} onPress={() => onApply(null)} />
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: { fontSize: text.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  list: { marginHorizontal: -4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    minHeight: 48,
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
  rowLabel: { fontSize: text.md, fontWeight: '500', color: colors.text },
  rowLabelSelected: { color: colors.primary, fontWeight: '700' },
  rowSub: { fontSize: text.xs, color: colors.muted, marginTop: 2 },
  custom: { gap: 16, paddingBottom: 4 },
  customHead: { flexDirection: 'row', alignItems: 'center' },
  customTitle: { flex: 1 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  customRow: { flexDirection: 'row', gap: 12 },
  error: { fontSize: text.sm, color: colors.danger, fontWeight: '500' },
});
