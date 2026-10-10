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

// ── Interstitial: the "successful payment" ad ─────────────────────────────────────────────────────────────

/** bluvfi's interstitial ad unit, named "successful payment" in the AdMob console (same AdMob app as the rewarded unit). */
export const INTERSTITIAL_AD_ID = 'ca-app-pub-4986320440788963/6729693281';
/** Free accounts see at most one of these every so often, so a run of purchases doesn't become a run of ads. */
export const INTERSTITIAL_COOLDOWN_MS = 90_000;
const INTERSTITIAL_LOAD_TIMEOUT_MS = 8_000;

/** Pure: whether a successful payment should be followed by an ad. Premium never sees one; nor does anyone inside the cooldown. */
export function shouldShowSuccessAd(input: { premium: boolean; now: number; lastShownAt: number }): boolean {
  return !input.premium && input.now - input.lastShownAt >= INTERSTITIAL_COOLDOWN_MS;
}

let lastInterstitialAt = 0;
type PreparedInterstitial = { ad: import('react-native-google-mobile-ads').InterstitialAd; ready: Promise<boolean> };
let prepared: PreparedInterstitial | null = null;

/** Starts loading the next interstitial (call when a payment begins, so it is ready when the payment lands). Fails soft. */
export function prepareInterstitialAd(): void {
  if (prepared) return;
  void (async () => {
    try {
      if (!(await initAds())) return;
      const { InterstitialAd, AdEventType } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
      const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_ID);
      const ready = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), INTERSTITIAL_LOAD_TIMEOUT_MS);
        ad.addAdEventListener(AdEventType.LOADED, () => {
          clearTimeout(timer);
          resolve(true);
        });
        ad.addAdEventListener(AdEventType.ERROR, (err) => {
          console.warn('[AdMob] interstitial error:', err);
          clearTimeout(timer);
          resolve(false);
        });
      });
      prepared = { ad, ready };
      ad.load();
    } catch (err) {
      console.warn('[AdMob] interstitial prepare error:', err);
      prepared = null;
    }
  })();
}

/**
 * Shows the "successful payment" interstitial if it should be shown (not Premium, not just shown one) and one is ready or loads quickly.
 * Resolves true when an ad was shown. Never throws, and never delays the caller by more than a few seconds.
 */
export async function showSuccessAd(premium: boolean): Promise<boolean> {
  const now = Date.now();
  if (!shouldShowSuccessAd({ premium, now, lastShownAt: lastInterstitialAt })) return false;
  if (!prepared) prepareInterstitialAd();
  try {
    // prepareInterstitialAd is async: give it a moment to create the ad.
    for (let i = 0; i < 20 && !prepared; i++) await new Promise((r) => setTimeout(r, 100));
    const current = prepared;
    if (!current) return false;
    prepared = null; // an interstitial can be shown only once
    if (!(await current.ready)) return false;
    lastInterstitialAt = Date.now();
    await current.ad.show();
    return true;
  } catch (err) {
    console.warn('[AdMob] interstitial show error:', err);
    return false;
  }
}
