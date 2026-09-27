import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FormHeader } from '../../src/components/FormHeader';
import { Button, Card, IconName, Screen, SectionHeader } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { useMembership } from '../../src/hooks/useMembership';
import { StringKey } from '../../src/i18n/strings';
import { MembershipRow, Plan, fetchMembershipHistory, fetchPlans, startUpgrade } from '../../src/lib/membership';
import { supabase } from '../../src/lib/supabase';
import { formatPaise } from '../../src/lib/money';
import { colors, radius } from '../../src/theme';

type T = (key: StringKey) => string;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function planLabel(plan: Plan, t: T): string {
  if (plan.duration_days >= 300) return t('mem_planYearly');
  return t('mem_planMonthly');
}

function planPerLabel(plan: Plan, t: T): string {
  if (plan.duration_days >= 300) return t('mem_perYear');
  return t('mem_perMonth');
}

const FEATURE_KEYS: StringKey[] = ['mem_featUnlimited', 'mem_featBackup', 'mem_featReports'];

export default function MembershipScreen() {
  const { t } = useApp();
  const mem = useMembership();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState(false);
  const [history, setHistory] = useState<MembershipRow[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      setLoggedIn(!!data.user);
    } catch {
      setLoggedIn(false);
    }
    try {
      const ps = await fetchPlans();
      setPlans(ps);
      setPlansError(false);
    } catch {
      setPlans([]);
      setPlansError(true);
    }
    try {
      const hs = await fetchMembershipHistory();
      setHistory(hs);
      setHistoryError(false);
    } catch {
      setHistory([]);
      setHistoryError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const upgrade = async (plan: Plan) => {
    setProcessingId(plan.id);
    try {
      const r = await startUpgrade(plan);
      if (r.success) {
        Alert.alert(t('mem_title'), t('mem_paySuccess'));
        await mem.refresh();
        try {
          setHistory(await fetchMembershipHistory());
        } catch {
          /* history will retry on next focus */
        }
      } else if (r.cancelled) {
        Alert.alert(t('mem_title'), t('mem_payCancelled'));
      } else {
        Alert.alert(t('mem_title'), r.error ?? t('mem_payFailed'));
      }
    } catch {
      Alert.alert(t('mem_title'), t('mem_payFailed'));
    } finally {
      setProcessingId(null);
    }
  };

  const restore = async () => {
    await mem.refresh();
    try {
      const hs = await fetchMembershipHistory();
      setHistory(hs);
      setHistoryError(false);
    } catch {
      setHistoryError(true);
    }
  };

  const planName = (planId: string) => {
    const p = plans.find((x) => x.id === planId);
    return p ? planLabel(p, t) : planId;
  };

  const statusMeta =
    mem.status === 'pro'
      ? { key: 'mem_statusPro' as const, icon: 'star' as IconName, bg: colors.successSoft, fg: colors.success }
      : mem.status === 'trial'
        ? { key: 'mem_statusTrial' as const, icon: 'time-outline' as IconName, bg: colors.warningSoft, fg: colors.warning }
        : { key: 'mem_statusFree' as const, icon: 'gift-outline' as IconName, bg: colors.primarySoft, fg: colors.primary };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('mem_title')} />
      <Screen edges={['bottom']}>
        {loggedIn === false ? (
          <Card>
            <Text style={styles.text}>{t('mem_loginNeeded')}</Text>
            <Button icon="log-in-outline" label={t('mem_loginGo')} onPress={() => router.replace('/login')} />
          </Card>
        ) : (
          <>
            {/* ---------- Status ---------- */}
            <Card style={styles.status}>
              <View style={[styles.icon, { backgroundColor: statusMeta.bg }]}>
                <Ionicons name={statusMeta.icon} size={28} color={statusMeta.fg} />
              </View>
              <View style={styles.flexOnly}>
                <Text style={styles.big}>{t(statusMeta.key)}</Text>
                {mem.status === 'free' ? (
                  <Text style={styles.muted}>{t('mem_freeNote')}</Text>
                ) : mem.status === 'trial' ? (
                  <Text style={styles.muted}>{t('mem_trialLeft').replace('{d}', String(mem.trialDaysLeft))}</Text>
                ) : mem.expiresAt ? (
                  <Text style={styles.muted}>
                    {t('mem_proUntil').replace('{date}', formatDate(mem.expiresAt))}
                  </Text>
                ) : null}
              </View>
            </Card>

            {mem.status === 'free' && mem.billsLimit > 0 ? (
              <Card>
                <View style={styles.kv}>
                  <Text style={styles.muted}>{t('mem_billsThisMonth')}</Text>
                  <Text style={styles.kvVal}>
                    {t('mem_billsUsed')
                      .replace('{used}', String(mem.billsUsed))
                      .replace('{limit}', String(mem.billsLimit))}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[styles.barFill, { width: `${Math.min(100, (mem.billsUsed / mem.billsLimit) * 100)}%` }]}
                  />
                </View>
              </Card>
            ) : null}

            {(plansError || historyError) && !mem.loading ? (
              <Text style={styles.offline}>{t('mem_offlineNote')}</Text>
            ) : null}

            {/* ---------- Plans ---------- */}
            <SectionHeader icon="star-outline" title={t('mem_viewPlans')} />
            {plans.map((plan) => {
              const yearly = plan.duration_days >= 300;
              const current = mem.planId === plan.id;
              return (
                <Card key={plan.id} style={current ? styles.currentCard : undefined}>
                  <View style={styles.planHead}>
                    <View style={styles.flexOnly}>
                      <View style={styles.planTitleRow}>
                        <Text style={styles.planName}>{planLabel(plan, t)}</Text>
                        {yearly ? (
                          <View style={styles.saveBadge}>
                            <Text style={styles.saveText}>{t('mem_saveYearly')}</Text>
                          </View>
                        ) : null}
                        {current ? (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentText}>{t('mem_currentPlan')}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.price}>
                        {formatPaise(plan.price_paise)}
                        <Text style={styles.per}> · {planPerLabel(plan, t)}</Text>
                      </Text>
                    </View>
                  </View>
                  {FEATURE_KEYS.map((key) => (
                    <View key={key} style={styles.feat}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={styles.featText}>{t(key)}</Text>
                    </View>
                  ))}
                  {current ? null : (
                    <Button
                      icon="card-outline"
                      label={processingId === plan.id ? t('mem_processing') : t('mem_upgrade')}
                      onPress={() => upgrade(plan)}
                      loading={processingId === plan.id}
                      disabled={processingId !== null}
                    />
                  )}
                </Card>
              );
            })}

            {/* ---------- Billing history ---------- */}
            <Card>
              <View style={styles.rowHead}>
                <Ionicons name="receipt-outline" size={20} color={colors.primary} />
                <Text style={styles.head}>{t('mem_history')}</Text>
              </View>
              {history.length === 0 ? (
                <Text style={styles.muted}>{t('mem_noHistory')}</Text>
              ) : (
                history.map((row, i) => (
                  <View key={row.id}>
                    {i > 0 ? <View style={styles.sep} /> : null}
                    <View style={styles.histRow}>
                      <View style={styles.flexOnly}>
                        <Text style={styles.rowText}>{planName(row.plan_id)}</Text>
                        <Text style={styles.muted}>
                          {formatDate(row.created_at)}
                          {row.razorpay_payment_id ? ` · ${row.razorpay_payment_id.slice(-8)}` : ''}
                        </Text>
                      </View>
                      <View style={styles.statusPill}>
                        <Text style={styles.statusPillText}>{row.status}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
              <View style={styles.gap}>
                <Button variant="outline" icon="refresh-outline" label={t('mem_restore')} onPress={restore} />
              </View>
            </Card>
          </>
        )}
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
  offline: { fontSize: 12, color: colors.faint, textAlign: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kvVal: { fontSize: 14, fontWeight: '600', color: colors.text },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  planHead: { marginBottom: 2 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  planName: { fontSize: 17, fontWeight: '800', color: colors.text },
  saveBadge: { backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  saveText: { fontSize: 11, fontWeight: '800', color: colors.success },
  currentBadge: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  currentText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  currentCard: { borderColor: colors.primary, borderWidth: 1.5 },
  price: { fontSize: 20, fontWeight: '800', color: colors.primary, marginTop: 2 },
  per: { fontSize: 13, fontWeight: '400', color: colors.muted },
  feat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featText: { fontSize: 14, color: colors.text },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  head: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowText: { fontSize: 15, fontWeight: '600', color: colors.text },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  gap: { marginTop: 12 },
});
