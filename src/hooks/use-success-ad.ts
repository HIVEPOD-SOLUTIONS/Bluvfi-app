import { useCallback } from 'react';
import { usePremium } from '@/components/profile/ProfileContent';
import { prepareInterstitialAd, showSuccessAd } from '@/lib/admob';

/**
 * The "successful payment" interstitial. `prepare` when a payment starts (so the ad is loaded by the time it lands) and `show` once it
 * has succeeded. Premium accounts never see it, and nobody sees two within a minute and a half.
 */
export function useSuccessAd() {
  const { isPremium } = usePremium();
  const prepare = useCallback(() => prepareInterstitialAd(), []);
  const show = useCallback(() => showSuccessAd(isPremium), [isPremium]);
  return { prepare, show };
}
