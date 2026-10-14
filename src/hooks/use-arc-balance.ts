import { useCallback, useEffect, useState } from 'react';
import { erc20Abi, type Hex } from 'viem';
import { ARC_USDC, arcChain } from '@/lib/arc-chain';
import { useAuth } from '@/lib/auth-context';
import { evmPublicClient } from '@/lib/payments/evm-pay';

/**
 * The user's USDC on Arc mainnet (wallet balance, the 6-decimal ERC-20 view). Kept apart from the cross-chain totals so it can be shown on its own
 * line. On Arc this same USDC also pays gas. Mirrors bluvfi web's hooks/use-arc-balance.ts.
 */
export function useArcUsdcBalance(pollMs = 30_000) {
  const { evmAddress } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!evmAddress) return;
    try {
      const raw = await evmPublicClient(arcChain.id).readContract({ address: ARC_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [evmAddress as Hex] });
      setBalance(Number(raw) / 1e6);
    } catch {
      // Keep the last known value on a transient RPC error.
    }
  }, [evmAddress]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { arcUsdc: balance, address: evmAddress, refresh };
}
