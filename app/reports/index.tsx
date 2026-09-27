import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatPaise } from '../../src/lib/money';
import { receivablesTotal } from '../../src/lib/reports';
import { exportGstr1Csv } from '../../src/lib/gstr1';
import { exportGstr1Json, fpForDate, fpLabel, shiftFp } from '../../src/lib/gstr1json';
import { colors, radius, text } from '../../src/theme';

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const { t } = useApp();
  const business = useBusiness();
  const [due, setDue] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [fp, setFp] = useState(() => fpForDate(new Date()));
  const [exportingJson, setExportingJson] = useState(false);

  const onExportGstr1 = useCallback(async () => {
    if (!business || exporting) return;
    setExporting(true);
    try {
      const uri = await exportGstr1Csv(db, business.id, business.name);
      if (!uri) {
        Alert.alert(t('g1_noDataTitle'), t('g1_noData'));
      } else {
        Alert.alert(t('g1_doneTitle'), t('g1_done'));
      }
    } catch {
      Alert.alert(t('g1_failedTitle'), t('g1_failed'));
    } finally {
      setExporting(false);
    }
  }, [business, db, exporting, t]);

  const onExportGstr1Json = useCallback(async () => {
    if (!business || exportingJson) return;
    if (!business.gstin || !business.gstin.trim()) {
      Alert.alert(t('gj_noGstinTitle'), t('gj_noGstin'));
      return;
    }
    setExportingJson(true);
    try {
      const uri = await exportGstr1Json(
        db,
        { id: business.id, gstin: business.gstin, name: business.name, state_code: business.state_code },
        fp,
      );
      if (!uri) {
        Alert.alert(t('gj_noDataTitle'), t('gj_noData'));
      } else {
        Alert.alert(t('gj_doneTitle'), t('gj_done'));
      }
    } catch {
      Alert.alert(t('gj_failedTitle'), t('gj_failed'));
    } finally {
      setExportingJson(false);
    }
  }, [business, db, exportingJson, fp, t]);

  const menu = [
    { route: '/reports/sales' as const, icon: 'trending-up' as const, title: t('r_salesReport'), hint: t('r_salesReportHint') },
    { route: '/reports/gst' as const, icon: 'receipt' as const, title: t('r_gstSummary'), hint: t('r_gstSummaryHint') },
    { route: '/reports/top' as const, icon: 'trophy' as const, title: t('r_topLists'), hint: t('r_topListsHint') },
  ];

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (business) {
        receivablesTotal(db, business.id).then((v) => {
          if (active) setDue(v);
        });
      }
      return () => {
        active = false;
      };
    }, [db, business]),
  );

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('r_reports')} />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card>
            <View style={styles.dueRow}>
              <View style={styles.dueIcon}>
                <Ionicons name="wallet" size={20} color={colors.warning} />
              </View>
              <View style={styles.grow}>
                <Text style={styles.dueLabel}>{t('r_receivables')}</Text>
                {due === null ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.dueLoading} />
                ) : (
                  <Text style={styles.dueAmount}>{formatPaise(due)}</Text>
                )}
              </View>
            </View>
          </Card>

          <Card>
            <Text style={styles.rowText}>{t('g1_exportTitle')}</Text>
            <Text style={styles.meta}>{t('g1_exportHint')}</Text>
            <Button label={t('g1_export')} icon="document-text" onPress={onExportGstr1} loading={exporting} />
          </Card>

          <Card>
            <Text style={styles.rowText}>{t('gj_exportTitle')}</Text>
            <Text style={styles.meta}>{t('gj_exportHint')}</Text>
            <View style={styles.monthRow}>
              <Pressable
                style={styles.monthBtn}
                onPress={() => setFp((p) => shiftFp(p, -1))}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={20} color={colors.primary} />
              </Pressable>
              <Text style={styles.monthLabel}>{fpLabel(fp)}</Text>
              <Pressable
                style={styles.monthBtn}
                onPress={() => setFp((p) => shiftFp(p, 1))}
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
              </Pressable>
            </View>
            <Button label={t('gj_export')} icon="cloud-upload" onPress={onExportGstr1Json} loading={exportingJson} />
          </Card>

          <Card>
            {menu.map((m, i) => (
              <View key={m.route}>
                {i > 0 ? <View style={styles.sep} /> : null}
                <Pressable style={styles.row} onPress={() => router.push(m.route)}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={m.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.rowText}>{m.title}</Text>
                    <Text style={styles.meta}>{m.hint}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                </Pressable>
              </View>
            ))}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  grow: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dueIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  dueAmount: { fontSize: text.xxl, fontWeight: '800', color: colors.text, marginTop: 2 },
  dueLoading: { alignSelf: 'flex-start', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  monthBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 16, fontWeight: '700', color: colors.text, minWidth: 96, textAlign: 'center' },
  sep: { height: 1, backgroundColor: colors.border },
});
