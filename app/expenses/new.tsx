import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DateField } from '../../src/components/DateField';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, Chips, ErrorText, Field, IconName, Label, Screen } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import {
  addExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_MODES,
  ExpenseCategory,
  expenseCategoryLabel,
  ExpenseMode,
  getAllCategories,
  getExpense,
  isBuiltinCategory,
  updateExpense,
} from '../../src/db/expenses';
import { todayIso } from '../../src/lib/dates';
import { paiseToInput, toPaise } from '../../src/lib/money';
import { colors } from '../../src/theme';

/** Sentinel chip value — tapping it opens the category manager instead. */
const NEW_CATEGORY = '__new_category__';

const CATEGORY_ICONS: Record<ExpenseCategory, IconName> = {
  rent: 'home-outline',
  salary: 'people-outline',
  utilities: 'flash-outline',
  transport: 'car-outline',
  marketing: 'megaphone-outline',
  other: 'ellipsis-horizontal-outline',
};

export default function ExpenseFormScreen() {
  const db = useSQLiteContext();
  const { t, language, businessId } = useApp();
  const { id, date: dateParam } = useLocalSearchParams<{ id?: string; date?: string }>();
  const editing = !!id;

  // Daybook quick-add passes ?date=YYYY-MM-DD to prefill the date.
  const initialDate =
    !editing && dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIso();
  const [date, setDate] = useState(initialDate);
  const [category, setCategory] = useState<string>('other');
  const [allCats, setAllCats] = useState<string[]>([...EXPENSE_CATEGORIES]);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<ExpenseMode>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const e = await getExpense(db, id);
      if (!e) return;
      setDate(e.date);
      setCategory(e.category);
      setAmount(paiseToInput(e.amount_paise));
      setMode(e.payment_mode);
      setNote(e.note ?? '');
    })();
  }, [db, id]);

  // Reload categories every time the screen gains focus so a category added
  // via the "+ New" chip is immediately selectable.
  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      getAllCategories(db, businessId).then(setAllCats);
    }, [db, businessId]),
  );

  const onCategoryChange = (v: string) => {
    if (v === NEW_CATEGORY) router.push('/expenses/categories');
    else setCategory(v);
  };

  const onSave = async () => {
    const paise = toPaise(amount);
    if (!paise || paise <= 0) return setError(t('errAmountZero'));
    if (!businessId) return;
    setError(null);
    setSaving(true);
    try {
      const payload = {
        date,
        category,
        amountPaise: paise,
        note: note.trim() || null,
        paymentMode: mode,
      };
      if (editing && id) await updateExpense(db, id, payload);
      else await addExpense(db, { businessId, ...payload });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={editing ? t('e_editExpense') : t('e_addExpense')} />
      <Screen
        edges={['bottom']}
        footer={<Button label={t('save')} onPress={onSave} loading={saving} />}
      >
        <Card>
          <Field
            label={t('amount')}
            placeholder="0"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            icon="cash-outline"
            style={styles.amountInput}
          />
          <DateField label={t('e_date')} value={date} onChange={(d) => d && setDate(d)} />
        </Card>
        <Card>
          <Label>{t('e_category')}</Label>
          <Chips
            options={[
              ...allCats.map((c) => ({
                value: c,
                label: expenseCategoryLabel(c, t),
                icon: (isBuiltinCategory(c) ? CATEGORY_ICONS[c] : 'pricetag-outline') as IconName,
              })),
              { value: NEW_CATEGORY, label: t('pe_newChip'), icon: 'add-outline' as IconName },
            ]}
            value={category}
            onChange={onCategoryChange}
          />
          <Label>{t('paymentMode')}</Label>
          <Chips options={EXPENSE_MODES.map((m) => ({ value: m, label: t(m) }))} value={mode} onChange={setMode} />
          <Field label={t('notes')} optionalLabel={t('optional')} value={note} onChangeText={setNote} />
        </Card>
        <ErrorText>{error}</ErrorText>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  amountInput: { fontSize: 18, fontWeight: '700' },
});
