import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { Text } from '../../src/components/Text';
import { FormHeader } from '../../src/components/FormHeader';
import { Card, Hint, Screen, Overline } from '../../src/components/ui';
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
import { useMembership } from '../../src/hooks/useMembership';

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
  const mem = useMembership();
  // Restoring is a Yearly-plan feature. Everyone can still see the list and
  // delete forever; trial / monthly / free users are told to take Yearly.
  const yearly = mem.isYearly;
  const lockedMsg =
    mem.status === 'trial'
      ? t('v2_rcLockedTrial')
      : mem.status === 'pro'
        ? t('v2_rcLockedMonthly')
        : t('v2_rcLockedFree');
  const openYearly = () => router.push('/settings/membership');
  const showYearlyGate = () =>
    AppAlert.alert(t('v2_rcLockedTitle'), lockedMsg, [
      { text: t('v2_close'), style: 'cancel' },
      { text: t('v2_seeYearly'), onPress: openYearly },
    ]);

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
      AppAlert.alert(t('rc_title'), t('rc_restored'));
      await refresh();
    } catch (e) {
      AppAlert.alert(t('rc_title'), recycleErrorText(e));
    } finally {
      setBusyId(null);
    }
  };

  // Two-step confirmation for permanent delete.
  const stepOne = (row: RecycleRow) => {
    AppAlert.alert(t('rc_deleteTitle'), `${row.docNo}\n${t('rc_deleteMsg1')}`, [
      { text: t('rc_restore'), style: 'cancel' },
      { text: t('rc_deleteForever'), style: 'destructive', onPress: () => stepTwo(row) },
    ]);
  };

  const stepTwo = (row: RecycleRow) => {
    AppAlert.alert(t('rc_deleteTitle2'), t('rc_deleteMsg2').replace('{no}', row.docNo), [
      { text: t('rc_restore'), style: 'cancel' },
      { text: t('rc_deleteConfirm'), style: 'destructive', onPress: () => doDeleteForever(row) },
    ]);
  };

  const doDeleteForever = async (row: RecycleRow) => {
    setBusyId(row.id);
    try {
      if (row.docKind === 'purchase') await permanentDeletePurchase(db, row.id);
      else await permanentDeleteInvoice(db, row.id);
      AppAlert.alert(t('rc_title'), t('rc_deleted'));
      await refresh();
    } catch {
      AppAlert.alert(t('rc_title'), t('rc_deleteFailed'));
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
                  yearly
                    ? AppAlert.alert(t('rc_restoreTitle'), `${row.docNo}\n${t('rc_restoreMsg')}`, [
                        { text: t('rc_restore'), style: 'cancel' },
                        { text: t('rc_restoreConfirm'), onPress: () => doRestore(row) },
                      ])
                    : showYearlyGate()
                }
              >
                <Ionicons name={yearly ? 'refresh-outline' : 'lock-closed-outline'} size={13} color={colors.primary} />
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
        {!yearly && !mem.loading ? (
          <View style={styles.lockCard}>
            <View style={styles.lockHead}>
              <View style={styles.lockIcon}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.warning} />
              </View>
              <Text style={styles.lockTitle}>{t('v2_rcLockedTitle')}</Text>
            </View>
            <Text style={styles.lockMsg}>{lockedMsg}</Text>
            <Pressable onPress={openYearly} style={({ pressed }) => [styles.lockBtn, pressed && styles.pressed]}>
              <Text style={styles.lockBtnText}>{t('v2_seeYearly')}</Text>
            </Pressable>
          </View>
        ) : null}
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
                <Overline>{`${t(key)} (${section.length})`}</Overline>
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
  lockCard: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
  lockHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockTitle: { flex: 1, fontSize: text.md, fontWeight: '700', color: colors.text },
  lockMsg: { fontSize: text.sm, lineHeight: 18, color: colors.textSecondary },
  lockBtn: {
    alignSelf: 'flex-start',
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBtnText: { fontSize: text.sm, fontWeight: '500', color: colors.white },
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
