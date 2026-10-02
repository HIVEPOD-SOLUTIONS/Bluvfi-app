import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

/** How long to wait for Privy to finish the login before giving up and showing the login screen again. */
const WAIT_MS = 8000;

/**
 * Landing route for the OAuth redirect (bluvfi:///oauth-callback), e.g. after Google sign-in.
 * Privy completes the login in the background while this shows a spinner; then it sends the user
 * into the app, or back to the login screen if no session appeared (cancelled or failed).
 */
export default function OAuthCallbackScreen() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
      return;
    }
    const id = setTimeout(() => router.replace('/login'), WAIT_MS);
    return () => clearTimeout(id);
  }, [isAuthenticated]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg0, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.sage} />
    </View>
  );
}
