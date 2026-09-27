import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { STATES, stateName } from '../data/states';
import { colors, radius, text } from '../theme';

type Props = {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  value: string | null;
  onChange: (code: string) => void;
  error?: string | null;
};

export function StatePicker({ label, placeholder, searchPlaceholder, value, onChange, error }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? STATES.filter((s) => s.name.toLowerCase().includes(q)) : STATES;
  }, [query]);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.box, error ? { borderColor: colors.danger } : null]}
      >
        <Ionicons name="location-outline" size={18} color={colors.faint} style={{ marginRight: 8 }} />
        <Text style={[styles.flex, value ? styles.value : styles.placeholder]}>
          {value ? stateName(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.faint} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.muted}
              style={styles.search}
            />
            <Pressable onPress={() => setOpen(false)} style={styles.close} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(s) => s.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.code);
                  setQuery('');
                  setOpen(false);
                }}
                style={[styles.row, item.code === value && styles.rowSelected]}
              >
                <Text style={styles.rowText}>{item.name}</Text>
                {item.code === value ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                ) : (
                  <Text style={styles.code}>{item.code}</Text>
                )}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: text.sm, fontWeight: '600', color: colors.text, marginBottom: 6 },
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: { fontSize: text.md, color: colors.text },
  placeholder: { fontSize: text.md, color: colors.muted },
  error: { color: colors.danger, fontSize: text.sm, marginTop: 4 },
  modal: { flex: 1, backgroundColor: colors.card },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  close: { padding: 10 },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowSelected: { backgroundColor: colors.primaryLight },
  rowText: { fontSize: text.md, color: colors.text },
  code: { fontSize: 14, color: colors.muted },
});
