import { useApiQuery } from './use-api';

/** US stocks and ETFs traded through Backpack Exchange on Bluvfi's account (bluvfi's `/api/stocks/*`). */

export interface StockRow {
  asset: string;
  ticker: string;
  name: string;
  price: number | null;
  changePct: number | null;
  tradableNow: boolean;
}

export interface StockPosition {
  asset: string;
  ticker: string;
  name: string;
  quantity: string;
  price: number;
  valueUsd: number;
  changePct: number;
}

export interface StocksPortfolio {
  tradingEnabled: boolean;
  /** Leftover credit (unused buy reserve, or sale money under $1), used first on the next buy. */
  cashUsd: number;
  totalUsd: number;
  positions: StockPosition[];
  orders: {
    id: string;
    asset: string;
    side: string;
    quantity: string;
    status: string;
    fillPrice: string | null;
    fillQuantity: string | null;
    error: string | null;
    createdAt: string;
  }[];
}

export interface StockQuote {
  asset: string;
  name: string;
  side: 'buy' | 'sell';
  quantity: string;
  venue: 'rfq' | 'spot';
  marketPrice: number;
  limitPrice: string;
  estimateUsdc: string;
  feeUsdc: string;
}

export interface StockOrder {
  id: string;
  status: string;
  fillPrice?: string | null;
  fillQuantity?: string | null;
  error?: string | null;
}

const ETF_RE = /\bETF\b|\bTrust\b|\bFund\b|iShares|SPDR|Vanguard|ProShares|Invesco|Direxion/i;

export const isEtf = (name: string) => ETF_RE.test(name);

export function useStocksPortfolio() {
  return useApiQuery<StocksPortfolio>(['stocks-portfolio'], '/api/stocks/portfolio', undefined, {
    retry: false,
    refetchInterval: 60_000,
  });
}

export function useStocksList(query: string) {
  return useApiQuery<{ session: { name: string; description?: string } | null; stocks: StockRow[] }>(
    ['stocks-list', query],
    '/api/stocks/list',
    { limit: 200, q: query || undefined },
    { staleTime: 30_000, retry: 1 },
  );
}
