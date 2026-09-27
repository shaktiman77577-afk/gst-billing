import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { FormHeader } from '../../src/components/FormHeader';
import { Card, Hint, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import {
  RECYCLE_NOT_CANCELLED,
  RECYCLE_NOT_DELETED,
  RecycleRow,
  listRecycleBin,
  permanentDeleteInvoice,
  permanentDeletePurchase,
  restorePurchase,
  uncancelInvoice,
} from '../../src/db/restore';
import { formatPaise } from '../../src/lib/money';
import type { StringKey } from '../../src/i18n/strings';
import { colors, radius, text } from '../../src/theme';
import { useBusiness } from '../../src/hooks/useBusiness';

const SECTIONS: { kind: RecycleRow['docKind']; icon: 'document-text' | 'reader' | 'newspaper' | 'bag-handle-outline'; key: StringKey }[] = [
  { kind: 'invoice', icon: 'document-text', key: 'rc_sectionInvoices' },
  { kind: 'credit_note', icon: 'reader', key: 'rc_sectionCreditNotes' },
  { kind: 'quotation', icon: 'newspaper', key: 'rc_sectionQuotations' },
  { kind: 'purchase', icon: 'bag-handle-outline', key: 'rc_sectionPurchases' },
];

export default function RecycleScreen() {
  const db = useSQLiteContext();
  const { t, language } = useApp();
  const business = useBusiness();

  const [rows, setRows] = useState<RecycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      setRows(await listRecycleBin(db, business.id));
    } catch {
      // The recycle bin is read-only convenience UI; keep the old list on failure.
    } finally {
      setLoading(false);
    }
  }, [db, business]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const recycleErrorText = (e: unknown): string => {
    if (e instanceof Error) {
      if (e.message === RECYCLE_NOT_CANCELLED) return t('rc_notCancelled');
      if (e.message === RECYCLE_NOT_DELETED) return t('rc_notDeleted');
    }
    return t('rc_restoreFailed');
  };

  const doRestore = async (row: RecycleRow) => {
    setBusyId(row.id);
    try {
      if (row.docKind === 'purchase') await restorePurchase(db, row.id);
      else await uncancelInvoice(db, row.id);
      Alert.alert(t('rc_title'), t('rc_restored'));
      await refresh();
    } catch (e) {
      Alert.alert(t('rc_title'), recycleErrorText(e));
    } finally {
      setBusyId(null);
    }
  };

  // Two-step confirmation for permanent delete.
  const stepOne = (row: RecycleRow) => {
    Alert.alert(t('rc_deleteTitle'), `${row.docNo}\n${t('rc_deleteMsg1')}`, [
      { text: t('rc_restore'), style: 'cancel' },
      { text: t('rc_deleteForever'), style: 'destructive', onPress: () => stepTwo(row) },
    ]);
  };

  const stepTwo = (row: RecycleRow) => {
    Alert.alert(t('rc_deleteTitle2'), t('rc_deleteMsg2').replace('{no}', row.docNo), [
      { text: t('rc_restore'), style: 'cancel' },
      { text: t('rc_deleteConfirm'), style: 'destructive', onPress: () => doDeleteForever(row) },
    ]);
  };

  const doDeleteForever = async (row: RecycleRow) => {
    setBusyId(row.id);
    try {
      if (row.docKind === 'purchase') await permanentDeletePurchase(db, row.id);
      else await permanentDeleteInvoice(db, row.id);
      Alert.alert(t('rc_title'), t('rc_deleted'));
      await refresh();
    } catch {
      Alert.alert(t('rc_title'), t('rc_deleteFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const renderRow = (row: RecycleRow) => {
    const busy = busyId === row.id;
    return (
      <View key={row.id} style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.docNo} numberOfLines={1}>
            {row.docNo}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {row.partyName} · {row.date}
          </Text>
        </View>
        <Text style={styles.amount}>{formatPaise(row.totalPaise)}</Text>
        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [styles.pill, styles.restorePill, pressed && styles.pressed]}
                hitSlop={8}
                onPress={() =>
                  Alert.alert(t('rc_restoreTitle'), `${row.docNo}\n${t('rc_restoreMsg')}`, [
                    { text: t('rc_restore'), style: 'cancel' },
                    { text: t('rc_restoreConfirm'), onPress: () => doRestore(row) },
                  ])
                }
              >
                <Ionicons name="refresh-outline" size={13} color={colors.primary} />
                <Text style={styles.restoreText}>{t('rc_restore')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.pill, styles.deletePill, pressed && styles.pressed]}
                hitSlop={8}
                onPress={() => stepOne(row)}
              >
                <Ionicons name="trash-outline" size={13} color={colors.danger} />
                <Text style={styles.deleteText}>{t('rc_deleteForever')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('rc_title')} />
      <Screen edges={['bottom']}>
        <Card>
          <Hint>{t('rc_hint')}</Hint>
        </Card>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : rows.length === 0 ? (
          <Card>
            <Hint>{t('rc_empty')}</Hint>
          </Card>
        ) : (
          SECTIONS.map(({ kind, icon, key }) => {
            const section = rows.filter((r) => r.docKind === kind);
            if (section.length === 0) return null;
            return (
              <View key={kind}>
                <SectionHeader icon={icon} title={`${t(key)} (${section.length})`} />
                <Card>{section.map(renderRow)}</Card>
              </View>
            );
          })
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowMain: { flex: 1 },
  docNo: { fontSize: text.md, fontWeight: '700', color: colors.text },
  meta: { fontSize: text.sm, color: colors.muted, marginTop: 2 },
  amount: { fontSize: text.md, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minHeight: 44,
  },
  restorePill: { borderWidth: 1, borderColor: colors.primary },
  deletePill: { borderWidth: 1, borderColor: colors.dangerSoft },
  restoreText: { fontSize: text.xs, fontWeight: '700', color: colors.primary },
  deleteText: { fontSize: text.xs, fontWeight: '700', color: colors.danger },
  pressed: { opacity: 0.7 },
});
