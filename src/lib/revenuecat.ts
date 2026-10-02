import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

let initialized = false;

/**
 * Initialize RevenueCat. Call once after the user is authenticated.
 *
 * The Android key is bluvfi web's existing key (same RevenueCat project,
 * safe to reuse — it's a public client key, not a secret). There's no iOS
 * key anywhere in bluvfi today since the web app only ships Android via
 * Capacitor — EXPO_PUBLIC_REVENUECAT_IOS_API_KEY needs a real value from
 * RevenueCat's dashboard (Project settings -> API keys -> App Store) before
 * purchases work on iOS; until then this just no-ops there, same as if the
 * native module were unavailable.
 */
export async function initRevenueCat(userId: string): Promise<void> {
  if (initialized) return;

  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
        : undefined;
  if (!apiKey) return;

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      // RevenueCat logs store problems (e.g. no Google Play on an emulator) via console.error, which
      // pops React Native's red dev overlay even though purchases are optional. Keep them as plain logs.
      Purchases.setLogHandler((level, message) => console.log(`[RevenueCat ${level}]`, message));
    }
    Purchases.configure({ apiKey, appUserID: userId });
    initialized = true;
  } catch {
    // RevenueCat unavailable (e.g. running in Expo Go without the native module)
  }
}

export async function getActiveEntitlements(): Promise<Record<string, unknown>> {
  if (!initialized) return {};
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active;
  } catch {
    return {};
  }
}

export async function hasEntitlement(id: string): Promise<boolean> {
  const active = await getActiveEntitlements();
  return id in active;
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!initialized) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  if (!initialized) return false;
  try {
    await Purchases.purchasePackage(pkg);
    return true;
  } catch (err) {
    const e = err as { userCancelled?: boolean };
    if (e?.userCancelled) return false;
    throw err;
  }
}

export async function restorePurchases(): Promise<void> {
  if (!initialized) return;
  await Purchases.restorePurchases();
}
