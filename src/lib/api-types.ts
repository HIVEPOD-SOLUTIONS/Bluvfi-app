export interface Bill {
  id: string;
  name: string;
  category: string;
  amount: string;
  dueDate: string | null;
  status: string;
  logoUrl: string | null;
}

export interface InvestmentPosition {
  id: string;
  symbol: string;
  name: string;
  type: string;
  shares: number;
  avgPriceUsd: number;
  currentPriceUsd: number;
  currentValueUsd: number;
  gainLossUsd: number;
  gainLossPct: number;
  icon: string;
  change24h: number;
}

/** A product from bluvfi's Bitrefill catalog (`/api/bitrefill/products` → `{ data: BitrefillProduct[] }`). */
export interface BitrefillProduct {
  id: string;
  name: string;
  category: string;
  currency?: string;
  logo_url?: string;
  in_stock?: boolean;
  recipient_type?: string;
  packages?: { package_value?: number | string; price_usd?: number }[];
  range?: { min: number; max: number; price_rate?: number };
}

export interface Payment {
  id: string;
  type: string;
  description: string | null;
  amountUsdc: string | null;
  status: string;
  chain: string | null;
  txHash: string | null;
  createdAt: string;
}
