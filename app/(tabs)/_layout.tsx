import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconName } from '../../src/components/ui';
import { useApp } from '../../src/context/AppContext';
import { colors, fontFamilyFor } from '../../src/theme';

function tabIcon(active: IconName, inactive: IconName) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color} />
  );
}

export default function TabsLayout() {
  const { t, language } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontFamily: fontFamilyFor('500', language ?? 'en') },
        tabBarAllowFontScaling: false,
        tabBarItemStyle: { paddingTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 60 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom + 6,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabHome'), tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen
        name="bills"
        options={{ title: t('tabBills'), tabBarIcon: tabIcon('receipt', 'receipt-outline') }}
      />
      <Tabs.Screen
        name="parties"
        options={{ title: t('tabParties'), tabBarIcon: tabIcon('people', 'people-outline') }}
      />
      <Tabs.Screen name="items" options={{ title: t('tabItems'), tabBarIcon: tabIcon('cube', 'cube-outline') }} />
      <Tabs.Screen
        name="more"
        options={{ title: t('tabMore'), tabBarIcon: tabIcon('grid', 'grid-outline') }}
      />
    </Tabs>
  );
}
