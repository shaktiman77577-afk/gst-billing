import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { CloudStatusCard } from '../../src/components/CloudStatus';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, IconName, Screen } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { exportBackup, lastBackupAt, markBackedUp } from '../../src/db/backup';
import { useRestore } from '../../src/hooks/useRestore';
import { shareBackupFile } from '../../src/lib/backupFile';
import {
  BackupError,
  CloudBackupRow,
  backupNow,
  deleteBackup,
  isAutoBackupEnabled,
  listBackups,
  restoreBackup,
  setAutoBackupEnabled,
} from '../../src/lib/backup';
import { StringKey } from '../../src/i18n/strings';
import { colors, radius } from '../../src/theme';

function cloudErrorKey(code: BackupError['code']): StringKey {
  switch (code) {
    case 'no_session':
      return 'bk_noSession';
    case 'no_network':
      return 'bk_noNetwork';
    case 'empty':
      return 'bk_empty';
    case 'invalid':
      return 'bk_invalid';
    case 'newer':
      return 'bk_newer';
    default:
      return 'bk_failed';
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function BackupScreen() {
  const db = useSQLiteContext();
  const { t, userId } = useApp();
  const { start: restore, restoring } = useRestore();
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- cloud backup state ----
  const [cloud, setCloud] = useState<CloudBackupRow[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    lastBackupAt(db).then(setLast);
  }, [db]);

  const refreshCloud = useCallback(async () => {
    setCloudLoading(true);
    try {
      const [rows, auto] = await Promise.all([listBackups(), isAutoBackupEnabled(db)]);
      setCloud(rows);
      setAutoOn(auto);
    } catch (e) {
      // Not logged in yet (or offline): the cloud section explains itself.
      if (!(e instanceof BackupError) || (e.code !== 'no_session' && e.code !== 'no_network')) {
        Alert.alert(t('bk_cloudTitle'), t('bk_failed'));
      }
      setCloud([]);
    } finally {
      setCloudLoading(false);
    }
  }, [db, t]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      void refreshCloud();
    }, [refresh, refreshCloud]),
  );

  const ago = (() => {
    if (!last) return t('never');
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    return days <= 0 ? t('today') : t('daysAgo').replace('{n}', String(days));
  })();
  const old = !last || Date.now() - new Date(last).getTime() > 7 * 86400000;

  const backup = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const data = await exportBackup(db, userId);
      await shareBackupFile(JSON.stringify(data));
      await markBackedUp(db);
      refresh();
    } catch (e) {
      Alert.alert(t('backup'), `${t('somethingWrong')} (${String((e as Error)?.message ?? e)})`);
    } finally {
      setBusy(false);
    }
  };

  const cloudBackupNow = async () => {
    setCloudBusy(true);
    try {
      await backupNow(db);
      Alert.alert(t('bk_cloudTitle'), t('bk_done'));
      await refreshCloud();
      refresh();
    } catch (e) {
      const key = e instanceof BackupError ? cloudErrorKey(e.code) : 'bk_failed';
      Alert.alert(t('bk_cloudTitle'), t(key));
    } finally {
      setCloudBusy(false);
    }
  };

  const toggleAuto = async (on: boolean) => {
    setAutoOn(on);
    try {
      await setAutoBackupEnabled(db, on);
    } catch {
      setAutoOn(!on);
    }
  };

  const confirmRestore = (row: CloudBackupRow) => {
    Alert.alert(
      t('bk_restoreTitle'),
      t('bk_restoreMsg').replace('{date}', formatDate(row.created_at)),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('bk_restore'),
          style: 'destructive',
          onPress: () => doRestore(row),
        },
      ],
    );
  };

  const doRestore = async (row: CloudBackupRow) => {
    setRowBusy(row.id);
    try {
      await restoreBackup(db, row);
      // restoreBackup asks the app to remount its database connection; the
      // whole UI tree rebuilds itself from the restored data.
      Alert.alert(t('bk_cloudTitle'), t('bk_restored'));
    } catch (e) {
      const key = e instanceof BackupError ? cloudErrorKey(e.code) : 'bk_failed';
      Alert.alert(t('bk_cloudTitle'), t(key));
    } finally {
      setRowBusy(null);
    }
  };

  const confirmDelete = (row: CloudBackupRow) => {
    Alert.alert(
      t('bk_deleteTitle'),
      t('bk_deleteMsg').replace('{date}', formatDate(row.created_at)),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('bk_delete'),
          style: 'destructive',
          onPress: async () => {
            setRowBusy(row.id);
            try {
              await deleteBackup(row);
              Alert.alert(t('bk_cloudTitle'), t('bk_deleted'));
              await refreshCloud();
            } catch {
              Alert.alert(t('bk_cloudTitle'), t('bk_failed'));
            } finally {
              setRowBusy(null);
            }
          },
        },
      ],
    );
  };

  const tips: { icon: IconName; key: 'backupTip1' | 'backupTip2' | 'backupTip3' }[] = [
    { icon: 'calendar-outline', key: 'backupTip1' },
    { icon: 'lock-closed-outline', key: 'backupTip2' },
    { icon: 'phone-portrait-outline', key: 'backupTip3' },
  ];

  const lastCloud = cloud[0]?.created_at ?? null;

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('backup')} />
      <Screen edges={['bottom']}>
        <Card>
          <CloudStatusCard />
          <Text style={styles.muted}>{t('cloudHint')}</Text>
        </Card>
        <Card style={styles.status}>
          <View style={[styles.icon, { backgroundColor: old ? colors.accentSoft : colors.successSoft }]}>
            <Ionicons
              name={old ? 'cloud-offline-outline' : 'cloud-done-outline'}
              size={28}
              color={old ? '#B45309' : colors.success}
            />
          </View>
          <View style={styles.flexOnly}>
            <Text style={styles.muted}>{t('lastBackup')}</Text>
            <Text style={styles.big}>{ago}</Text>
          </View>
        </Card>

        <Card>
          <Text style={styles.text}>{t('backupHow')}</Text>
          <Button icon="cloud-upload-outline" label={t('backupNow')} onPress={backup} loading={busy} />
          <Button
            variant="outline"
            icon="cloud-download-outline"
            label={t('restore')}
            onPress={restore}
            loading={restoring}
          />
        </Card>

        {/* ---------- Cloud backup (Supabase) ---------- */}
        <Card>
          <View style={styles.rowHead}>
            <Ionicons name="cloud-outline" size={20} color={colors.primary} />
            <Text style={styles.head}>{t('bk_cloudTitle')}</Text>
          </View>
          <Text style={styles.muted}>{t('bk_cloudHint')}</Text>

          <View style={styles.kv}>
            <Text style={styles.muted}>{t('bk_lastCloud')}</Text>
            <Text style={styles.kvVal}>
              {cloudLoading ? '…' : lastCloud ? formatDate(lastCloud) : t('bk_never')}
            </Text>
          </View>

          <View style={styles.gap}>
            <Button
              icon="cloud-upload"
              label={t('bk_backupNow')}
              onPress={cloudBackupNow}
              loading={cloudBusy}
            />
          </View>

          <View style={styles.autoRow}>
            <View style={styles.flexOnly}>
              <Text style={styles.rowText}>{t('bk_autoBackup')}</Text>
              <Text style={styles.muted}>{t('bk_autoHint')}</Text>
            </View>
            <Switch value={autoOn} onValueChange={toggleAuto} />
          </View>
        </Card>

        {cloud.length > 0 ? (
          <Card>
            <Text style={styles.head}>{t('bk_backups')}</Text>
            {cloud.map((row, i) => (
              <View key={row.id}>
                {i > 0 ? <View style={styles.sep} /> : null}
                <View style={styles.bkRow}>
                  <View style={styles.flexOnly}>
                    <Text style={styles.rowText}>{formatDate(row.created_at)}</Text>
                    <Text style={styles.muted}>
                      {formatSize(row.size_bytes)}
                      {row.device_name ? ` · ${row.device_name}` : ''}
                    </Text>
                  </View>
                  {rowBusy === row.id ? null : (
                    <View style={styles.bkActions}>
                      <Button
                        variant="text"
                        icon="cloud-download-outline"
                        label={t('bk_restore')}
                        onPress={() => confirmRestore(row)}
                      />
                      <Button
                        variant="text"
                        icon="trash-outline"
                        label={t('bk_delete')}
                        onPress={() => confirmDelete(row)}
                      />
                    </View>
                  )}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          {tips.map((tip) => (
            <View key={tip.key} style={styles.tip}>
              <Ionicons name={tip.icon} size={18} color={colors.primary} />
              <Text style={styles.tipText}>{t(tip.key)}</Text>
            </View>
          ))}
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 13, color: colors.muted },
  big: { fontSize: 22, fontWeight: '800', color: colors.text },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipText: { flex: 1, fontSize: 14, color: colors.text },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  head: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  rowText: { fontSize: 15, fontWeight: '600', color: colors.text },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  kvVal: { fontSize: 14, fontWeight: '600', color: colors.text },
  gap: { marginTop: 12 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  bkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bkActions: { flexDirection: 'row', alignItems: 'center' },
});
