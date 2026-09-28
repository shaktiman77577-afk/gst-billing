// "Loading your data" — shown after login (or app start) when this phone has
// no business yet. Brings the account's data back from the cloud, then opens
// Home. The user cannot go back or leave mid-way; on failure they can retry
// or log out.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../src/components/Text';
import { useApp } from '../src/context/AppContext';
import { autoRestoreAfterLogin } from '../src/lib/cloudRestore';
import { colors, radius, spacing, text } from '../src/theme';

const MIN_SHOW_MS = 2000; // keep the screen up ~2s so it never just flickers

export default function RestoringScreen() {
  const db = useSQLiteContext();
  const { t, userId, businessId, setActiveBusiness, logout } = useApp();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'loading' | 'failed'>('loading');
  const running = useRef(false);

  // No way back while loading (Android back button / swipe).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setPhase('loading');
    const started = Date.now();
    const r = await autoRestoreAfterLogin(db);
    const wait = MIN_SHOW_MS - (Date.now() - started);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    running.current = false;
    if (r.status === 'restored' && r.businessId) {
      await setActiveBusiness(r.businessId);
      router.replace('/home');
    } else if (r.status === 'nothing-found') {
      router.replace('/business-setup'); // brand-new account
    } else {
      setPhase('failed');
    }
  }, [db, setActiveBusiness]);

  useEffect(() => {
    if (!userId) {
      router.replace('/login');
      return;
    }
    if (businessId) {
      router.replace('/home');
      return;
    }
    void run();
    // Run once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <StatusBar style="dark" />
      <View style={styles.center}>
        {phase === 'loading' ? (
          <>
            <View style={styles.icon}>
              <Ionicons name="cloud-download-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.title}>{t('v2_loadingTitle')}</Text>
            <Text style={styles.msg}>{t('v2_loadingMsg')}</Text>
            <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
          </>
        ) : (
          <>
            <View style={[styles.icon, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
            </View>
            <Text style={styles.title}>{t('v2_loadFailedTitle')}</Text>
            <Text style={styles.msg}>{t('v2_loadFailedMsg')}</Text>
            <Pressable
              onPress={() => void run()}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>{t('v2_tryAgain')}</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await logout(true);
                router.replace('/login');
              }}
              hitSlop={8}
              style={styles.linkBtn}
            >
              <Text style={styles.linkText}>{t('logout')}</Text>
            </Pressable>
          </>
        )}
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
  spinner: { marginTop: spacing.lg },
  primaryBtn: {
    marginTop: spacing.lg,
    height: 48,
    minWidth: 200,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md + 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 15, fontWeight: '500', color: colors.white },
  linkBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  linkText: { fontSize: text.md, fontWeight: '500', color: colors.danger },
  pressed: { opacity: 0.8 },
});
