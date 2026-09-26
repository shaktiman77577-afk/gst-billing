import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { STATES, stateName } from '../data/states';
import { colors } from '../theme';

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
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? stateName(value) : placeholder}
        </Text>
        <Text style={styles.arrow}>▾</Text>
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
            <Pressable onPress={() => setOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
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
                <Text style={styles.code}>{item.code}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: { fontSize: 16, color: colors.text },
  placeholder: { fontSize: 16, color: colors.muted },
  arrow: { fontSize: 16, color: colors.muted },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  modal: { flex: 1, backgroundColor: colors.card },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  close: { padding: 10 },
  closeText: { fontSize: 20, color: colors.muted },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowSelected: { backgroundColor: colors.primaryLight },
  rowText: { fontSize: 16, color: colors.text },
  code: { fontSize: 14, color: colors.muted },
});
