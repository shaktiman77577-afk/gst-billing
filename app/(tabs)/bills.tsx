import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BillRow } from '../../src/components/BillRow';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Header } from '../../src/components/Header';
import { SearchBar } from '../../src/components/SearchBar';
import { Chips } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { InvoiceListRow, InvoiceStatus, listInvoices } from '../../src/db/invoices';
import { colors } from '../../src/theme';

type Filter = 'all' | InvoiceStatus | 'credit_note';

export default function BillsScreen() {
  const db = useSQLiteContext();
  const { t, businessId } = useApp();
  const [bills, setBills] = useState<InvoiceListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(
    useCallback(() => {
      if (!businessId) return;
      listInvoices(db, businessId).then((rows) => {
        setBills(rows);
        setLoaded(true);
      });
    }, [db, businessId]),
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bills.filter(
      (b) =>
        (filter === 'all' ||
          (filter === 'credit_note' ? b.kind === 'credit_note' : b.kind === 'invoice' && b.status === filter)) &&
        (!q || b.party_name.toLowerCase().includes(q) || b.invoice_no.toLowerCase().includes(q)),
    );
  }, [bills, query, filter]);

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
                  { value: 'partial', label: t('partial') },
                  { value: 'paid', label: t('paid') },
                  { value: 'credit_note', label: t('creditNotes') },
                  { value: 'cancelled', label: t('cancelled') },
                ]}
                value={filter}
                onChange={setFilter}
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 100, gap: 10 },
  top: { marginBottom: 4 },
});
