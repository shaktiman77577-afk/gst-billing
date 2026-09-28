import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../src/components/EmptyState';
import { AppAlert } from '../../src/components/AppDialog';
import { FormHeader } from '../../src/components/FormHeader';
import { useApp } from '../../src/context/AppContext';
import { LedgerEntry, partyLedger, PaymentMode } from '../../src/db/invoices';
import { getParty, getPartyBalance, Party } from '../../src/db/parties';
import { useBusiness } from '../../src/hooks/useBusiness';
import { formatDate } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { sharePdfOnWhatsApp, whatsappMessage } from '../../src/pdf/share';
import { statementHtml } from '../../src/pdf/statement';
import { colors, radius, spacing, tabular, text } from '../../src/theme';

export default function PartyLedgerScreen() {
  const db = useSQLiteContext();
  const { t, language } = useApp();
  const business = useBusiness();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [party, setParty] = useState<Party | null>(null);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [sharing, setSharing] = useState(false);

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


  const isSupplier = party.party_type === 'supplier';
  const initials =
    party.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?';
  const sub = [party.gstin, party.phone].filter(Boolean).join(' · ');

  const onStatement = async () => {
    if (!business || sharing) return;
    setSharing(true);
    try {
      const html = statementHtml(business, party, [...entries].reverse(), balance, labelFor, {
        title: t('v2_statement').toUpperCase(),
        entry: t('v2_entry'),
        debit: t('v2_billCol'),
        credit: t('v2_paidCol'),
        balance: t('v2_balanceCol'),
        closing: t('v2_closing'),
        toCollect: t('toCollect'),
        toPay: t('toPay'),
      });
      const safe = party.name.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30);
      await sharePdfOnWhatsApp(html, `Statement-${safe}`, party.phone, `${t('v2_statement')} — ${party.name}`);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) AppAlert.alert(t('v2_statement'), t('pdfError'));
    } finally {
      setSharing(false);
    }
  };

  const balTone =
    balance > 0
      ? { bg: colors.successSoft, fg: colors.success, label: t('toCollect') }
      : balance < 0
        ? { bg: colors.dangerSoft, fg: colors.danger, label: t('toPay') }
        : { bg: colors.surfaceAlt, fg: colors.muted, label: t('settled') };

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <FormHeader
        title={t('ledger')}
        right={
          <Pressable onPress={() => router.push(`/party/${party.id}`)} hitSlop={8} style={styles.editBtn}>
            <Text style={styles.editText}>{t('edit')}</Text>
          </Pressable>
        }
      />

      <FlatList
        data={entries}
        keyExtractor={(e) => `${e.type}-${e.id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headWrap}>
            {/* Party card */}
            <View style={styles.card}>
              <View style={styles.partyRow}>
                <View style={[styles.avatar, isSupplier && { backgroundColor: colors.warningSoft }]}>
                  <Text style={[styles.avatarText, isSupplier && { color: colors.warning }]}>{initials}</Text>
                </View>
                <View style={styles.flexOnly}>
                  <Text style={styles.name} numberOfLines={1}>
                    {party.name}
                  </Text>
                  {sub ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={[styles.balBox, { backgroundColor: balTone.bg }]}>
                <Text style={[styles.balLabel, { color: balTone.fg }]}>{balTone.label}</Text>
                <Text style={[styles.bal, { color: balTone.fg }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatPaise(Math.abs(balance))}
                </Text>
              </View>
              <View style={styles.actions}>
                {phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${phone}`)} style={({ pressed }) => [styles.actBtn, pressed && styles.pressed]}>
                    <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.actText}>{t('call')}</Text>
                  </Pressable>
                ) : null}
                {phone && balance > 0 ? (
                  <Pressable onPress={remind} style={({ pressed }) => [styles.actBtn, pressed && styles.pressed]}>
                    <Ionicons name="logo-whatsapp" size={16} color="#1DA851" />
                    <Text style={styles.actText}>{t('reminder')}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={onStatement}
                  disabled={sharing || entries.length === 0}
                  style={({ pressed }) => [styles.actBtn, (pressed || sharing) && styles.pressed, entries.length === 0 && { opacity: 0.5 }]}
                >
                  {sharing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
                  )}
                  <Text style={styles.actText}>{t('v2_statement')}</Text>
                </Pressable>
              </View>
            </View>

            {entries.length > 0 ? (
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.flexOnly]}>{t('v2_entry')}</Text>
                <Text style={[styles.th, styles.numCol]}>{t('v2_billCol')}</Text>
                <Text style={[styles.th, styles.numCol]}>{t('v2_paidCol')}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="book-outline" title={t('noEntries')} hint="" />}
        renderItem={({ item: e, index }) => {
          const up = e.amount_paise > 0;
          const amt = e.amount_paise === 0 ? '—' : formatPaise(Math.abs(e.amount_paise));
          const last = index === entries.length - 1;
          return (
            <Pressable
              disabled={!e.invoice_id}
              onPress={() => e.invoice_id && router.push(`/bill/${e.invoice_id}`)}
              style={({ pressed }) => [styles.row, last ? styles.rowLast : styles.rowDivider, pressed && { backgroundColor: colors.primaryTint }]}
            >
              <View style={styles.flexOnly}>
                <Text style={[styles.rowTitle, e.cancelled && styles.strike]} numberOfLines={1}>
                  {labelFor(e)}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {formatDate(e.date)}
                  {e.cancelled ? ` · ${t('cancelled')}` : ` · ${t('v2_bal')} ${formatPaise(e.balance_paise)}`}
                </Text>
              </View>
              <Text style={[styles.num, styles.numCol, e.cancelled && styles.strike]}>{up ? amt : ''}</Text>
              <Text style={[styles.num, styles.numCol, { color: colors.success }, e.cancelled && styles.strike]}>
                {up ? '' : amt}
              </Text>
            </Pressable>
          );
        }}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() =>
            router.push({ pathname: '/payment/new', params: { partyId: party.id, direction: isSupplier ? 'out' : 'in' } })
          }
          style={({ pressed }) => [styles.footBtn, styles.footOutline, pressed && styles.pressed]}
        >
          <Text style={[styles.footText, { color: isSupplier ? colors.danger : colors.success }]}>
            {isSupplier ? t('paymentOut') : t('paymentIn')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/bill/new', params: { partyId: party.id } })}
          style={({ pressed }) => [styles.footBtn, styles.footPrimary, pressed && styles.pressed]}
        >
          <Text style={[styles.footText, { color: colors.white }]}>{t('newBill')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flexOnly: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.75 },
  editBtn: { height: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  editText: { fontSize: text.sm, fontWeight: '500', color: colors.primary },
  list: { padding: spacing.lg, paddingBottom: 24 },
  headWrap: { gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 14,
  },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md + 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  name: { fontSize: text.lg, lineHeight: 22, fontWeight: '700', color: colors.text },
  sub: { fontSize: text.xs, lineHeight: 16, color: colors.muted, marginTop: 1 },
  balBox: { borderRadius: radius.md, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  balLabel: { fontSize: text.sm, fontWeight: '500' },
  bal: { fontSize: 20, fontWeight: '700', flexShrink: 1, ...tabular },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actBtn: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    paddingHorizontal: 6,
  },
  actText: { fontSize: text.sm, fontWeight: '500', color: colors.text },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  th: { fontSize: text.xs, fontWeight: '500', color: colors.muted },
  numCol: { width: 84, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowTitle: { fontSize: text.sm, lineHeight: 18, fontWeight: '500', color: colors.text },
  rowSub: { fontSize: text.xs, lineHeight: 16, color: colors.muted, marginTop: 1, ...tabular },
  num: { fontSize: text.sm, color: colors.text, ...tabular },
  strike: { textDecorationLine: 'line-through', color: colors.faint },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footBtn: { flex: 1, height: 48, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  footOutline: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  footPrimary: { backgroundColor: colors.primary },
  footText: { fontSize: 15, fontWeight: '500' },
});
