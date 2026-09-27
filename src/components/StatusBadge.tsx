import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useApp } from '../context/AppContext';
import { InvoiceKind, InvoiceStatus, isReturnKind } from '../db/invoices';
import { colors, radius, spacing, text } from '../theme';

const STYLE: Record<InvoiceStatus, { bg: string; fg: string }> = {
  paid: { bg: colors.successSoft, fg: colors.success },
  partial: { bg: colors.warningSoft, fg: colors.warning },
  unpaid: { bg: colors.dangerSoft, fg: colors.danger },
  cancelled: { bg: colors.surfaceAlt, fg: colors.muted },
};

export function StatusBadge({ status, kind }: { status: InvoiceStatus; kind?: InvoiceKind }) {
  const { t, language } = useApp();
  const isCn = !!kind && isReturnKind(kind) && status !== 'cancelled';
  const s = isCn ? { bg: colors.primarySoft, fg: colors.primary } : STYLE[status];
  const label = isCn
    ? kind === 'sales_return'
      ? t('salesReturn')
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
    paddingVertical: 2,
    borderRadius: radius.sm - 2,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, lineHeight: 16, fontWeight: '500' },
});
