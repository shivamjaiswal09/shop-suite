import { RepositoriesProvider, createQueryClient, useSessionStore } from '@shop/state';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { repositories } from '@/lib/repositories';
import { useTheme } from '@/lib/theme';

const queryClient = createQueryClient();

export default function RootLayout() {
  return (
    <RepositoriesProvider repositories={repositories}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <Navigator />
        </SafeAreaProvider>
      </QueryClientProvider>
    </RepositoriesProvider>
  );
}

function Navigator() {
  const colors = useTheme();
  const mode = useSessionStore((s) => s.theme);

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
          headerTitleStyle: { fontSize: 16, fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/* Login. The tab group is only reachable once a session exists. */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="invoices" options={{ title: 'Invoices' }} />
        <Stack.Screen
          name="invoice/[id]"
          options={{ title: 'Receipt', presentation: 'modal' }}
        />
      </Stack>
    </>
  );
}
