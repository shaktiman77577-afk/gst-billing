import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppAlert } from '../../src/components/AppDialog';
import { Text } from '../../src/components/Text';
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

// Honest Pro feature list — only features the app actually has.
const PRO_FEATURES: { key: StringKey; icon: IconName; yearlyOnly?: boolean }[] = [
  { key: 'mem_featUnlimited', icon: 'infinite-outline' },
  { key: 'mem_featWhiteLabel', icon: 'ribbon-outline' },
  { key: 'mem_featThemes', icon: 'color-palette-outline' },
  { key: 'mem_featRecycle', icon: 'trash-bin-outline', yearlyOnly: true },
  { key: 'mem_featAutoBackup', icon: 'cloud-upload-outline' },
  { key: 'mem_featExports', icon: 'share-outline' },
  { key: 'mem_featSupport', icon: 'headset-outline' },
];

export default function MembershipScreen() {
  const { t } = useApp();
  const mem = useMembership();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState(false);
  const [history, setHistory] = useState<MembershipRow[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

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

  // Default to the yearly plan once plans load (best value, like the reference).
  useEffect(() => {
    if (selectedPlanId || plans.length === 0) return;
    const yearly = plans.find((p) => p.duration_days >= 300);
    setSelectedPlanId((yearly ?? plans[0]).id);
  }, [plans, selectedPlanId]);

  const showPayFailed = (plan: Plan) => {
    AppAlert.alert(
      t('v2_payNotDoneTitle'),
      t('v2_payNotDone'),
      [
        { text: t('v2_close'), style: 'cancel' },
        { text: t('v2_tryAgain'), onPress: () => void upgrade(plan) },
      ],
      { tone: 'error' },
    );
  };

  const upgrade = async (plan: Plan) => {
    setProcessingId(plan.id);
    try {
      const r = await startUpgrade(plan);
      if (r.success) {
        AppAlert.alert(t('mem_title'), t('mem_paySuccess'), undefined, { tone: 'success' });
        await mem.refresh();
        try {
          setHistory(await fetchMembershipHistory());
        } catch {
          /* history will retry on next focus */
        }
      } else if (r.cancelled) {
        AppAlert.alert(t('mem_title'), t('mem_payCancelled'));
      } else {
        // Razorpay sends raw JSON here (e.g. BAD_REQUEST_ERROR / payment_error
        // when the customer's bank or UPI app declines) — show plain words.
        showPayFailed(plan);
      }
    } catch {
      showPayFailed(plan);
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

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const selectedIsCurrent = !!selectedPlan && mem.planId === selectedPlan.id;
  const buying = processingId !== null;

  const bottomBar =
    loggedIn && plans.length > 0 && selectedPlan ? (
      <View style={styles.bar}>
        <View style={styles.barPrice}>
          <Text style={styles.barAmount}>
            {formatPaise(selectedPlan.price_paise)}
            <Text style={styles.barPer}>
              {' '}
              / {planPerLabel(selectedPlan, t)}
            </Text>
          </Text>
          {selectedPlan.duration_days >= 300 ? (
            <Text style={styles.barNote}>{t('mem_billedAnnually')}</Text>
          ) : null}
        </View>
        {selectedIsCurrent ? (
          <View style={styles.currentPill}>
            <Text style={styles.currentPillText}>{t('mem_currentPlan')}</Text>
          </View>
        ) : (
          <Button
            label={processingId === selectedPlan.id ? t('mem_processing') : t('mem_buyPro')}
            onPress={() => upgrade(selectedPlan)}
            loading={processingId === selectedPlan.id}
            disabled={buying}
          />
        )}
      </View>
    ) : null;

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={t('mem_title')} />
      <Screen edges={['bottom']} footer={bottomBar} contentStyle={bottomBar ? styles.withBar : undefined}>
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
                <Ionicons name={statusMeta.icon} size={26} color={statusMeta.fg} />
              </View>
              <View style={styles.flexOnly}>
                <Text style={styles.big}>{t(statusMeta.key)}</Text>
                {mem.status === 'free' ? (
                  <Text style={styles.muted}>{t('mem_freeNote').replace('{limit}', String(mem.billsLimit))}</Text>
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

            {/* ---------- What's included ---------- */}
            <SectionHeader icon="sparkles-outline" title={t('mem_includesPro')} />
            <Card style={styles.featCard}>
              {PRO_FEATURES.map((f, i) => (
                <View key={f.key}>
                  {i > 0 ? <View style={styles.sep} /> : null}
                  <View style={styles.featRow}>
                    <View style={styles.featIcon}>
                      <Ionicons name={f.icon} size={19} color={colors.primary} />
                    </View>
                    <Text style={styles.featText}>{t(f.key)}</Text>
                    {f.yearlyOnly ? (
                      <View style={styles.yearlyTag}>
                        <Text style={styles.yearlyTagText}>{t('v2_yearlyOnly')}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>

            {/* ---------- Plans ---------- */}
            <SectionHeader icon="star-outline" title={t('mem_viewPlans')} />
            {plans.map((plan) => {
              const yearly = plan.duration_days >= 300;
              const current = mem.planId === plan.id;
              const selected = plan.id === selectedPlanId;
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => setSelectedPlanId(plan.id)}
                  style={[styles.planCard, selected && styles.planCardSelected]}
                >
                  <View style={[styles.radio, selected && styles.radioOn]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
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
                      <Text style={styles.per}> / {planPerLabel(plan, t)}</Text>
                    </Text>
                    {yearly ? <Text style={styles.billedNote}>{t('mem_billedAnnually')}</Text> : null}
                  </View>
                </Pressable>
              );
            })}

            {/* ---------- Billing history ---------- */}
            <Card>
              <View style={styles.rowHead}>
                <Ionicons name="receipt-outline" size={19} color={colors.primary} />
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
  withBar: { paddingBottom: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 54, height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 13, color: colors.muted },
  big: { fontSize: 18, fontWeight: '800', color: colors.text },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  offline: { fontSize: 12, color: colors.faint, textAlign: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kvVal: { fontSize: 14, fontWeight: '600', color: colors.text },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginTop: 10 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  // Elegant compact feature list (myBillBook-style)
  featCard: { paddingVertical: 6 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  featIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featText: { fontSize: 14, color: colors.text, flex: 1, lineHeight: 21 },
  // Selectable plan cards
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
  },
  planCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  planName: { fontSize: 15, fontWeight: '800', color: colors.text },
  saveBadge: { backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  saveText: { fontSize: 11, fontWeight: '800', color: colors.success },
  currentBadge: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  currentText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  price: { fontSize: 17, fontWeight: '800', color: colors.primary, marginTop: 2 },
  per: { fontSize: 13, fontWeight: '400', color: colors.muted },
  billedNote: { fontSize: 12, color: colors.muted, marginTop: 2 },
  // Bottom buy bar (myBillBook-style, anchored)
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  barPrice: { flex: 1 },
  barAmount: { fontSize: 18, fontWeight: '800', color: colors.text },
  barPer: { fontSize: 13, fontWeight: '400', color: colors.muted },
  barNote: { fontSize: 12, color: colors.muted, marginTop: 1 },
  currentPill: { backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  currentPillText: { fontSize: 14, fontWeight: '800', color: colors.success },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  head: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowText: { fontSize: 14, fontWeight: '600', color: colors.text },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  gap: { marginTop: 12 },
  yearlyTag: { backgroundColor: colors.warningSoft, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 1 },
  yearlyTagText: { fontSize: 11, lineHeight: 16, fontWeight: '500', color: colors.warning },
});
