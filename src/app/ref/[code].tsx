import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useToast } from '@/components/ui/Toast';
import { Colors } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { applyPendingReferral, normalizeReferralCode, setPendingReferral } from '@/lib/referral';

/**
 * Where a friend's referral link lands: bluvfi://ref/<code> (the web page https://www.bluvfi.xyz/r/<code> opens it).
 * Signed out: the code is saved and applied when they create their account. Signed in: it is applied straight away.
 */
export default function ReferralLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { isAuthenticated } = useAuth();
  const call = useApiClient();
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      const clean = normalizeReferralCode(String(code ?? ''));
      if (!clean) {
        toast({ variant: 'error', title: 'That referral link doesn’t look right' });
      } else {
        await setPendingReferral(clean);
        if (!isAuthenticated) {
          toast({ variant: 'success', title: 'Referral code saved', subtitle: 'It’s applied when you create your account.' });
        } else {
          const outcome = await applyPendingReferral(call);
          if (outcome === 'applied') toast({ variant: 'success', title: 'Referral applied', subtitle: 'You’re now a companion of whoever invited you.' });
          else if (outcome === 'already') toast({ variant: 'error', title: 'You’ve already used a referral code' });
          else if (outcome === 'rejected') toast({ variant: 'error', title: 'That referral code didn’t work' });
        }
      }
      if (alive) router.replace(isAuthenticated ? '/' : ('/onboarding' as never));
    })();
    return () => {
      alive = false;
    };
    // Runs once for the link that opened this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg0, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.sage} />
    </View>
  );
}
