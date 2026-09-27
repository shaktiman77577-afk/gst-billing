import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BillRow } from '../../src/components/BillRow';
import { DateRangeButton } from '../../src/components/DateRangeButton';
import { DateRangePicker } from '../../src/components/DateRangePicker';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Header } from '../../src/components/Header';
import { SearchBar } from '../../src/components/SearchBar';
import { Chips } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { getOverdueInvoices } from '../../src/lib/alerts';
import { todayIso } from '../../src/lib/dates';
import { DateRange } from '../../src/lib/dateRange';
import { InvoiceListRow, InvoiceStatus, isReturnKind, listInvoices } from '../../src/db/invoices';
import { colors } from '../../src/theme';

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
        (filter === 'all' ||
          (filter === 'overdue'
            ? overdueIds.has(b.id)
            : filter === 'credit_note'
              ? isReturnKind(b.kind)
              : filter === 'sales_return'
                ? b.kind === 'sales_return'
              : filter === 'quotation'
                ? b.doc_type === 'quotation'
                : b.kind === 'invoice' && b.doc_type !== 'quotation' && b.doc_type !== 'delivery_challan' && b.status === filter)) &&
        (!billRange || (b.invoice_date >= billRange.from && b.invoice_date <= billRange.to)) &&
        (!q || b.party_name.toLowerCase().includes(q) || b.invoice_no.toLowerCase().includes(q)),
    );
  }, [bills, query, filter, overdueIds, billRange]);

  return (
    <View style={styles.flex}>
      <StatusBar style="dark" />
      <Header title={t('tabBills')}>
        <SearchBar value={query} onChange={setQuery} placeholder={t('searchBills')} />
      </Header>
      <FlatList
        data={visible}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          bills.length > 0 ? (
            <View style={styles.top}>
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
              <DateRangeButton
                style={styles.rangeBtn}
                range={billRange}
                onPress={() => setRangeSheet(true)}
                onClear={() => setBillRange(null)}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loaded ? (
            bills.length === 0 ? (
              <EmptyState icon="receipt-outline" title={t('noBillsYet')} hint={t('noBillsHint')} />
            ) : (
              <EmptyState icon="search-outline" title={t('noBillsFound')} hint="" />
            )
          ) : null
        }
        renderItem={({ item }) => <BillRow bill={item} />}
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 100, gap: 10 },
  top: { marginBottom: 4 },
  rangeBtn: { marginTop: 8, alignSelf: 'flex-start' },
});
