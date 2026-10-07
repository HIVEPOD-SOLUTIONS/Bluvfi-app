import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

/**
 * The "use my SKR when I'm short on USDC" setting, and a way for the payment code to tell the screen that it converted some.
 *
 * Off by default. When it's on, a USDC payment the wallet can't cover converts just the missing amount from the person's SKR first
 * (see skr-swap.ts), then pays as normal. The payment senders are plain functions with no screen of their own, so they read the
 * setting from here and announce a conversion here; one component at the root turns that announcement into a message.
 */

const KEY = 'bluvfi_pay_with_skr';

let enabled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Whether payments may convert SKR automatically. Read by the payment senders. */
export const skrPayEnabled = (): boolean => enabled;

/** Reads the saved setting. Call once when the app starts. */
export async function loadSkrPay(): Promise<void> {
  try {
    enabled = (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    enabled = false; // an unreadable setting means off, never on
  }
  emit();
}

export async function setSkrPay(on: boolean): Promise<void> {
  enabled = on;
  emit();
  try {
    if (on) await SecureStore.setItemAsync(KEY, '1');
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* the choice still applies until the app closes */
  }
}

/** The setting, and a way to change it, for a screen. */
export function useSkrPay(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    skrPayEnabled,
  );
  return [on, (v) => void setSkrPay(v)];
}

// ── "I converted some SKR for that payment" ───────────────────────────────────

export interface AutoConversion {
  signature: string;
  skrOutMicro: number;
  usdcInMicro: number;
}

const conversionListeners = new Set<(c: AutoConversion) => void>();

export function onAutoConversion(fn: (c: AutoConversion) => void): () => void {
  conversionListeners.add(fn);
  return () => conversionListeners.delete(fn);
}

/** The message shown after a payment converted some SKR. */
export function describeConversion(c: Pick<AutoConversion, 'skrOutMicro' | 'usdcInMicro'>): { title: string; subtitle: string } {
  const skr = (c.skrOutMicro / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const usd = (Math.floor(c.usdcInMicro / 10_000) / 100).toFixed(2);
  return { title: 'Converted ' + skr + ' SKR to $' + usd, subtitle: 'To cover your payment. You can turn this off on the Shar screen.' };
}

export function announceAutoConversion(c: AutoConversion): void {
  conversionListeners.forEach((l) => l(c));
}
