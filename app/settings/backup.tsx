import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, IconName, Screen } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { exportBackup, lastBackupAt, markBackedUp } from '../../src/db/backup';
import { useRestore } from '../../src/hooks/useRestore';
import { shareBackupFile } from '../../src/lib/backupFile';
import { colors, radius } from '../../src/theme';

export default function BackupScreen() {
  const db = useSQLiteContext();
  const { t, userId } = useApp();
  const { start: restore, restoring } = useRestore();
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    lastBackupAt(db).then(setLast);
  }, [db]);
  useFocusEffect(refresh);

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

  const tips: { icon: IconName; key: 'backupTip1' | 'backupTip2' | 'backupTip3' }[] = [
    { icon: 'calendar-outline', key: 'backupTip1' },
    { icon: 'lock-closed-outline', key: 'backupTip2' },
    { icon: 'phone-portrait-outline', key: 'backupTip3' },
  ];

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('backup')} />
      <Screen edges={['bottom']}>
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
});
