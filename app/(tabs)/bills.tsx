import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { BillRow } from '../../src/components/BillRow';
import { DateRangeButton } from '../../src/components/DateRangeButton';
import { DateRangePicker } from '../../src/components/DateRangePicker';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Header } from '../../src/components/Header';
import { SearchBar } from '../../src/components/SearchBar';
import { Chips, Overline } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { getOverdueInvoices } from '../../src/lib/alerts';
import { formatDate, fromIsoDate, toIsoDate, todayIso } from '../../src/lib/dates';
import { formatPaise } from '../../src/lib/money';
import { DateRange } from '../../src/lib/dateRange';
import { InvoiceListRow, InvoiceStatus, isReturnKind, listInvoices } from '../../src/db/invoices';
import { colors, radius, spacing, tabular, text } from '../../src/theme';

type Filter = 'all' | InvoiceStatus | 'credit_note' | 'sales_return' | 'overdue' | 'quotation';

export default function BillsScreen() {
  const db = useSQLiteContext();
  const { t, businessId, language } = useApp();
  const [bills, setBills] = useState<InvoiceListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [overdueIds, setOverdueIds] = useState<Set<string>>(new Set());
  // Last chosen range for this screen (useState only — no schema changes).
  const [billRange, setBillRange] = useState<DateRange | null>(null);
  const [rangeSheet, setRangeSheet] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      listInvoices(db, businessId).then((rows) => {
        setBills(rows);
        setLoaded(true);
      });
      // Overdue needs due_date, which listInvoices doesn't return —
      // resolve the matching ids once per focus instead.
      getOverdueInvoices(db, businessId, todayIso()).then((rows) =>
        setOverdueIds(new Set(rows.map((r) => r.id))),
      );
    }, [db, businessId]),
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bills.filter(
      (b) =>
        ((filter === 'all' && b.doc_type !== 'proforma') ||
          (filter === 'overdue'
            ? overdueIds.has(b.id)
            : filter === 'credit_note'
              ? isReturnKind(b.kind)
              : filter === 'sales_return'
                ? b.kind === 'sales_return'
              : filter === 'quotation'
                ? b.doc_type === 'quotation'
                : b.kind === 'invoice' && b.doc_type !== 'quotation' && b.doc_type !== 'delivery_challan' && b.doc_type !== 'proforma' && b.status === filter)) &&
        (!billRange || (b.invoice_date >= billRange.from && b.invoice_date <= billRange.to)) &&
        (!q || b.party_name.toLowerCase().includes(q) || b.invoice_no.toLowerCase().includes(q)),
    );
  }, [bills, query, filter, overdueIds, billRange]);

  // Only real sales bills count towards money totals (not quotations,
  // challans, proformas, returns or cancelled bills).
  const isSale = (b: InvoiceListRow) =>
    b.kind === 'invoice' &&
    b.status !== 'cancelled' &&
    b.doc_type !== 'quotation' &&
    b.doc_type !== 'delivery_challan' &&
    b.doc_type !== 'proforma';

  const summary = useMemo(() => {
    let sales = 0;
    let received = 0;
    let pending = 0;
    for (const b of visible) {
      if (!isSale(b)) continue;
      sales += b.total_paise;
      received += b.received_paise;
      pending += Math.max(b.total_paise - b.received_paise - b.credited_paise, 0);
    }
    return { sales, received, pending };
  }, [visible]);

  // Bills grouped by date, newest first (listInvoices is already sorted).
  const sections = useMemo(() => {
    const today = todayIso();
    const y = fromIsoDate(today);
    y.setDate(y.getDate() - 1);
    const yesterday = toIsoDate(y);
    const out: { key: string; title: string; total: number; data: InvoiceListRow[] }[] = [];
    for (const b of visible) {
      let sec = out[out.length - 1];
      if (!sec || sec.key !== b.invoice_date) {
        const title =
          b.invoice_date === today
            ? `${t('dr_preset_today')} · ${formatDate(b.invoice_date)}`
            : b.invoice_date === yesterday
              ? `${t('dr_preset_yesterday')} · ${formatDate(b.invoice_date)}`
              : formatDate(b.invoice_date);
        sec = { key: b.invoice_date, title, total: 0, data: [] };
        out.push(sec);
      }
      sec.data.push(b);
      if (isSale(b)) sec.total += b.total_paise;
    }
    return out;
  }, [visible, t]);

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <Header
        title={t('tabBills')}
        right={
          bills.length > 0 ? (
            <DateRangeButton range={billRange} onPress={() => setRangeSheet(true)} onClear={() => setBillRange(null)} />
          ) : undefined
        }
      >
        <SearchBar value={query} onChange={setQuery} placeholder={t('searchBills')} />
        {bills.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <Chips
              options={[
                { value: 'all', label: t('all') },
                { value: 'unpaid', label: t('unpaid') },
                { value: 'overdue', label: t('a_overdue') },
                { value: 'partial', label: t('partial') },
                { value: 'paid', label: t('paid') },
                { value: 'credit_note', label: t('creditNotes') },
                { value: 'sales_return', label: t('salesReturns') },
                { value: 'quotation', label: t('q_quotations') },
                { value: 'cancelled', label: t('cancelled') },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </ScrollView>
        ) : null}
      </Header>
      <SectionList
        sections={sections}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          summary.sales > 0 ? (
            <View style={styles.summary}>
              <SummaryTile label={t('v2_sales')} value={formatPaise(summary.sales)} />
              <SummaryTile label={t('v2_received')} value={formatPaise(summary.received)} color={colors.success} />
              <SummaryTile label={t('v2_pending')} value={formatPaise(summary.pending)} color={colors.danger} />
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Overline>{section.title}</Overline>
            {section.total > 0 ? <Text style={styles.sectionTotal}>{formatPaise(section.total)}</Text> : null}
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.row,
              index === 0 && styles.rowFirst,
              index === section.data.length - 1 ? styles.rowLast : styles.rowDivider,
            ]}
          >
            <BillRow bill={item} flat />
          </View>
        )}
        ListEmptyComponent={
          loaded ? (
            bills.length === 0 ? (
              <EmptyState icon="receipt-outline" title={t('noBillsYet')} hint={t('noBillsHint')} />
            ) : (
              <EmptyState icon="search-outline" title={t('noBillsFound')} hint="" />
            )
          ) : null
        }
      />
      <Fab label={t('newBill')} onPress={() => router.push('/bill/new')} />
      <DateRangePicker
        visible={rangeSheet}
        onClose={() => setRangeSheet(false)}
        value={billRange}
        onApply={(r) => {
          setBillRange(r);
          setRangeSheet(false);
        }}
      />
    </View>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.tileValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: 100 },
  chipsRow: { paddingRight: spacing.lg },
  summary: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 2,
  },
  tileLabel: { fontSize: text.xs, lineHeight: 16, color: colors.muted },
  tileValue: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text, ...tabular },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTotal: { fontSize: text.xs, color: colors.muted, ...tabular },
  row: {
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 2,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
});
