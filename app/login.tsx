import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguageToggle } from '../src/components/LanguageToggle';
import { ErrorText, IconName, MadeInIndia } from '../src/components/ui';
import { useApp } from '../src/context/AppContext';
import { StringKey } from '../src/i18n/strings';
import { loginWithGoogle } from '../src/lib/auth';
import { colors, radius, shadow } from '../src/theme';

const BENEFITS: { icon: IconName; key: StringKey }[] = [
  { icon: 'flash', key: 'benefitFast' },
  { icon: 'cloud-offline', key: 'benefitOffline' },
  { icon: 'shield-checkmark', key: 'benefitSafe' },
];

export default function LoginScreen() {
  const { t, completeLogin } = useApp();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithGoogle();
      if (result.ok) {
        // completeLogin records the identity and silently restores the cloud
        // (full backup first, business profile as fallback) when this phone
        // has no business yet. Local data is never overwritten.
        setChecking(true);
        try {
          await completeLogin(result.uid, result.email);
        } finally {
          setChecking(false);
        }
        router.replace('/');
        return;
      }
      if (result.reason === 'cancelled') return;
      if (result.reason === 'noInternet') setError(t('noInternet'));
      else if (result.reason === 'noPlayServices') setError(t('noPlayServices'));
      else setError(`${t('somethingWrong')}${result.detail ? ` (${result.detail})` : ''}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          <View style={styles.toggleRow}>
            <LanguageToggle onDark />
          </View>
          <Image source={require('../assets/icon.png')} style={styles.logo} />
          <Text style={styles.appName}>{t('appName')}</Text>
          <Text style={styles.tagline}>{t('tagline')}</Text>
          <Text style={styles.hindi}>{t('taglineHindi')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('loginTitle')}</Text>
          <Text style={styles.hint}>{t('loginHint')}</Text>

          <View style={styles.benefits}>
            {BENEFITS.map((b) => (
              <View key={b.key} style={styles.benefit}>
                <View style={styles.benefitIcon}>
                  <Ionicons name={b.icon} size={18} color={colors.primary} />
                </View>
                <Text style={styles.benefitText}>{t(b.key)}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={onGoogle}
            disabled={loading || checking}
            style={({ pressed }) => [styles.google, (pressed || loading) && { opacity: 0.75 }]}
          >
            {loading || checking ? (
              <View style={styles.checkingRow}>
                <ActivityIndicator color={colors.primary} />
                {checking ? <Text style={styles.checkingText}>{t('checkingCloud')}</Text> : null}
              </View>
            ) : (
              <>
                <Ionicons name="logo-google" size={22} color="#4285F4" />
                <Text style={styles.googleLabel}>{t('continueWithGoogle')}</Text>
              </>
            )}
          </Pressable>

          <ErrorText>{error}</ErrorText>
        </View>

        <View style={styles.bottom}>
          <MadeInIndia />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingBottom: 56,
    paddingHorizontal: 20,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  toggleRow: { alignSelf: 'stretch', alignItems: 'flex-end', marginBottom: 16 },
  logo: { width: 84, height: 84, borderRadius: 22, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  appName: { fontSize: 30, fontWeight: '800', color: colors.white, marginTop: 14, letterSpacing: 0.3 },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  hindi: { fontSize: 16, color: colors.accent, marginTop: 10, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: -32,
    borderRadius: radius.lg,
    padding: 20,
    gap: 14,
    ...shadow,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  hint: { fontSize: 14, color: colors.muted, marginTop: -8 },
  benefits: { gap: 10, marginVertical: 4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: { fontSize: 15, color: colors.text, flex: 1 },
  google: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
  },
  googleLabel: { fontSize: 17, fontWeight: '700', color: colors.text },
  checkingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkingText: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  bottom: { flex: 1, justifyContent: 'flex-end', paddingVertical: 20 },
});
