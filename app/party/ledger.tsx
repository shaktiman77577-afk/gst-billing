import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../src/components/EmptyState';
import { IconChip, IconName } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { LedgerEntry, partyLedger, PaymentMode } from '../../src/db/invoices';
import { getParty, getPartyBalance, Party } from '../../src/db/parties';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { whatsappMessage } from '../../src/pdf/share';
import { colors, radius, shadow, text } from '../../src/theme';

export default function PartyLedgerScreen() {
  const db = useSQLiteContext();
  const { t, language } = useApp();
  const business = useBusiness();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [party, setParty] = useState<Party | null>(null);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getParty(db, id).then(setParty);
      getPartyBalance(db, id).then(setBalance);
      partyLedger(db, id).then((e) => setEntries(e.reverse())); // newest first
    }, [db, id]),
  );

  if (!party) return <View style={styles.flex} />;

  const phone = party.phone;
  const remind = () => {
    if (!phone) return;
    const text = t('waReminder')
      .replace('{name}', party.name)
      .replace('{amount}', formatPaise(Math.abs(balance)))
      .replace('{business}', business?.name ?? '');
    whatsappMessage(phone, text).catch(() => undefined);
  };

  const actions: { icon: IconName; label: string; onPress: () => void; show: boolean }[] = [
    {
      icon: 'document-text-outline',
      label: t('newBill'),
      onPress: () => router.push({ pathname: '/bill/new', params: { partyId: party.id } }),
      show: true,
    },
    {
      icon: 'arrow-down-circle-outline',
      label: t('paymentIn'),
      onPress: () => router.push({ pathname: '/payment/new', params: { partyId: party.id, direction: 'in' } }),
      show: true,
    },
    {
      icon: 'arrow-up-circle-outline',
      label: t('paymentOut'),
      onPress: () => router.push({ pathname: '/payment/new', params: { partyId: party.id, direction: 'out' } }),
      show: true,
    },
    { icon: 'call-outline', label: t('call'), onPress: () => Linking.openURL(`tel:${phone}`), show: !!phone },
    { icon: 'logo-whatsapp', label: t('reminder'), onPress: remind, show: !!phone && balance > 0 },
  ];

  const labelFor = (e: LedgerEntry) => {
    switch (e.type) {
      case 'opening':
        return t('openingBalance');
      case 'invoice':
        return e.ref;
      case 'credit_note':
        return `${t('creditNote')} ${e.ref}`;
      case 'sales_return':
        return `${t('salesReturn')} ${e.ref}`;
      case 'payment_in':
        return `${t('paymentIn')} · ${t(e.ref as PaymentMode)}`;
      default:
        return `${t('paymentOut')} · ${t(e.ref as PaymentMode)}`;
    }
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.name} numberOfLines={1}>
            {party.name}
          </Text>
          <Pressable onPress={() => router.push(`/party/${party.id}`)} hitSlop={10}>
            <Ionicons name="create-outline" size={22} color={colors.white} />
          </Pressable>
        </View>
        <Text style={styles.balLabel}>{balance >= 0 ? t('toCollect') : t('toPay')}</Text>
        <Text style={styles.bal}>{formatPaise(Math.abs(balance))}</Text>
        {party.phone ? <Text style={styles.phone}>{party.phone}</Text> : null}
      </View>

      <View style={styles.actions}>
        {actions
          .filter((a) => a.show)
          .map((a) => (
            <Pressable key={a.label} onPress={a.onPress} style={styles.action}>
              <IconChip icon={a.icon} />
              <Text style={styles.actionLabel} numberOfLines={1}>
                {a.label}
              </Text>
            </Pressable>
          ))}
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => `${e.type}-${e.id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.section}>{t('ledger')}</Text>}
        ListEmptyComponent={<EmptyState icon="book-outline" title={t('noEntries')} hint="" />}
        renderItem={({ item: e }) => {
          const up = e.amount_paise > 0;
          const isBill = e.type === 'invoice' || e.type === 'credit_note' || e.type === 'sales_return';
          return (
            <Pressable
              disabled={!e.invoice_id}
              onPress={() => e.invoice_id && router.push(`/bill/${e.invoice_id}`)}
              style={styles.entry}
            >
              <IconChip
                icon={
                  e.type === 'invoice'
                    ? 'document-text-outline'
                    : e.type === 'credit_note' || e.type === 'sales_return'
                      ? 'return-down-back-outline'
                      : e.type === 'opening'
                        ? 'flag-outline'
                        : 'cash-outline'
                }
                bg={isBill ? colors.primarySoft : colors.successSoft}
                fg={isBill ? colors.primary : colors.success}
              />
              <View style={styles.flexOnly}>
                <Text style={[styles.entryTitle, e.cancelled && styles.strike]}>{labelFor(e)}</Text>
                <Text style={styles.meta}>
                  {formatDate(e.date)}
                  {e.cancelled ? ` · ${t('cancelled')}` : ''}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={[styles.amt, { color: e.cancelled ? colors.faint : up ? colors.danger : colors.success }]}>
                  {e.amount_paise === 0 ? '—' : `${up ? '+' : '−'} ${formatPaise(Math.abs(e.amount_paise))}`}
                </Text>
                <Text style={styles.meta}>{formatPaise(e.balance_paise)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1 },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 40,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  name: { flex: 1, color: colors.white, fontSize: text.xl, fontWeight: '800' },
  balLabel: { color: colors.whiteSoft, fontSize: text.sm },
  bal: { color: colors.white, fontSize: text.xl, fontWeight: '800', marginTop: 2 },
  phone: { color: colors.whiteSoft, fontSize: text.sm, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -28,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 12,
    ...shadow,
  },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionLabel: { fontSize: text.xs, fontWeight: '600', color: colors.text, textAlign: 'center' },
  list: { padding: 16, gap: 8, paddingBottom: 40 },
  section: { fontSize: text.md, fontWeight: '700', color: colors.text, marginBottom: 4 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    minHeight: 48,
  },
  entryTitle: { fontSize: text.md, fontWeight: '700', color: colors.text },
  strike: { textDecorationLine: 'line-through', color: colors.faint },
  meta: { fontSize: text.xs, color: colors.muted, marginTop: 1 },
  right: { alignItems: 'flex-end' },
  amt: { fontSize: text.md, fontWeight: '800' },
});
