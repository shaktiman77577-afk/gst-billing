import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { FormHeader } from '../../src/components/FormHeader';
import { Card, IconName } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import {
  deleteExpense,
  Expense,
  expenseCategoryLabel,
  ExpenseCategory,
  expensesByCategory,
  isBuiltinCategory,
  listExpenses,
  monthBounds,
  totalExpenses,
} from '../../src/db/expenses';
import { en as peEn, hi as peHi, ParityExpenseKey } from '../../src/i18n/parity_expense';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { colors, radius } from '../../src/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORY_ICONS: Record<ExpenseCategory, IconName> = {
  rent: 'home-outline',
  salary: 'people-outline',
  utilities: 'flash-outline',
  transport: 'car-outline',
  marketing: 'megaphone-outline',
  other: 'ellipsis-horizontal-outline',
};

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const { t, language, businessId } = useApp();
  const tp = (k: ParityExpenseKey) => (language === 'hi' ? peHi : peEn)[k];
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [cats, setCats] = useState<{ category: string; total: number }[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      const { from, to } = monthBounds(ym.y, ym.m);
      listExpenses(db, businessId, from, to).then(setRows);
      totalExpenses(db, businessId, from, to).then(setTotal);
      expensesByCategory(db, businessId, from, to).then(setCats);
    }, [db, businessId, ym]),
  );

  const shift = (d: number) =>
    setYm(({ y, m }) => {
      const dt = new Date(y, m + d, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() };
    });
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();

  const confirmDelete = (e: Expense) => {
    Alert.alert(t('delete'), t('e_deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteExpense(db, e.id);
          const { from, to } = monthBounds(ym.y, ym.m);
          if (!businessId) return;
          listExpenses(db, businessId, from, to).then(setRows);
          totalExpenses(db, businessId, from, to).then(setTotal);
          expensesByCategory(db, businessId, from, to).then(setCats);
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader
        title={t('e_expenses')}
        right={
          <Pressable onPress={() => router.push('/expenses/categories')} hitSlop={10}>
            <Text style={styles.manageLink}>{tp('pe_manage')}</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.monthNav}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <Text style={styles.monthLabel}>
            {MONTHS[ym.m]} {ym.y}
          </Text>
          <Pressable onPress={() => shift(1)} hitSlop={10} style={[styles.navBtn, isCurrent && styles.navBtnDisabled]} disabled={isCurrent}>
            <Ionicons name="chevron-forward" size={22} color={isCurrent ? colors.faint : colors.primary} />
          </Pressable>
        </View>

        <Card style={styles.totalCard}>
          <View style={styles.totalIcon}>
            <Ionicons name="wallet" size={22} color={colors.primary} />
          </View>
          <View style={styles.flexOnly}>
            <Text style={styles.statLabel}>{t('e_totalThisMonth')}</Text>
            <Text style={styles.totalValue}>{formatPaise(total)}</Text>
          </View>
        </Card>

        {cats.length > 0 ? (
          <Card>
            <Text style={styles.cardLabel}>{t('e_byCategory')}</Text>
            {cats.map((c, i) => (
              <View key={c.category} style={[styles.catRow, i > 0 && styles.rowSep]}>
                <View style={styles.catIcon}>
                  <Ionicons
                    name={
                      isBuiltinCategory(c.category)
                        ? CATEGORY_ICONS[c.category]
                        : 'ellipsis-horizontal-outline'
                    }
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <Text style={styles.catName}>{expenseCategoryLabel(c.category, t)}</Text>
                <Text style={styles.catAmt}>{formatPaise(c.total)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={rows.length ? { gap: 0, paddingVertical: 6 } : undefined}>
          {rows.length === 0 ? (
            <EmptyState icon="wallet-outline" title={t('e_noExpenses')} hint={t('e_noExpensesHint')} />
          ) : (
            rows.map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: '/expenses/new', params: { id: e.id } })}
                style={[styles.row, i < rows.length - 1 && styles.rowSep]}
              >
                <View style={styles.catIcon}>
                  <Ionicons
                    name={
                      isBuiltinCategory(e.category)
                        ? CATEGORY_ICONS[e.category]
                        : 'ellipsis-horizontal-outline'
                    }
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.flexOnly}>
                  <Text style={styles.rowTitle}>{expenseCategoryLabel(e.category, t)}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {formatDate(e.date)}
                    {e.note ? ` · ${e.note}` : ''}
                  </Text>
                </View>
                <Text style={styles.rowAmt}>{formatPaise(e.amount_paise)}</Text>
                <Pressable onPress={() => confirmDelete(e)} hitSlop={12} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </Pressable>
            ))
          )}
        </Card>
      </ScrollView>
      <Fab label={t('e_addExpense')} onPress={() => router.push('/expenses/new')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 96 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.5 },
  monthLabel: { fontSize: 17, fontWeight: '800', color: colors.text, minWidth: 110, textAlign: 'center' },
  manageLink: { fontSize: 14, fontWeight: '700', color: colors.primary },
  totalCard: { flexDirection: 'row', alignItems: 'center' },
  totalIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  totalValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  catAmt: { fontSize: 15, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowAmt: { fontSize: 15, fontWeight: '800', color: colors.danger },
  delBtn: { padding: 6 },
});
