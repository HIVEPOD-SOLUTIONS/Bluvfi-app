import { useQuery } from '@tanstack/react-query';
import { SOLANA_RPC } from '@/lib/mwa';
import { SKR_MINT } from '@/lib/skr-swap';

/** The SKR (in micro-SKR) held by a Solana address, summed over its token accounts. */
export async function fetchSkrBalanceMicro(address: string, rpcUrl: string = SOLANA_RPC, f: typeof fetch = fetch): Promise<number> {
  const res = await f(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [address, { mint: SKR_MINT }, { encoding: 'jsonParsed' }] }),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    result?: { value?: { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }[] };
  };
  if (json.error) throw new Error(json.error.message ?? 'Couldn’t read your SKR balance.');
  return (json.result?.value ?? []).reduce((sum, a) => {
    const raw = a.account?.data?.parsed?.info?.tokenAmount?.amount;
    return sum + (typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0);
  }, 0);
}

/** The SKR in a wallet, refreshed every so often while a screen shows it. `undefined` until it has loaded. */
export function useSkrBalance(address: string | undefined) {
  return useQuery({
    queryKey: ['skr-balance', address],
    queryFn: () => fetchSkrBalanceMicro(address!),
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}
