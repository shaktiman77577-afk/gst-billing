import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { StringKey } from '../i18n/strings';
import { SyncStatus, useSync } from '../sync/SyncContext';
import { colors, radius } from '../theme';
import { IconName } from './ui';

const LOOK: Record<SyncStatus, { icon: IconName; color: string; bg: string; key: StringKey }> = {
  synced: { icon: 'cloud-done', color: colors.success, bg: colors.successSoft, key: 'cloudSynced' },
  pending: { icon: 'cloud-upload-outline', color: '#B45309', bg: colors.accentSoft, key: 'cloudPending' },
  syncing: { icon: 'sync', color: colors.primary, bg: colors.primarySoft, key: 'cloudSyncing' },
  offline: { icon: 'cloud-offline-outline', color: '#B45309', bg: colors.accentSoft, key: 'cloudOffline' },
  error: { icon: 'alert-circle-outline', color: colors.danger, bg: colors.dangerSoft, key: 'cloudError' },
  off: { icon: 'cloud-outline', color: colors.muted, bg: colors.border, key: 'cloudOff' },
};

export function useAgo() {
  const { t } = useApp();
  return (iso: string | null) => {
    if (!iso) return '';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return t('justNow');
    if (mins < 60) return t('minutesAgo').replace('{n}', String(mins));
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
}

/** Full card with status, last sync time and a "Sync now" button. */
export function CloudStatusCard() {
  const { t } = useApp();
  const { status, lastOk, syncNow } = useSync();
  const ago = useAgo();
  const look = LOOK[status];
  return (
    <View style={styles.card}>
      <View style={[styles.icon, { backgroundColor: look.bg }]}>
        <Ionicons name={look.icon} size={22} color={look.color} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>{t('cloudBackup')}</Text>
        <Text style={[styles.sub, { color: look.color }]}>{t(look.key)}</Text>
        {lastOk ? (
          <Text style={styles.meta}>
            {t('lastSynced')}: {ago(lastOk)}
          </Text>
        ) : null}
      </View>
      {status !== 'off' ? (
        <Pressable onPress={syncNow} disabled={status === 'syncing'} style={styles.btn} hitSlop={6}>
          <Ionicons name="refresh" size={18} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small pill for the Home header. */
export function CloudPill() {
  const { status } = useSync();
  if (status === 'off') return null;
  const look = LOOK[status];
  return (
    <View style={styles.pill}>
      <Ionicons name={look.icon} size={14} color={colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  btn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
