import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { Header } from '../../src/components/Header';
import { Card } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme';

// Placeholder — the full item list and form come in the next update.
export default function ItemsScreen() {
  const { t } = useApp();
  return (
    <View style={styles.flex}>
      <StatusBar style="light" />
      <Header title={t('tabItems')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <EmptyState
            icon="cube-outline"
            title={t('itemsEmpty')}
            hint={t('itemsEmptyHint')}
            badge={t('comingSoon')}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
});
