/**
 * AdMob rewarded ads, used to unlock more chat messages after the daily limit (as in bluvfi's Capacitor app,
 * with the same AdMob app and rewarded ad unit). The native module is loaded lazily and every call fails soft:
 * on a build without it, or when no ad is available, callers just get 'unavailable'.
 */

/** bluvfi's rewarded ad unit (the AdMob app id lives in app.json's react-native-google-mobile-ads plugin). */
const REWARDED_AD_ID = 'ca-app-pub-4986320440788963/6496567028';
const LOAD_TIMEOUT_MS = 20_000;

export type RewardedResult = 'rewarded' | 'closed' | 'unavailable';

let initPromise: Promise<boolean> | null = null;

/**
 * Runs the UMP consent flow, then initialises the SDK. The SDK only serves ads once consent allows it,
 * so this must run before the first ad request. Resolves true when ads can be requested.
 */
export function initAds(): Promise<boolean> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const { default: mobileAds, AdsConsent } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
        const consent = await AdsConsent.gatherConsent();
        if (!consent.canRequestAds) return false;
        await mobileAds().initialize();
        return true;
      } catch (err) {
        console.warn('[AdMob] init/consent error:', err);
        // The consent form failed to load (e.g. no message is set up in the AdMob console yet). Ads may still be
        // served when Google's own consent state already allows them (outside regions that require consent);
        // when it doesn't, stay off rather than serve ads without consent.
        try {
          const { default: mobileAds, AdsConsent } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
          const info = await AdsConsent.getConsentInfo();
          if (info.canRequestAds) {
            await mobileAds().initialize();
            return true;
          }
        } catch {
          /* no usable consent state */
        }
        return false;
      }
    })();
  }
  return initPromise;
}

/**
 * Loads and shows a rewarded ad. `onRewarded` gets the reward amount (set in the AdMob console) as soon
 * as the user earns it, before they close the ad.
 */
export async function showRewardedAd(
  onRewarded: (amount: number) => void,
  /** The user the ad is for. Passed to AdMob so its signed server callback names them (server-side verification). */
  ssv?: { userId: string },
): Promise<RewardedResult> {
  if (!(await initAds())) return 'unavailable';

  try {
    const { RewardedAd, RewardedAdEventType, AdEventType } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
    const ad = RewardedAd.createForAdRequest(
      REWARDED_AD_ID,
      ssv ? { serverSideVerificationOptions: { userId: ssv.userId, customData: 'chat-bonus' } } : undefined,
    );

    return await new Promise<RewardedResult>((resolve) => {
      let rewarded = false;
      const unsubscribers: (() => void)[] = [];
      const finish = (result: RewardedResult) => {
        clearTimeout(timer);
        unsubscribers.forEach((off) => off());
        resolve(result);
      };
      const timer = setTimeout(() => finish('unavailable'), LOAD_TIMEOUT_MS);

      unsubscribers.push(
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show().catch(() => finish('unavailable'))),
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
          rewarded = true;
          onRewarded(reward.amount);
        }),
        ad.addAdEventListener(AdEventType.CLOSED, () => finish(rewarded ? 'rewarded' : 'closed')),
        ad.addAdEventListener(AdEventType.ERROR, (err) => {
          console.warn('[AdMob] rewarded ad error:', err);
          finish(rewarded ? 'rewarded' : 'unavailable');
        }),
      );
      ad.load();
    });
  } catch (err) {
    console.warn('[AdMob] rewarded ad error:', err);
    return 'unavailable';
  }
}
