import { useEffect, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getCountry, type CountryEntry } from '@/lib/bills-countries';

/**
 * The country the Bills catalogs are browsed for. One choice shared by the Bitrefill and the Cryptorefills sheets and remembered
 * between launches (the website remembers it in localStorage).
 */
const STORAGE_KEY = 'bluvfi.bills-country';

let current: CountryEntry = getCountry('US');
let loading: Promise<CountryEntry> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Reads the saved country once (the United States until someone picks another). Never throws. */
export function loadBillsCountry(): Promise<CountryEntry> {
  if (!loading) {
    loading = SecureStore.getItemAsync(STORAGE_KEY)
      .then((code) => {
        if (code) {
          const saved = getCountry(code);
          if (saved.code !== current.code) {
            current = saved;
            emit();
          }
        }
        return current;
      })
      .catch(() => current);
  }
  return loading;
}

export function setBillsCountry(country: CountryEntry): void {
  current = country;
  emit();
  SecureStore.setItemAsync(STORAGE_KEY, country.code).catch(() => {
    /* it still applies for this session */
  });
}

export const currentBillsCountry = (): CountryEntry => current;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** [the chosen country, a function to change it]. */
export function useBillsCountry(): readonly [CountryEntry, (country: CountryEntry) => void] {
  const country = useSyncExternalStore(subscribe, currentBillsCountry, currentBillsCountry);
  useEffect(() => {
    void loadBillsCountry();
  }, []);
  return [country, setBillsCountry] as const;
}
