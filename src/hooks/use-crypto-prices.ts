import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { useApiClient, useApiQuery } from './use-api';

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

export function useCryptoPrices(enabled = true) {
  return useApiQuery<PriceSnapshot>(['crypto-prices'], '/api/prices', undefined, {
    enabled,
    refetchInterval: (query) => (notConfigured(query.state.error) ? false : POLL_MS),
    staleTime: POLL_MS - 5_000,
    // Retry transient failures a couple of times, but never a "not configured".
    retry: (count, error) => !notConfigured(error) && count < 2,
  });
}

/** A coin any Bluvfi provider supports, with live market data and which providers take it. */
export interface SupportedCoin {
  /** CoinMarketCap id; present on /api/prices/all rows (tickers aren't unique there). */
  id?: number | string;
  symbol: string;
  name: string;
  rank: number | null;
  priceUsd: number;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  marketCap: number | null;
  providers: string[];
}

export interface SupportedCoinsSnapshot {
  coins: SupportedCoin[];
  fetchedAt: number;
  stale: boolean;
}

/**
 * Prices for every crypto token the providers support (/api/prices/supported). An older backend without that
 * route answers 404, which callers treat as "fall back to the four-coin /api/prices ticker".
 */
export function useSupportedCoins() {
  return useApiQuery<SupportedCoinsSnapshot>(['supported-coins'], '/api/prices/supported', undefined, {
    refetchInterval: (query) => (notConfigured(query.state.error) ? false : POLL_MS),
    staleTime: POLL_MS - 5_000,
    retry: (count, error) => !notConfigured(error) && !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

interface AllCoinsPage {
  coins: SupportedCoin[];
  /** Pass as `start` for the next page; null when CoinMarketCap has no more. */
  nextStart: number | null;
  fetchedAt: number;
}

const PAGE_SIZE = 100;

/** Every coin CoinMarketCap lists, by market cap, a page at a time (/api/prices/all). */
export function useAllCoins() {
  const call = useApiClient();
  return useInfiniteQuery<AllCoinsPage, Error, InfiniteData<AllCoinsPage>, readonly unknown[], number>({
    queryKey: ['all-coins'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => call<AllCoinsPage>('/api/prices/all', { query: { start: pageParam, limit: PAGE_SIZE } }),
    getNextPageParam: (last) => last.nextStart ?? undefined,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS * 2,
    retry: (count, error) => !notConfigured(error) && !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

/** Looks one ticker up directly, for coins beyond the pages loaded so far. Disabled for an empty/invalid symbol. */
export function useCoinLookup(symbol: string) {
  const sym = symbol.trim().toUpperCase();
  return useApiQuery<AllCoinsPage>(['coin-lookup', sym], '/api/prices/all', { symbol: sym }, {
    enabled: /^[A-Z0-9]{1,12}$/.test(sym),
    staleTime: POLL_MS,
    retry: false,
  });
}
