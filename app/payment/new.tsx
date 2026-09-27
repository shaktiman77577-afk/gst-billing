import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DateField } from '../../src/components/DateField';
import { FormHeader } from '../../src/components/FormHeader';
import { PartyPicker } from '../../src/components/PartyPicker';
import { Button, Card, Chips, ErrorText, Field, Hint, Label, Screen } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { getInvoice, PaymentDirection, PaymentMode, recordPayment } from '../../src/db/invoices';
import { getParty, getPartyBalance, listParties, PartyWithBalance } from '../../src/db/parties';
import { todayIso } from '../../src/lib/dates';
import { formatPaise, paiseToInput, toPaise } from '../../src/lib/money';
import { colors, radius } from '../../src/theme';

const MODES: PaymentMode[] = ['cash', 'upi', 'card', 'bank', 'cheque'];

export default function PaymentScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const params = useLocalSearchParams<{ partyId?: string; invoiceId?: string; direction?: string }>();
  const direction: PaymentDirection = params.direction === 'out' ? 'out' : 'in';
  const invoiceId = params.invoiceId || null;
  // Dashboard / parties quick actions launch this screen with only a direction —
  // the user must pick a party here (bill detail and party ledger pass it).
  const needsParty = !invoiceId && !params.partyId;

  const [partyId, setPartyId] = useState<string | null>(params.partyId || null);
  const [who, setWho] = useState('');
  const [sub, setSub] = useState('');
  const [due, setDue] = useState<number | null>(null); // bill balance (when paying a bill)
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
    setSub(`${bal >= 0 ? t('toCollect') : t('toPay')} ${formatPaise(Math.abs(bal))}`);
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
        setSub(`${inv.invoice_no} · ${t('balanceDue')} ${formatPaise(d)}`);
        setDue(d);
        setAmount(paiseToInput(Math.max(d, 0)));
      } else if (params.partyId) {
        await fillParty(params.partyId);
      } else if (businessId) {
        listParties(db, businessId).then(setParties);
      }
    })();
  }, [db, invoiceId, params.partyId, direction, t, businessId]);

  const onSave = async () => {
    const paise = toPaise(amount) ?? 0;
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

  const isIn = direction === 'in';
  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader title={isIn ? t('paymentInTitle') : t('paymentOutTitle')} />
      <Screen
        edges={['bottom']}
        footer={<Button label={t('save')} icon="checkmark-circle" onPress={onSave} loading={saving} />}
      >
        <Card>
          <Pressable onPress={() => needsParty && setPartyOpen(true)} disabled={!needsParty}>
            <View style={styles.who}>
              <View style={[styles.icon, { backgroundColor: isIn ? colors.successSoft : colors.dangerSoft }]}>
                <Ionicons
                  name={isIn ? 'arrow-down-circle' : 'arrow-up-circle'}
                  size={24}
                  color={isIn ? colors.success : colors.danger}
                />
              </View>
              <View style={styles.flexOnly}>
                <Text style={[styles.name, !who && styles.choose]}>{who || t('chooseParty')}</Text>
                {sub ? <Text style={styles.sub}>{sub}</Text> : null}
              </View>
              {needsParty ? <Ionicons name="chevron-forward" size={20} color={colors.faint} /> : null}
            </View>
          </Pressable>
        </Card>
        <Card>
          <Field
            label={t('amount')}
            placeholder="0"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            icon="cash-outline"
            style={styles.amountInput}
          />
          {isIn && !invoiceId ? <Hint>{t('autoAdjustHint')}</Hint> : null}
          <DateField label={t('paymentDate')} value={date} onChange={(d) => d && setDate(d)} />
          <Label>{t('paymentMode')}</Label>
          <Chips options={MODES.map((m) => ({ value: m, label: t(m) }))} value={mode} onChange={setMode} />
          <Field label={t('notes')} optionalLabel={t('optional')} value={notes} onChangeText={setNotes} />
        </Card>
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
  flexOnly: { flex: 1 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  choose: { color: colors.muted, fontWeight: '600' },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  amountInput: { fontSize: 22, fontWeight: '800' },
});
