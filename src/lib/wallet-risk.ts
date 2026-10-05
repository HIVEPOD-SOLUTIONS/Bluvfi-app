import * as SecureStore from 'expo-secure-store';

const KEY = 'bluvfi.wallet-only-risk-ack';

/**
 * Whether this device's user has already accepted the wallet-only risk notice, so it isn't shown on every sign-in.
 * Only the notice before sign-in is skipped; the reminder in Profile stays until an email or Google is added.
 */
export async function hasAcceptedWalletRisk(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function acceptWalletRisk(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, '1');
  } catch {
    /* worst case the notice appears again next time */
  }
}
