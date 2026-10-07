import '@/lib/polyfills';

import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { useApiClient } from '@/hooks/use-api';
import { applyPendingReferral } from '@/lib/referral';
import { WalletConnectionProvider } from '@/lib/wallet-connection';
import { describeConversion, loadSkrPay, onAutoConversion } from '@/lib/skr-pay';
import { Colors } from '@/constants/theme';
import { initRevenueCat } from '@/lib/revenuecat';
import { initAds } from '@/lib/admob';

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
  const call = useApiClient();
  const toast = useToast();
  const callRef = useRef(call);
  callRef.current = call;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync();
  }, [isReady]);

  // The "use my SKR when I'm short on USDC" setting, and the message after a payment has converted some.
  useEffect(() => {
    void loadSkrPay();
  }, []);
  useEffect(
    () =>
      onAutoConversion((c) => {
        const d = describeConversion(c);
        toast({ variant: 'success', title: d.title, subtitle: d.subtitle });
      }),
    [toast],
  );

  useEffect(() => {
    // Mirrors bluvfi web's AppLayout: initialize RevenueCat once logged in.
    if (isAuthenticated && userId) initRevenueCat(userId);
  }, [isAuthenticated, userId]);

  useEffect(() => {
    // A referral code entered before there was an account (or from a friend's link) is applied the moment they are signed in.
    if (!isAuthenticated) return;
    let alive = true;
    applyPendingReferral((path, options) => callRef.current(path, options)).then((outcome) => {
      if (!alive) return;
      if (outcome === 'applied') toast({ variant: 'success', title: 'Referral applied', subtitle: 'You’re now a companion of whoever invited you.' });
      else if (outcome === 'rejected') toast({ variant: 'error', title: 'That referral code didn’t work' });
    });
    return () => {
      alive = false;
    };
    // Once per sign-in; toast is stable enough and callRef always holds the latest client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    // AdMob consent + init once signed in, so the rewarded ad is ready when the chat's daily limit is hit.
    if (isAuthenticated) initAds();
  }, [isAuthenticated]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg0, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.sage} />
      </View>
    );
  }

  // Protected routes (Expo Router's Stack.Protected): a signed-out user can't reach (tabs) by any path, deep links included, and when the
  // guard flips to false (logout) their history entries are removed. The guest group comes right after the signed-in one, so a signed-out
  // user lands on the onboarding carousel.
  // Mirrors bluvfi web's app/page.tsx: always shows the onboarding carousel
  // first when logged out (no "seen before" persistence there either), with
  // Skip/Get started pushing into the login screen.
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg0 } }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="provider/[id]" />
        <Stack.Screen name="provider/new" />
        <Stack.Screen name="provider/edit/[id]" />
        <Stack.Screen name="creator" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="faq" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" />
      </Stack.Protected>
      {/* Reachable signed in or out: a friend's referral link, and the sign-in redirect. */}
      <Stack.Screen name="ref/[code]" />
      <Stack.Screen name="oauth-callback" />
    </Stack>
  );

  // The connected-wallet state is shared by every signed-in screen (the tabs and the provider page alike). The provider is always mounted so a
  // hook can never run outside it; it drops the connection when signed out (userId null) and restores the saved one at sign-in.
  return <WalletConnectionProvider userId={isAuthenticated ? userId : null}>{stack}</WalletConnectionProvider>;
}
