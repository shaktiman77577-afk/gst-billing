import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { InvoiceStatus } from '../db/invoices';
import { colors, radius } from '../theme';

const STYLE: Record<InvoiceStatus, { bg: string; fg: string }> = {
  paid: { bg: colors.successSoft, fg: colors.success },
  partial: { bg: colors.accentSoft, fg: '#B45309' },
  unpaid: { bg: colors.dangerSoft, fg: colors.danger },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useApp();
  const s = STYLE[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]}>{t(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
});
