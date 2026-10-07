import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * A stable id for this phone, sent with every API request (X-Bluvfi-Device). The server keeps only a one-way hash of it and uses
 * it to notice several accounts on one phone: they can't earn from each other, a phone can only claim for a few accounts, and a
 * payout to linked accounts needs an admin to look first.
 *
 * The Android ID is preferred: it survives reinstalling the app. If it isn't available, a random id is kept on the phone
 * (weaker: it is lost on reinstall).
 */

const KEY = 'bluvfi_install_id';
let cached: string | null = null;

function androidId(): string | null {
  try {
    // Loaded lazily so a build without the native module still runs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Application = require('expo-application') as { getAndroidId?: () => string };
    const id = Application.getAndroidId?.();
    return typeof id === 'string' && id.length >= 8 ? `android:${id}` : null;
  } catch {
    return null;
  }
}

export async function getDeviceId(): Promise<string | null> {
  if (cached) return cached;
  const fromAndroid = androidId();
  if (fromAndroid) return (cached = fromAndroid);
  try {
    let id = await SecureStore.getItemAsync(KEY);
    if (!id) {
      id = `install:${Crypto.randomUUID()}`;
      await SecureStore.setItemAsync(KEY, id);
    }
    return (cached = id);
  } catch {
    return null; // never block a request because the id couldn't be read
  }
}
