import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ErrorText, Screen } from '../src/components/ui';
import { useApp } from '../src/context/AppContext';
import { loginWithGoogle } from '../src/lib/auth';
import { colors } from '../src/theme';

export default function LoginScreen() {
  const { t, completeLogin } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithGoogle();
      if (result.ok) {
        await completeLogin(result.uid, result.email);
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
    <Screen>
      <View style={styles.brand}>
        <Text style={styles.appName}>{t('appName')}</Text>
        <Text style={styles.tagline}>{t('tagline')}</Text>
      </View>

      <Text style={styles.title}>{t('loginTitle')}</Text>
      <Text style={styles.hint}>{t('loginHint')}</Text>

      <Pressable
        onPress={onGoogle}
        disabled={loading}
        style={({ pressed }) => [styles.google, (pressed || loading) && { opacity: 0.7 }]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={styles.gCircle}>
              <Text style={styles.gLetter}>G</Text>
            </View>
            <Text style={styles.googleLabel}>{t('continueWithGoogle')}</Text>
          </>
        )}
      </Pressable>

      <ErrorText>{error}</ErrorText>
      <Text style={styles.offline}>{t('loginOffline')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: 60, marginBottom: 48 },
  appName: { fontSize: 32, fontWeight: '700', color: colors.primary },
  tagline: { fontSize: 16, color: colors.muted, marginTop: 4 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  hint: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  google: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  gCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: { color: '#fff', fontWeight: '700', fontSize: 16 },
  googleLabel: { fontSize: 17, fontWeight: '600', color: colors.text },
  offline: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 12 },
});
