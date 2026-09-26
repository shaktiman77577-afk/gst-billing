import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { parseBackup, restoreBackup } from '../db/backup';
import { pickBackupFile } from '../lib/backupFile';
import { formatDate } from '../lib/dates';

// Pick a backup file → show what's in it → confirm → replace data → open the app.
export function useRestore() {
  const db = useSQLiteContext();
  const { t, userId, setActiveBusiness } = useApp();
  const [restoring, setRestoring] = useState(false);

  const start = async () => {
    if (!userId) return;
    try {
      const text = await pickBackupFile();
      if (!text) return;
      const parsed = await parseBackup(db, text);
      if (!parsed.ok) {
        Alert.alert(t('restore'), parsed.reason === 'newer' ? t('restoreNewer') : t('restoreInvalid'));
        return;
      }
      const s = parsed.summary;
      const details = t('restoreDetails')
        .replace('{date}', formatDate(s.createdAt.slice(0, 10)))
        .replace('{business}', s.businesses.join(', '))
        .replace('{parties}', String(s.parties))
        .replace('{items}', String(s.items))
        .replace('{bills}', String(s.bills));
      Alert.alert(t('restore'), `${details}\n\n${t('restoreConfirm')}`, [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('restore'),
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const businessId = await restoreBackup(db, parsed.data, userId);
              if (businessId) await setActiveBusiness(businessId);
              Alert.alert(t('appName'), t('restoreDone'));
              router.replace('/');
            } catch (e) {
              Alert.alert(t('restore'), `${t('somethingWrong')} (${String((e as Error)?.message ?? e)})`);
            } finally {
              setRestoring(false);
            }
          },
        },
      ]);
    } catch (e) {
      Alert.alert(t('restore'), `${t('restoreInvalid')} (${String((e as Error)?.message ?? e)})`);
    }
  };

  return { start, restoring };
}
