import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCanValidate } from '@/lib/roles';
import { NotificationBell } from '@/components/NotificationBell';

export default function TabsLayout() {
  const canValidate = useCanValidate();
  /**
   * Sur les iPhone à encoche, le bas de l'écran est occupé par la barre
   * d'accueil. La hauteur fixe posée ici écrasait la marge que la navigation
   * calcule d'ordinaire toute seule : les onglets se retrouvaient collés au
   * bord, sous le trait d'accueil.
   *
   * On rend cette marge explicitement — la barre remonte de la hauteur de la
   * zone réservée, comme sur WhatsApp. Sur un appareil sans encoche
   * `insets.bottom` vaut 0 et rien ne change.
   */
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0F4C81' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <NotificationBell />,
        tabBarActiveTintColor: '#0F4C81',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          height: 58 + insets.bottom,
          paddingBottom: 6 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mes bons',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="a-valider"
        options={{
          title: 'À valider',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={color} />
          ),
          // Onglet masqué pour les utilisateurs sans rôle de validation.
          href: canValidate ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="nouveau"
        options={{
          title: 'Nouveau',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="compte"
        options={{
          title: 'Compte',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
