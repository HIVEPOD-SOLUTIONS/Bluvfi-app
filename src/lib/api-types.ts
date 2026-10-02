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
