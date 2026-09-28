// Force / soft update.
//
// • This build older than app_config.min_version_code → full-screen
//   "Please update" (app cannot be used) with a button to the Play Store.
// • Older than latest_version_code → one popup per new version
//   ("Update available", can be skipped).
// Checked on start and whenever the app comes back to the foreground.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { currentVersionCode, currentVersionName, getAppConfig, playStoreUrl } from '../lib/appConfig';
import { colors, radius, spacing, text } from '../theme';
import { AppAlert } from './AppDialog';
import { Text } from './Text';

const SOFT_SEEN_KEY = 'update_prompt_seen_v1';

async function openStore() {
  const { market, web } = playStoreUrl();
  try {
    await Linking.openURL(market);
  } catch {
    await Linking.openURL(web);
  }
}

export function UpdateGate({ children }: { children: ReactNode }) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const [blocked, setBlocked] = useState<{ message: string | null } | null>(null);
  const softShown = useRef(false);

  const check = useCallback(async () => {
    const me = currentVersionCode();
    if (!me) return; // dev builds without a versionCode are never blocked
    const cfg = await getAppConfig(true);
    if (cfg.min_version_code > me) {
      setBlocked({ message: cfg.update_message });
      return;
    }
    setBlocked(null);
    if (cfg.latest_version_code > me && !softShown.current) {
      const seen = Number((await AsyncStorage.getItem(SOFT_SEEN_KEY).catch(() => null)) ?? 0);
      if (seen >= cfg.latest_version_code) return;
      softShown.current = true;
      await AsyncStorage.setItem(SOFT_SEEN_KEY, String(cfg.latest_version_code)).catch(() => undefined);
      AppAlert.alert(t('v2_updAvailTitle'), cfg.update_message || t('v2_updAvailMsg'), [
        { text: t('v2_later'), style: 'cancel' },
        { text: t('v2_updateNow'), onPress: () => void openStore() },
      ]);
    }
  }, [t]);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  // While blocked, the back button closes the app instead of going anywhere.
  useEffect(() => {
    if (!blocked) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, [blocked]);

  if (!blocked) return <>{children}</>;

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <View style={styles.icon}>
          <Ionicons name="arrow-up-circle-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('v2_updRequiredTitle')}</Text>
        <Text style={styles.msg}>{blocked.message || t('v2_updRequiredMsg')}</Text>
        <Pressable onPress={() => void openStore()} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.btnText}>{t('v2_updateNow')}</Text>
        </Pressable>
        <Text style={styles.ver}>
          {t('appVersion')} {currentVersionName()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl, gap: spacing.md },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.text, textAlign: 'center' },
  msg: { fontSize: text.md, lineHeight: 20, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  btn: {
    marginTop: spacing.lg,
    height: 48,
    minWidth: 220,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md + 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '500', color: colors.white },
  ver: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },
});
