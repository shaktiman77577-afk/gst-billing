import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
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
  ExpenseMode,
  getExpense,
  updateExpense,
} from '../../src/db/expenses';
import { todayIso } from '../../src/lib/dates';
import { paiseToInput, toPaise } from '../../src/lib/money';
import { colors } from '../../src/theme';

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
  const { t, businessId } = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<ExpenseCategory>('other');
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
        footer={<Button label={t('save')} icon="checkmark-circle" onPress={onSave} loading={saving} />}
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
            options={EXPENSE_CATEGORIES.map((c) => ({
              value: c,
              label: t(`e_cat_${c}`),
              icon: CATEGORY_ICONS[c],
            }))}
            value={category}
            onChange={setCategory}
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
  amountInput: { fontSize: 22, fontWeight: '800' },
});
