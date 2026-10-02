import { useQuery } from '@tanstack/react-query';
import { fetchBalances } from '@/lib/balances';

export function useBalances(evmAddress: string | undefined, solAddress: string | undefined) {
  return useQuery({
    queryKey: ['balances', evmAddress, solAddress],
    queryFn: () => fetchBalances(evmAddress, solAddress),
    enabled: !!evmAddress || !!solAddress,
    refetchInterval: 30_000,
  });
}
