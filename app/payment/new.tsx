import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { DateField } from '../../src/components/DateField';
import { FormHeader } from '../../src/components/FormHeader';
import { PartyPicker } from '../../src/components/PartyPicker';
import { Button, Chips, ErrorText, Field, Label, Overline, Screen, Segmented } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { getInvoice, listOpenBills, PaymentDirection, PaymentMode, recordPayment } from '../../src/db/invoices';
import { getParty, getPartyBalance, listParties, PartyWithBalance } from '../../src/db/parties';
import { formatDate, todayIso } from '../../src/lib/dates';
import { formatPaise, paiseToInput, toPaise } from '../../src/lib/money';
import { colors, radius, spacing, tabular, text } from '../../src/theme';

const MODES: PaymentMode[] = ['cash', 'upi', 'card', 'bank', 'cheque'];

export default function PaymentScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const params = useLocalSearchParams<{ partyId?: string; invoiceId?: string; direction?: string }>();
  const invoiceId = params.invoiceId || null;
  const [direction, setDirection] = useState<PaymentDirection>(params.direction === 'out' ? 'out' : 'in');
  // Dashboard / parties quick actions launch this screen with only a direction —
  // the user must pick a party here (bill detail and party ledger pass it).
  const needsParty = !invoiceId && !params.partyId;

  const [partyId, setPartyId] = useState<string | null>(params.partyId || null);
  const [who, setWho] = useState('');
  const [whoSub, setWhoSub] = useState('');
  const [partyBal, setPartyBal] = useState<number | null>(null); // + party owes you
  const [due, setDue] = useState<number | null>(null); // bill balance (when paying a bill)
  const [openBills, setOpenBills] = useState<{ id: string; invoice_no: string; invoice_date: string; due: number }[]>([]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [parties, setParties] = useState<PartyWithBalance[]>([]);
  const [partyOpen, setPartyOpen] = useState(false);

  const fillParty = async (id: string) => {
    const p = await getParty(db, id);
    if (!p) return;
    const bal = await getPartyBalance(db, id);
    setPartyId(id);
    setWho(p.name);
    setWhoSub([p.gstin, p.phone].filter(Boolean).join(' · '));
    setPartyBal(bal);
    setOpenBills(await listOpenBills(db, id));
    const suggested = direction === 'in' ? Math.max(bal, 0) : Math.max(-bal, 0);
    if (suggested > 0 && amount.trim() === '') setAmount(paiseToInput(suggested));
  };

  useEffect(() => {
    (async () => {
      if (invoiceId) {
        const data = await getInvoice(db, invoiceId);
        if (!data) return;
        const inv = data.invoice;
        const d = inv.total_paise - inv.received_paise - inv.credited_paise;
        setPartyId(inv.party_id);
        setWho(inv.party_name);
        setWhoSub(inv.invoice_no);
        setDue(d);
        setAmount(paiseToInput(Math.max(d, 0)));
      } else if (params.partyId) {
        await fillParty(params.partyId);
      } else if (businessId) {
        listParties(db, businessId).then(setParties);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, invoiceId, params.partyId, businessId]);

  const isIn = direction === 'in';
  const paise = toPaise(amount) ?? 0;

  // What the "full" amount means here: the bill's balance, or what the party
  // owes you (Payment In) / what you owe them (Payment Out).
  const fullAmount =
    due !== null ? Math.max(due, 0) : partyBal !== null ? Math.max(isIn ? partyBal : -partyBal, 0) : 0;

  // Payment In without a bill is spread over open bills, oldest first
  // (same rule as recordPayment).
  const allocation = useMemo(() => {
    if (!isIn || invoiceId || paise <= 0) return [];
    let left = paise;
    const out: { no: string; date: string; take: number; due: number }[] = [];
    for (const b of openBills) {
      if (left <= 0) break;
      const take = Math.min(left, b.due);
      if (take <= 0) continue;
      out.push({ no: b.invoice_no, date: b.invoice_date, take, due: b.due });
      left -= take;
    }
    return out;
  }, [isIn, invoiceId, paise, openBills]);

  const balAfter =
    due !== null ? due - paise : partyBal !== null ? (isIn ? partyBal - paise : partyBal + paise) : null;

  const onSave = async () => {
    if (paise <= 0) return setError(t('errAmountZero'));
    if (due !== null && paise > due) return setError(t('errMoreThanDue'));
    if (needsParty && !partyId) return setError(t('errSelectParty'));
    if (!businessId) return;
    setError(null);
    setSaving(true);
    try {
      await recordPayment(db, {
        businessId,
        partyId,
        invoiceId,
        direction,
        amountPaise: paise,
        mode,
        paidOn: date,
        notes: notes.trim() || null,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const initials =
    who
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?';

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={isIn ? t('paymentIn') : t('paymentOut')} />
      <Screen
        edges={['bottom']}
        footer={
          <View style={styles.footer}>
            <View style={styles.flexOnly}>
              <Text style={styles.footLabel}>
                {balAfter === null ? t('amount') : due !== null ? t('balanceDue') : balAfter >= 0 ? t('toCollect') : t('toPay')}
              </Text>
              <Text style={styles.footValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatPaise(balAfter === null ? paise : Math.abs(balAfter))}
              </Text>
            </View>
            <View style={styles.footBtn}>
              <Button label={t('save')} onPress={onSave} loading={saving} />
            </View>
          </View>
        }
      >
        {!invoiceId ? (
          <Segmented
            options={[
              { value: 'in', label: t('paymentInTitle') },
              { value: 'out', label: t('paymentOutTitle') },
            ]}
            value={direction}
            onChange={(v) => setDirection(v as PaymentDirection)}
          />
        ) : null}

        {/* Party / bill */}
        <View style={styles.card}>
          <Overline>{invoiceId ? t('v2_againstBill') : t('party')}</Overline>
          <Pressable
            disabled={!needsParty}
            onPress={() => setPartyOpen(true)}
            style={({ pressed }) => [styles.partyRow, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.avatar, !who && { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.avatarText, !who && { color: colors.muted }]}>{who ? initials : '+'}</Text>
            </View>
            <View style={styles.flexOnly}>
              <Text style={styles.partyName} numberOfLines={1}>
                {who || t('chooseParty')}
              </Text>
              {whoSub || fullAmount > 0 ? (
                <Text style={styles.partySub} numberOfLines={1}>
                  {[whoSub, fullAmount > 0 ? `${due !== null ? t('balanceDue') : isIn ? t('toCollect') : t('toPay')} ${formatPaise(fullAmount)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
            {needsParty ? <Text style={styles.change}>{who ? t('v2_change') : ''}</Text> : null}
          </Pressable>
        </View>

        {/* Amount, mode, date, notes */}
        <View style={[styles.card, styles.form]}>
          <Field
            label={t('amount')}
            placeholder="0"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            icon="cash-outline"
            style={styles.amountInput}
          />
          {fullAmount > 0 ? (
            <View style={styles.quickRow}>
              <Pressable onPress={() => setAmount(paiseToInput(fullAmount))} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7 }]}>
                <Text style={styles.quickText}>
                  {t('v2_full')} {formatPaise(fullAmount)}
                </Text>
              </Pressable>
              {fullAmount >= 200 ? (
                <Pressable
                  onPress={() => setAmount(paiseToInput(Math.round(fullAmount / 2)))}
                  style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.quickText}>
                    {t('v2_half')} {formatPaise(Math.round(fullAmount / 2))}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View>
            <Label>{t('paymentMode')}</Label>
            <Chips options={MODES.map((m) => ({ value: m, label: t(m) }))} value={mode} onChange={setMode} />
          </View>
          <DateField label={t('paymentDate')} value={date} onChange={(d) => d && setDate(d)} />
          <Field label={t('notes')} optionalLabel={t('optional')} value={notes} onChangeText={setNotes} />
        </View>

        {/* Which bills this Payment In will settle */}
        {allocation.length > 0 ? (
          <View style={styles.preview}>
            <Text style={styles.previewHint}>{t('autoAdjustHint')}</Text>
            {allocation.map((a) => (
              <View key={a.no} style={styles.previewRow}>
                <Text style={styles.previewBill} numberOfLines={1}>
                  {a.no} · {formatDate(a.date)}
                </Text>
                <Text style={[styles.previewAmt, a.take >= a.due && { color: colors.success }]}>
                  {a.take >= a.due
                    ? `${formatPaise(a.take)} · ${t('paid')}`
                    : `${formatPaise(a.take)} / ${formatPaise(a.due)}`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <ErrorText>{error}</ErrorText>
      </Screen>
      <PartyPicker
        visible={partyOpen}
        parties={parties}
        onClose={() => setPartyOpen(false)}
        onPick={(p) => {
          setPartyOpen(false);
          if (p) void fillParty(p.id); // cash row = close without picking
        }}
        onAddNew={() => {
          setPartyOpen(false);
          router.push('/party/new');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  form: { gap: 14 },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: text.sm, fontWeight: '700', color: colors.primary },
  partyName: { fontSize: text.md, lineHeight: 20, fontWeight: '500', color: colors.text },
  partySub: { fontSize: text.xs, lineHeight: 16, color: colors.muted, marginTop: 1, ...tabular },
  change: { fontSize: text.sm, fontWeight: '500', color: colors.primary },
  amountInput: { fontSize: 18, fontWeight: '700', ...tabular },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: -4 },
  quick: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: { fontSize: text.xs, fontWeight: '500', color: colors.textSecondary, ...tabular },
  preview: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.md + 2,
    padding: 12,
    gap: 6,
  },
  previewHint: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  previewBill: { flex: 1, fontSize: text.sm, color: colors.text },
  previewAmt: { fontSize: text.sm, fontWeight: '500', color: colors.text, ...tabular },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footLabel: { fontSize: text.xs, color: colors.muted },
  footValue: { fontSize: 17, fontWeight: '700', color: colors.text, ...tabular },
  footBtn: { flex: 1.2 },
});
