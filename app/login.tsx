import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguageToggle } from '../src/components/LanguageToggle';
import { ErrorText, IconChip, IconName, MadeInIndia } from '../src/components/ui';
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
        // completeLogin records the identity and claims this phone. If there is
        // no business here yet, app/index.tsx opens "Loading your data".
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
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          <View style={styles.toggleRow}>
            <LanguageToggle />
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
                  <Ionicons name={b.icon} size={16} color={colors.primary} />
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
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  toggleRow: { alignSelf: 'stretch', alignItems: 'flex-end', marginBottom: 28 },
  logo: { width: 72, height: 72, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  appName: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.text, marginTop: 16 },
  tagline: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 4, textAlign: 'center' },
  hindi: { fontSize: 14, color: colors.primary, marginTop: 6, fontWeight: '500' },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: -8 },
  benefits: { gap: 10, marginVertical: 2 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: { fontSize: 14, lineHeight: 20, color: colors.text, flex: 1 },
  google: {
    minHeight: 48,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  googleLabel: { fontSize: 15, fontWeight: '500', color: colors.text },
  checkingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkingText: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  bottom: { flex: 1, justifyContent: 'flex-end', paddingVertical: 20 },
});
