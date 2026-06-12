import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { NotificationsManager } from '@/components/NotificationsManager';

const queryClient = new QueryClient();

export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const isReady = useAuthStore((s) => s.isReady);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Tant que le token n'est pas relu du stockage, on n'affiche rien (évite un flash de login).
  if (!isReady) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <NotificationsManager />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
