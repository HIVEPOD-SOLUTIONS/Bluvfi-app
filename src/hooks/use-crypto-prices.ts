import { ApiError } from '@/lib/api';
import { useApiQuery } from './use-api';

/** Live crypto prices for the dashboard ticker, from bluvfi's `/api/prices` (CoinMarketCap, cached server-side). */

export interface CoinPrice {
  symbol: string;
  name: string;
  priceUsd: number;
  /** Percent change, e.g. 1.25 means +1.25%. null when CoinMarketCap didn't supply it. */
  change1h: number | null;
  change24h: number | null;
  lastUpdated: string | null;
}

export interface PriceSnapshot {
  prices: CoinPrice[];
  /** Epoch ms of the upstream fetch these prices came from. */
  fetchedAt: number;
  /** True when the upstream call failed and this is the last good data, served instead of an error. */
  stale: boolean;
}

// CoinMarketCap itself refreshes about every 60s; the server caches, so polling every 30s costs nothing upstream.
const POLL_MS = 30_000;

/** 501 = no CoinMarketCap key on the server: not a failure, just no ticker. */
const notConfigured = (err: unknown) => err instanceof ApiError && err.status === 501;

export function useCryptoPrices() {
  return useApiQuery<PriceSnapshot>(['crypto-prices'], '/api/prices', undefined, {
    refetchInterval: (query) => (notConfigured(query.state.error) ? false : POLL_MS),
    staleTime: POLL_MS - 5_000,
    // Retry transient failures a couple of times, but never a "not configured".
    retry: (count, error) => !notConfigured(error) && count < 2,
  });
}
