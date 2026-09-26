import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { PartyWithBalance } from '../db/parties';
import { formatPaise } from '../lib/money';
import { colors, radius } from '../theme';
import { SearchBar } from './SearchBar';

type Props = {
  visible: boolean;
  parties: PartyWithBalance[];
  onClose: () => void;
  onPick: (party: PartyWithBalance | null) => void; // null = Cash Sale
  onAddNew: () => void;
};

export function PartyPicker({ visible, parties, onClose, onPick, onAddNew }: Props) {
  const { t } = useApp();
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? parties.filter((p) => p.name.toLowerCase().includes(q) || (p.phone ?? '').includes(q)) : parties;
  }, [parties, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('selectParty')}</Text>
        </View>
        <View style={styles.searchWrap}>
          <SearchBar value={query} onChange={setQuery} placeholder={t('searchParties')} />
        </View>
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.topActions}>
              <Pressable style={styles.special} onPress={() => onPick(null)}>
                <View style={[styles.icon, { backgroundColor: colors.successSoft }]}>
                  <Ionicons name="cash-outline" size={20} color={colors.success} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name}>{t('cashSale')}</Text>
                  <Text style={styles.sub}>{t('cashSaleHint')}</Text>
                </View>
              </Pressable>
              <Pressable style={styles.special} onPress={onAddNew}>
                <View style={styles.icon}>
                  <Ionicons name="person-add-outline" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.name, { color: colors.primary }]}>{t('newPartyShort')}</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onPick(item)}>
              <View style={styles.icon}>
                <Text style={styles.initial}>{item.name.trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[item.phone, item.gstin].filter(Boolean).join(' · ') || (item.party_type === 'supplier' ? t('supplier') : t('customer'))}
                </Text>
              </View>
              {item.balance_paise !== 0 ? (
                <Text style={[styles.bal, { color: item.balance_paise > 0 ? colors.success : colors.danger }]}>
                  {formatPaise(Math.abs(item.balance_paise))}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.card },
  title: { fontSize: 19, fontWeight: '700', color: colors.text },
  searchWrap: { padding: 12, backgroundColor: colors.primarySoft },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  topActions: { gap: 8, marginBottom: 6 },
  special: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 16, fontWeight: '800', color: colors.primary },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  bal: { fontSize: 13, fontWeight: '700' },
});
