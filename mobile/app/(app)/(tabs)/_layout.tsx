import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useCanValidate } from '@/lib/roles';
import { NotificationBell } from '@/components/NotificationBell';

/** Icône d'onglet simple (emoji) — évite une dépendance d'icônes supplémentaire. */
function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const canValidate = useCanValidate();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0F4C81' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <NotificationBell />,
        tabBarActiveTintColor: '#0F4C81',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: { height: 58, paddingBottom: 6, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Mes bons', tabBarIcon: ({ color }) => <TabIcon emoji="🧾" color={color} /> }}
      />
      <Tabs.Screen
        name="a-valider"
        options={{
          title: 'À valider',
          tabBarIcon: ({ color }) => <TabIcon emoji="✅" color={color} />,
          // Onglet masqué pour les utilisateurs sans rôle de validation.
          href: canValidate ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="nouveau"
        options={{ title: 'Nouveau', tabBarIcon: ({ color }) => <TabIcon emoji="➕" color={color} /> }}
      />
      <Tabs.Screen
        name="compte"
        options={{ title: 'Compte', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }}
      />
    </Tabs>
  );
}
