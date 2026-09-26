import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { FormHeader } from '../../src/components/FormHeader';
import { Card } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { deletePurchase, listPurchases, Purchase, totalPurchases } from '../../src/db/purchases';
import { monthBounds } from '../../src/db/expenses';
import { colors, radius, shadowSm } from '../../src/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PurchasesScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
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
    Alert.alert(t('delete'), t('pur_deleteConfirm'), [
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
          <Pressable onPress={() => shift(1)} hitSlop={10} style={styles.navBtn} disabled={isCurrent}>
            <Ionicons name="chevron-forward" size={22} color={isCurrent ? colors.faint : colors.primary} />
          </Pressable>
        </View>

        <View style={styles.totalCard}>
          <View style={styles.totalIcon}>
            <Ionicons name="bag-handle-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.flexOnly}>
            <Text style={styles.statLabel}>{t('pur_totalThisMonth')}</Text>
            <Text style={styles.totalValue}>{formatPaise(total)}</Text>
          </View>
        </View>

        <Card style={rows.length ? { gap: 0, paddingVertical: 6 } : undefined}>
          {rows.length === 0 ? (
            <EmptyState icon="bag-handle-outline" title={t('pur_noPurchases')} hint={t('pur_noPurchasesHint')} />
          ) : (
            rows.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => router.push({ pathname: '/purchases/new', params: { id: p.id } })}
                style={[styles.row, i < rows.length - 1 && styles.rowSep]}
              >
                <View style={styles.pIcon}>
                  <Ionicons name="bag-handle-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.flexOnly}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {p.party_name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {formatDate(p.purchase_date)}
                    {p.supplier_bill_no ? ` · ${t('pur_supplierBillNo')}: ${p.supplier_bill_no}` : ''}
                  </Text>
                </View>
                <Text style={styles.rowAmt}>{formatPaise(p.total_paise)}</Text>
                <Pressable onPress={() => confirmDelete(p)} hitSlop={10} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </Pressable>
            ))
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
  navBtn: { padding: 6 },
  monthLabel: { fontSize: 17, fontWeight: '800', color: colors.text, minWidth: 110, textAlign: 'center' },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    ...shadowSm,
  },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowAmt: { fontSize: 15, fontWeight: '800', color: colors.text },
  delBtn: { padding: 6 },
});
