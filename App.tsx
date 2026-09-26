import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>GST Billing</Text>
      <Text style={styles.subtitle}>Invoice Maker</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Step 1 done: app installed successfully</Text>
      </View>
      <Text style={styles.version}>v0.1.0</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 32, fontWeight: '700', color: '#1e3a8a' },
  subtitle: { fontSize: 18, color: '#475569', marginTop: 4 },
  badge: {
    marginTop: 32,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  badgeText: { color: '#166534', fontSize: 15, fontWeight: '600' },
  version: { position: 'absolute', bottom: 32, color: '#94a3b8' },
});
