// Delete account — permanent removal of the account and all cloud data
// (Play Store requirement for apps with login). The user must type DELETE.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { FormHeader } from '../../src/components/FormHeader';
import { Text, TextInput } from '../../src/components/Text';
import { Button, Screen } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { supabase } from '../../src/lib/supabase';
import { cancelSync } from '../../src/sync/engine';
import { colors, radius, spacing, text } from '../../src/theme';

export default function DeleteAccountScreen() {
  const { t, forceLogout } = useApp();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = typed.trim().toUpperCase() === 'DELETE';

  const onDelete = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      cancelSync(); // nothing more is uploaded for this account
      const res = await supabase.functions.invoke('delete-account', { body: {} });
      const ok = !res.error && (res.data as { ok?: boolean } | null)?.ok;
      if (!ok) throw new Error('delete_failed');
      await forceLogout(); // also wipes this phone's data
      router.replace('/login');
      AppAlert.alert(t('v2_delDoneTitle'), t('v2_delDoneMsg'), undefined, { tone: 'success' });
    } catch {
      AppAlert.alert(t('v2_deleteAccount'), t('v2_delFailed'), undefined, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('v2_deleteAccount')} />
      <Screen
        edges={['bottom']}
        footer={<Button label={t('v2_delButton')} variant="danger" onPress={onDelete} loading={busy} disabled={!ready} />}
      >
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="warning-outline" size={22} color={colors.danger} />
          </View>
          <Text style={styles.title}>{t('v2_delTitle')}</Text>
          <Text style={styles.body}>{t('v2_delIntro')}</Text>
          {[t('v2_delPoint1'), t('v2_delPoint2'), t('v2_delPoint3')].map((p) => (
            <View key={p} style={styles.point}>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.body}>{p}</Text>
            </View>
          ))}
          <Text style={styles.warn}>{t('v2_delWarn')}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>{t('v2_delTypeLabel')}</Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            style={styles.input}
          />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md + 2,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.text },
  body: { flex: 1, fontSize: text.md, lineHeight: 20, color: colors.textSecondary },
  point: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  dot: { fontSize: text.md, lineHeight: 20, color: colors.muted },
  warn: { fontSize: text.sm, lineHeight: 18, color: colors.danger, marginTop: 4 },
  label: { fontSize: text.xs, fontWeight: '500', color: colors.muted },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: text.md,
    color: colors.text,
    letterSpacing: 1,
  },
});
