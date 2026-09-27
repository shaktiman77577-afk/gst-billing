import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useApp } from '../context/AppContext';
import { useBusiness } from '../hooks/useBusiness';
import { formatDate } from '../lib/dates';
import { getGstDeadlines, GstDeadline, isUrgent, periodLabel } from '../lib/gstDeadlines';
import { colors, radius } from '../theme';
import { Card, Hairline, MenuRow } from './ui';

// GST statutory deadline reminders. Pure date math (no DB, no network) via
// getGstDeadlines — hidden entirely for non-GST-registered businesses.
export function GstDeadlinesCard() {
  const { t } = useApp();
  const business = useBusiness();
  if (!business?.gst_registered) return null;

  const deadlines = getGstDeadlines(new Date());

  return (
    <Card list>
      <MenuRow icon="calendar-outline" title={t('due_title')} chevron={false} />
      {deadlines.map((d) => (
        <Fragment key={d.code}>
          <Hairline />
          <DeadlineRow deadline={d} />
        </Fragment>
      ))}
      <Hairline />
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
    <MenuRow
      icon="document-text-outline"
      iconBg={urgent ? colors.dangerSoft : undefined}
      iconFg={urgent ? colors.danger : undefined}
      title={t(titleKey).replace('{period}', periodLabel(deadline.periodYear, deadline.periodMonth))}
      subtitle={t('due_dueOn').replace('{date}', formatDate(deadline.dueIso))}
      chevron={false}
      right={
        <View style={[styles.pill, { backgroundColor: urgent ? colors.dangerSoft : colors.primarySoft }]}>
          <Text style={[styles.pillText, { color: accent }]}>{status}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '500' },
  hint: { fontSize: 12, color: colors.muted },
});
