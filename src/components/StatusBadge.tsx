import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { InvoiceKind, InvoiceStatus, isReturnKind } from '../db/invoices';
import { trReturns } from '../i18n/parity_returns';
import { colors, radius, spacing, text } from '../theme';

const STYLE: Record<InvoiceStatus, { bg: string; fg: string }> = {
  paid: { bg: colors.successSoft, fg: colors.success },
  partial: { bg: colors.accentSoft, fg: colors.warning },
  unpaid: { bg: colors.dangerSoft, fg: colors.danger },
  cancelled: { bg: colors.border, fg: colors.muted },
};

export function StatusBadge({ status, kind }: { status: InvoiceStatus; kind?: InvoiceKind }) {
  const { t, language } = useApp();
  const isCn = !!kind && isReturnKind(kind) && status !== 'cancelled';
  const s = isCn ? { bg: colors.primarySoft, fg: colors.primary } : STYLE[status];
  const label = isCn
    ? kind === 'sales_return'
      ? trReturns(language, 'salesReturn')
      : t('creditNote')
    : t(status);
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontSize: text.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
});
