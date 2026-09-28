import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { Text } from '../../src/components/Text';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, IconChip } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { deletePurchase, listPurchases, Purchase, totalPurchases } from '../../src/db/purchases';
import { monthBounds } from '../../src/db/expenses';
import { colors, radius } from '../../src/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PurchasesScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [rows, setRows] = useState<Purchase[]>([]);
  const [total, setTotal] = useState(0);

  const reload = useCallback(() => {
    if (!businessId) return;
    const { from, to } = monthBounds(ym.y, ym.m);
    listPurchases(db, businessId, from, to).then(setRows);
    totalPurchases(db, businessId, from, to).then(setTotal);
  }, [db, businessId, ym]);

  useFocusEffect(reload);

  const shift = (d: number) =>
    setYm(({ y, m }) => {
      const dt = new Date(y, m + d, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() };
    });
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();

  const confirmDelete = (p: Purchase) => {
    AppAlert.alert(t('delete'), t('pur_deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deletePurchase(db, p.id);
          reload();
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('pur_purchases')} />
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
          <IconChip icon="bag-handle-outline" />
          <View style={styles.flexOnly}>
            <Text style={styles.statLabel}>{t('pur_totalThisMonth')}</Text>
            <Text style={styles.totalValue}>{formatPaise(total)}</Text>
          </View>
        </Card>

        <Button
          variant="outline"
          icon="arrow-undo-outline"
          label={t('createPurchaseReturn')}
          onPress={() => router.push('/purchases/return')}
        />

        <Card list={rows.length > 0}>
          {rows.length === 0 ? (
            <EmptyState icon="bag-handle-outline" title={t('pur_noPurchases')} hint={t('pur_noPurchasesHint')} />
          ) : (
            rows.map((p, i) => {
              const isReturn = p.kind === 'purchase_return';
              return (
              <Pressable
                key={p.id}
                onPress={() => {
                  // Returns are one-way stock-out docs — not editable.
                  if (!isReturn) router.push({ pathname: '/purchases/new', params: { id: p.id } });
                }}
                style={[styles.row, i < rows.length - 1 && styles.rowSep]}
              >
                <IconChip icon={isReturn ? 'arrow-undo-outline' : 'bag-handle-outline'} />
                <View style={styles.flexOnly}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {p.party_name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {isReturn ? (
                      <Text>
                        <Text style={styles.returnBadge}>{t('purchaseReturn')} </Text>
                        {p.return_no ?? ''} · {formatDate(p.purchase_date)}
                      </Text>
                    ) : (
                      <Text>
                        {formatDate(p.purchase_date)}
                        {p.supplier_bill_no ? ` · ${t('pur_supplierBillNo')}: ${p.supplier_bill_no}` : ''}
                      </Text>
                    )}
                  </Text>
                </View>
                <Text style={[styles.rowAmt, isReturn && styles.returnAmt]}>
                  {isReturn ? '− ' : ''}
                  {formatPaise(p.total_paise)}
                </Text>
                <Pressable onPress={() => confirmDelete(p)} hitSlop={12} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </Pressable>
              );
            })
          )}
        </Card>
      </ScrollView>
      <Fab label={t('pur_addPurchase')} onPress={() => router.push('/purchases/new')} />
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
  monthLabel: { fontSize: 14, fontWeight: '800', color: colors.text, minWidth: 110, textAlign: 'center' },
  totalCard: { flexDirection: 'row', alignItems: 'center' },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rowAmt: { fontSize: 14, fontWeight: '800', color: colors.danger },
  returnAmt: { color: colors.primary },
  returnBadge: { fontWeight: '500', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  delBtn: { padding: 6 },
});
