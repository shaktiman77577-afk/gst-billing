import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, ErrorText, Field, IconName, Screen } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import {
  addCustomCategory,
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  expenseCategoryLabel,
  getCustomCategories,
  removeCustomCategory,
} from '../../src/db/expenses';
import { en as peEn, hi as peHi, ParityExpenseKey } from '../../src/i18n/parity_expense';
import { colors, radius } from '../../src/theme';

const CATEGORY_ICONS: Record<ExpenseCategory, IconName> = {
  rent: 'home-outline',
  salary: 'people-outline',
  utilities: 'flash-outline',
  transport: 'car-outline',
  marketing: 'megaphone-outline',
  other: 'ellipsis-horizontal-outline',
};

export default function ExpenseCategoriesScreen() {
  const db = useSQLiteContext();
  const { t, language, businessId } = useApp();
  const tp = (k: ParityExpenseKey) => (language === 'hi' ? peHi : peEn)[k];
  const [customs, setCustoms] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    if (!businessId) return;
    getCustomCategories(db, businessId).then(setCustoms);
  }, [db, businessId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const onAdd = async () => {
    if (!businessId) return;
    if (!name.trim()) {
      setError(tp('pe_empty'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const before = customs.length;
      const updated = await addCustomCategory(db, businessId, name);
      setCustoms(updated);
      setName('');
      if (updated.length === before) setError(tp('pe_exists'));
    } catch {
      setError(tp('pe_empty'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (cname: string) => {
    Alert.alert(tp('pe_delTitle'), tp('pe_delMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          if (!businessId) return;
          setCustoms(await removeCustomCategory(db, businessId, cname));
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={tp('pe_manageCategories')} />
      <Screen edges={['bottom']}>
        <Card>
          <Text style={styles.cardLabel}>{tp('pe_default')}</Text>
          {EXPENSE_CATEGORIES.map((c, i) => (
            <View key={c} style={[styles.row, i > 0 && styles.rowSep]}>
              <View style={styles.catIcon}>
                <Ionicons name={CATEGORY_ICONS[c]} size={18} color={colors.primary} />
              </View>
              <Text style={styles.catName}>{expenseCategoryLabel(c, t)}</Text>
            </View>
          ))}
        </Card>

        <Card>
          <Text style={styles.cardLabel}>{tp('pe_yours')}</Text>
          <Field
            label={tp('pe_categoryName')}
            placeholder={tp('pe_categoryNamePh')}
            value={name}
            onChangeText={setName}
            icon="pricetag-outline"
          />
          <Button label={tp('pe_addCategory')} icon="add-circle" onPress={onAdd} loading={saving} />
          {customs.length === 0 ? (
            <EmptyState icon="pricetag-outline" title={tp('pe_noCustom')} hint={tp('pe_noCustomHint')} />
          ) : (
            customs.map((c) => (
              <View key={c} style={[styles.row, styles.rowSep]}>
                <View style={styles.catIcon}>
                  <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
                </View>
                <Text style={styles.catName}>{c}</Text>
                <Pressable onPress={() => confirmDelete(c)} hitSlop={12} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))
          )}
          <ErrorText>{error}</ErrorText>
        </Card>

        <Text style={styles.note}>{tp('pe_defaultsNote')}</Text>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowSep: { borderTopWidth: 1, borderTopColor: colors.border },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  delBtn: { padding: 6 },
  note: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingHorizontal: 8 },
});
