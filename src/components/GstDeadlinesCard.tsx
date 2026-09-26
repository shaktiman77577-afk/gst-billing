import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useBusiness } from '../hooks/useBusiness';
import { formatDate } from '../lib/dates';
import { getGstDeadlines, GstDeadline, isUrgent, periodLabel } from '../lib/gstDeadlines';
import { colors, radius, shadowSm } from '../theme';
import { Card } from './ui';

// GST statutory deadline reminders. Pure date math (no DB, no network) via
// getGstDeadlines — hidden entirely for non-GST-registered businesses.
export function GstDeadlinesCard() {
  const { t } = useApp();
  const business = useBusiness();
  if (!business?.gst_registered) return null;

  const deadlines = getGstDeadlines(new Date());

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <Text style={styles.title}>{t('due_title')}</Text>
      </View>
      {deadlines.map((d) => (
        <DeadlineRow key={d.code} deadline={d} />
      ))}
      <Text style={styles.hint}>{t('due_monthlyHint')}</Text>
    </Card>
  );
}

function DeadlineRow({ deadline }: { deadline: GstDeadline }) {
  const { t } = useApp();
  const urgent = isUrgent(deadline);
  const accent = urgent ? colors.danger : colors.primary;
  const titleKey = deadline.code === 'GSTR-1' ? 'due_gstr1' : 'due_gstr3b';
  const status =
    deadline.daysLeft < 0
      ? t('due_overdueBy').replace('{n}', String(-deadline.daysLeft))
      : deadline.daysLeft === 0
        ? t('due_dueToday')
        : t('due_daysLeft').replace('{n}', String(deadline.daysLeft));

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: urgent ? colors.dangerSoft : colors.primaryTint }]}>
        <Ionicons name="document-text-outline" size={20} color={accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{t(titleKey).replace('{period}', periodLabel(deadline.periodYear, deadline.periodMonth))}</Text>
        <Text style={styles.sub}>{t('due_dueOn').replace('{date}', formatDate(deadline.dueIso))}</Text>
      </View>
      <View style={[styles.pill, { backgroundColor: urgent ? colors.dangerSoft : colors.primarySoft }]}>
        <Text style={[styles.pillText, { color: accent }]}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    ...shadowSm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12.5, color: colors.muted, fontWeight: '600', marginTop: 2 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 11.5, color: colors.faint, fontWeight: '600' },
});
