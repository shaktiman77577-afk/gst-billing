import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { InvoiceListRow } from '../db/invoices';
import { formatDate } from '../lib/dates';
import { formatPaise } from '../lib/money';
import { colors, radius, shadow } from '../theme';
import { StatusBadge } from './StatusBadge';

export function BillRow({ bill, flat = false }: { bill: InvoiceListRow; flat?: boolean }) {
  const due = bill.total_paise - bill.received_paise;
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
        <Text style={styles.amount}>{formatPaise(bill.total_paise)}</Text>
        {bill.status === 'partial' ? (
          <Text style={styles.due}>{formatPaise(due)}</Text>
        ) : (
          <StatusBadge status={bill.status} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, ...shadow },
  flex: { flex: 1 },
  party: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  due: { fontSize: 12, fontWeight: '700', color: '#B45309' },
});
