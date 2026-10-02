import '@/lib/polyfills';

import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ToastProvider } from '@/components/ui/Toast';
import { Colors } from '@/constants/theme';
import { initRevenueCat } from '@/lib/revenuecat';

SplashScreen.preventAutoHideAsync();

// Default to the onboarding carousel (not login) as this layout's initial
// route, matching bluvfi web always showing it first when logged out.
export const unstable_settings = {
  initialRouteName: 'onboarding',
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <AuthGate />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AuthGate() {
  const { isReady, isAuthenticated, userId } = useAuth();

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync();
  }, [isReady]);

  useEffect(() => {
    // Mirrors bluvfi web's AppLayout: initialize RevenueCat once logged in.
    if (isAuthenticated && userId) initRevenueCat(userId);
  }, [isAuthenticated, userId]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg0, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.sage} />
      </View>
    );
  }

  // Protected-routes pattern: which Stack.Screen entries exist depends on
  // auth state, so an unauthenticated user can never navigate into (tabs).
  // Mirrors bluvfi web's app/page.tsx: always shows the onboarding carousel
  // first when logged out (no "seen before" persistence there either), with
  // Skip/Get started pushing into the login screen.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg0 } }}>
      {isAuthenticated
        ? [<Stack.Screen key="tabs" name="(tabs)" />]
        : [<Stack.Screen key="onboarding" name="onboarding" />, <Stack.Screen key="login" name="login" />]}
    </Stack>
  );
}
