import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/store/auth';

/** Garde d'authentification + Stack parent : les onglets, et le détail d'un bon par-dessus. */
export default function AppLayout() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Redirect href="/login" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0F4C81' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      {/* Les onglets gèrent leur propre en-tête */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Détail d'un bon : poussé au-dessus des onglets (titre dynamique dans l'écran) */}
      <Stack.Screen name="bons/[id]" options={{ title: 'Bon' }} />
    </Stack>
  );
}
