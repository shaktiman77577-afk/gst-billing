import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { EmptyState } from '../../src/components/EmptyState';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, ErrorText, Field, Hairline, IconName, MenuRow, Screen } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import {
  addCustomCategory,
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  expenseCategoryLabel,
  getCustomCategories,
  removeCustomCategory,
} from '../../src/db/expenses';
import { colors } from '../../src/theme';

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
      setError(t('pe_empty'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const before = customs.length;
      const updated = await addCustomCategory(db, businessId, name);
      setCustoms(updated);
      setName('');
      if (updated.length === before) setError(t('pe_exists'));
    } catch {
      setError(t('pe_empty'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (cname: string) => {
    Alert.alert(t('pe_delTitle'), t('pe_delMsg'), [
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
      <FormHeader title={t('pe_manageCategories')} />
      <Screen edges={['bottom']}>
        <Card list>
          <Text style={styles.cardLabel}>{t('pe_default')}</Text>
          {EXPENSE_CATEGORIES.map((c) => (
            <Fragment key={c}>
              <Hairline />
              <MenuRow icon={CATEGORY_ICONS[c]} title={expenseCategoryLabel(c, t)} chevron={false} />
            </Fragment>
          ))}
        </Card>

        <Card>
          <Text style={styles.cardLabel}>{t('pe_yours')}</Text>
          <Field
            label={t('pe_categoryName')}
            placeholder={t('pe_categoryNamePh')}
            value={name}
            onChangeText={setName}
            icon="pricetag-outline"
          />
          <Button label={t('pe_addCategory')} icon="add-circle" onPress={onAdd} loading={saving} />
          {customs.length === 0 ? (
            <EmptyState icon="pricetag-outline" title={t('pe_noCustom')} hint={t('pe_noCustomHint')} />
          ) : null}
          <ErrorText>{error}</ErrorText>
        </Card>

        {customs.length > 0 ? (
          <Card list>
            {customs.map((c, i) => (
              <Fragment key={c}>
                {i > 0 ? <Hairline /> : null}
                <MenuRow
                  icon="pricetag-outline"
                  title={c}
                  chevron={false}
                  right={
                    <Pressable onPress={() => confirmDelete(c)} hitSlop={12} style={styles.delBtn}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  }
                />
              </Fragment>
            ))}
          </Card>
        ) : null}

        <Text style={styles.note}>{t('pe_defaultsNote')}</Text>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  cardLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  delBtn: { padding: 6 },
  note: { fontSize: 12, color: colors.faint, textAlign: 'center', paddingHorizontal: 8 },
});
