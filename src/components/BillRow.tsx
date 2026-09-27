import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { InvoiceListRow } from '../db/invoices';
import { formatDate } from '../lib/dates';
import { formatPaise } from '../lib/money';
import { colors, radius, shadowSm, text } from '../theme';
import { StatusBadge } from './StatusBadge';

export function BillRow({ bill, flat = false }: { bill: InvoiceListRow; flat?: boolean }) {
  const due = bill.total_paise - bill.received_paise - bill.credited_paise;
  const isCn = bill.kind === 'credit_note' || bill.kind === 'sales_return';
  const cancelled = bill.status === 'cancelled';
  return (
    <Pressable
      onPress={() => router.push(`/bill/${bill.id}`)}
      style={({ pressed }) => [styles.row, !flat && styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.flex}>
        <Text style={styles.party} numberOfLines={1}>
          {bill.party_name}
        </Text>
        <Text style={styles.sub}>
          {bill.invoice_no} · {formatDate(bill.invoice_date)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text
          style={[
            styles.amount,
            isCn && { color: colors.primary },
            cancelled && { color: colors.faint, textDecorationLine: 'line-through' },
          ]}
        >
          {isCn ? '− ' : ''}
          {formatPaise(bill.total_paise)}
        </Text>
        {bill.status === 'partial' && !isCn ? (
          <Text style={styles.due}>{formatPaise(due)}</Text>
        ) : (
          <StatusBadge status={bill.status} kind={bill.kind} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadowSm,
  },
  flex: { flex: 1 },
  party: { fontSize: text.md, fontWeight: '700', color: colors.text },
  sub: { fontSize: text.sm, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: text.md, fontWeight: '800', color: colors.text },
  due: { fontSize: text.xs, fontWeight: '700', color: colors.warning },
});
