/**
 * The Balances tab used to show only Circle's "unified balance", which is the USDC a wallet has DEPOSITED INTO CIRCLE GATEWAY (the App Kit's
 * `unifiedBalance.getBalances` reports the Gateway depositor account), not the USDC sitting in the wallet. The wallet's own USDC is what pays at
 * checkout and what Home shows, so a person with USDC in the wallet saw $0.00 for Base here. This puts the two side by side per network:
 * the wallet's USDC (read on-chain) plus whatever is in Gateway, and the row's amount is their sum.
 */

export interface GatewayRow {
  chain: string;
  label: string;
  icon: string;
  color: string;
  /** Gateway, confirmed, human-readable. */
  confirmedBalance: string;
  pendingBalance?: string;
}

export interface WalletUsdc {
  /** The USDC in the wallet on each EVM network, from the on-chain read. */
  byChain?: Readonly<Record<string, { usdc: number } | undefined>>;
  solUsdc?: number;
  /** null until the Arc balance has loaded. */
  arcUsdc?: number | null;
}

export interface MergedRow extends GatewayRow {
  wallet: number;
  gateway: number;
  total: number;
  hasFunds: boolean;
}

export interface Merged {
  rows: MergedRow[];
  totalUsdc: string;
  fundedCount: number;
  emptyCount: number;
}

const num = (s: string | undefined) => {
  const n = parseFloat(s ?? '0');
  return Number.isFinite(n) ? n : 0;
};

/** The wallet's USDC on one network (0 where the on-chain read has no figure). */
export function walletUsdcOn(chain: string, wallet: WalletUsdc): number {
  if (chain === 'Solana') return wallet.solUsdc ?? 0;
  if (chain === 'Arc') return wallet.arcUsdc ?? 0;
  return wallet.byChain?.[chain]?.usdc ?? 0;
}

export function mergeWalletBalances(rows: readonly GatewayRow[], wallet: WalletUsdc): Merged {
  const merged: MergedRow[] = rows.map((r) => {
    const w = walletUsdcOn(r.chain, wallet);
    const g = num(r.confirmedBalance);
    const total = w + g;
    return { ...r, wallet: w, gateway: g, total, hasFunds: total > 0 };
  });
  // Funded networks first, the largest first.
  merged.sort((a, b) => (a.hasFunds === b.hasFunds ? b.total - a.total : a.hasFunds ? -1 : 1));
  const fundedCount = merged.filter((r) => r.hasFunds).length;
  return { rows: merged, totalUsdc: merged.reduce((s, r) => s + r.total, 0).toFixed(2), fundedCount, emptyCount: merged.length - fundedCount };
}
