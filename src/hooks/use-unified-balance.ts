import { useCallback, useEffect, useState } from 'react';
import { getArcKit, SOLANA_ARC_BALANCE_CHAIN } from '@/lib/arc-kit';
import { useAuth } from '@/lib/auth-context';

/** USDC across every network, from Circle App Kit's unified balance. Mirrors bluvfi web's hook. */

// Arc is Circle's USDC-gas L1 (UnifiedBalanceChain.Arc, App Kit 1.15 or later).
export const EVM_BALANCE_CHAINS = ['Base', 'Ethereum', 'Arbitrum', 'Optimism', 'Polygon', 'Avalanche', 'Arc'] as const;

export const CHAIN_META: Record<string, { label: string; icon: string; color: string }> = {
  Base: { label: 'Base', icon: '🔷', color: '#0052FF' },
  Ethereum: { label: 'Ethereum', icon: '⟠', color: '#627EEA' },
  Arbitrum: { label: 'Arbitrum', icon: '🔵', color: '#28A0F0' },
  Optimism: { label: 'Optimism', icon: '🔴', color: '#FF0420' },
  Polygon: { label: 'Polygon', icon: '🟣', color: '#8247E5' },
  Avalanche: { label: 'Avalanche', icon: '🔺', color: '#E84142' },
  Arc: { label: 'Arc', icon: '🟣', color: '#7B61FF' },
  Solana: { label: 'Solana', icon: '◎', color: '#9945FF' },
};

export type ChainBalance = {
  chain: string;
  label: string;
  icon: string;
  color: string;
  confirmedBalance: string;
  pendingBalance?: string;
  hasFunds: boolean;
};

export type UnifiedBalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      totalUsdc: string;
      chains: ChainBalance[];
      fundedCount: number;
      emptyCount: number;
      lastFetched: Date;
    }
  | { status: 'error'; message: string };

export function useUnifiedBalance(opts?: { includePending?: boolean; autoRefreshMs?: number }) {
  const { evmAddress, solanaAddress } = useAuth();
  const [state, setState] = useState<UnifiedBalanceState>({ status: 'idle' });

  const load = useCallback(async () => {
    if (!evmAddress && !solanaAddress) {
      setState({ status: 'idle' });
      return;
    }
    setState((prev) => (prev.status === 'success' ? prev : { status: 'loading' }));

    try {
      // EVM address queries the EVM chains, Solana address the Solana chain; one call returns both.
      const sources: object[] = [];
      if (evmAddress) sources.push({ address: evmAddress, chains: [...EVM_BALANCE_CHAINS] });
      if (solanaAddress) sources.push({ address: solanaAddress, chains: [SOLANA_ARC_BALANCE_CHAIN] });

      const arcKit = await getArcKit();
      const result = await arcKit.unifiedBalance.getBalances({
        token: 'USDC',
        sources: sources.length === 1 ? sources[0] : sources,
        includePending: opts?.includePending ?? true,
        networkType: 'mainnet',
      } as any);

      // Several depositors can share a chain, so merge their entries.
      const chainMap = new Map<string, { confirmed: number; pending: number }>();
      for (const depositor of (result as any).breakdown ?? []) {
        for (const entry of depositor.breakdown ?? []) {
          const key = entry.chain as string;
          const prev = chainMap.get(key) ?? { confirmed: 0, pending: 0 };
          chainMap.set(key, {
            confirmed: prev.confirmed + parseFloat(entry.confirmedBalance ?? '0'),
            pending: prev.pending + parseFloat(entry.pendingBalance ?? '0'),
          });
        }
      }

      // Show every queried chain so empty ones are visible too.
      const allChains: string[] = [
        ...(evmAddress ? EVM_BALANCE_CHAINS : []),
        ...(solanaAddress ? [SOLANA_ARC_BALANCE_CHAIN] : []),
      ];

      const chains: ChainBalance[] = allChains.map((chain) => {
        const bal = chainMap.get(chain) ?? { confirmed: 0, pending: 0 };
        const meta = CHAIN_META[chain] ?? { label: chain, icon: '🔗', color: '#A7A79A' };
        return {
          chain,
          label: meta.label,
          icon: meta.icon,
          color: meta.color,
          confirmedBalance: bal.confirmed.toFixed(2),
          pendingBalance: bal.pending > 0 ? bal.pending.toFixed(2) : undefined,
          hasFunds: bal.confirmed > 0,
        };
      });

      // Funded chains first, largest balance first.
      chains.sort((a, b) => {
        if (a.hasFunds && !b.hasFunds) return -1;
        if (!a.hasFunds && b.hasFunds) return 1;
        return parseFloat(b.confirmedBalance) - parseFloat(a.confirmedBalance);
      });

      const fundedCount = chains.filter((c) => c.hasFunds).length;
      setState({
        status: 'success',
        totalUsdc: chains.reduce((s, c) => s + parseFloat(c.confirmedBalance), 0).toFixed(2),
        chains,
        fundedCount,
        emptyCount: chains.length - fundedCount,
        lastFetched: new Date(),
      });
    } catch (err) {
      console.warn('[unified-balance]', err);
      setState({ status: 'error', message: (err as Error)?.message ?? 'Failed to fetch balances' });
    }
  }, [evmAddress, solanaAddress, opts?.includePending]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!opts?.autoRefreshMs) return;
    const id = setInterval(load, opts.autoRefreshMs);
    return () => clearInterval(id);
  }, [load, opts?.autoRefreshMs]);

  return { state, refresh: load };
}
