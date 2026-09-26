import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ErrorText, Field, Hint, Screen, Title } from '../src/components/ui';
import { useApp } from '../src/context/AppContext';
import { StringKey } from '../src/i18n/strings';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme';

const RESEND_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorKey(err: unknown): StringKey {
  const e = err as { status?: number; name?: string; message?: string } | null;
  const message = (e?.message ?? '').toLowerCase();
  if (e?.name === 'AuthRetryableFetchError' || message.includes('network')) return 'noInternet';
  if (e?.status === 429 || message.includes('rate limit')) return 'tooManyEmails';
  if (message.includes('expired') || message.includes('invalid') || message.includes('token')) {
    return 'wrongOtp';
  }
  return 'somethingWrong';
}

export default function LoginScreen() {
  const { t, completeLogin } = useApp();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const cleanEmail = email.trim().toLowerCase();

  const sendCode = async () => {
    setError(null);
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setError(t('invalidEmail'));
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      setStep('otp');
      setOtp('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setError(null);
    const code = otp.trim();
    if (!/^\d{6,8}$/.test(code)) {
      setError(t('invalidOtp'));
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: code,
        type: 'email',
      });
      if (err) throw err;
      const user = data.user;
      if (!user) throw new Error('no user');
      await completeLogin(user.id, user.email ?? cleanEmail);
      router.replace('/');
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'email') {
    return (
      <Screen>
        <View style={styles.top}>
          <Title>{t('loginTitle')}</Title>
          <Hint>{t('loginHint')}</Hint>
        </View>
        <Field
          label={t('emailLabel')}
          placeholder={t('emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={sendCode}
        />
        <ErrorText>{error}</ErrorText>
        <Button label={t('sendCode')} onPress={sendCode} loading={loading} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Title>{t('otpTitle')}</Title>
        <Hint>
          {t('otpHint')} <Text style={styles.email}>{cleanEmail}</Text>
        </Hint>
      </View>
      <Field
        label={t('otpLabel')}
        placeholder="123456"
        value={otp}
        onChangeText={(v) => setOtp(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={8}
        autoComplete="one-time-code"
        style={styles.otpInput}
        returnKeyType="done"
        onSubmitEditing={verify}
      />
      <ErrorText>{error}</ErrorText>
      <Button label={t('verify')} onPress={verify} loading={loading} />
      <Text style={styles.spam}>{t('checkSpam')}</Text>
      <Button
        variant="text"
        label={cooldown > 0 ? `${t('resendIn')} (${cooldown}s)` : t('resendCode')}
        onPress={sendCode}
        disabled={cooldown > 0 || loading}
      />
      <Button
        variant="text"
        label={t('changeEmail')}
        onPress={() => {
          setStep('email');
          setError(null);
        }}
        disabled={loading}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: 40, marginBottom: 8 },
  email: { fontWeight: '600', color: colors.text },
  otpInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  spam: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 },
});
