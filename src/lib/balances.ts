/**
 * Live on-chain balance fetching via Alchemy's public RPC — same approach,
 * same chains, same contract addresses, and the same public API key
 * bluvfi's web client uses (`use-stablecoin-balances.ts`'s "Tier 3" raw
 * JSON-RPC fallback — the simplest of its 3 tiers, and the one that needs
 * no server-side Privy balance API or viem/web3.js client wiring to match).
 * Full parity: 6 EVM chains x (USDC + USDT) + Solana x (USDC + USDT).
 */

const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '';

type EvmChain = 'Base' | 'Ethereum' | 'Arbitrum' | 'Optimism' | 'Polygon' | 'Avalanche';

const EVM_RPC: Record<EvmChain, string> = {
  Base: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  Ethereum: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  Arbitrum: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  Optimism: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  Polygon: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  Avalanche: `https://avax-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
};

const EVM_USDC: Record<EvmChain, string> = {
  Base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  Ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  Arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  Optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  Polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  Avalanche: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
};

const EVM_USDT: Record<EvmChain, string> = {
  Base: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  Ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  Arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  Optimism: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  Polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  Avalanche: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
};

const EVM_CHAINS = Object.keys(EVM_RPC) as EvmChain[];

const SOL_RPC = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const SOL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'RPC error');
  return json.result;
}

async function fetchEvmTokenBalance(chain: EvmChain, tokenAddress: string, holder: string): Promise<number> {
  if (!ALCHEMY_KEY) return 0;
  const data = `0x70a08231000000000000000000000000${holder.slice(2).toLowerCase()}`;
  try {
    const result = (await rpcCall(EVM_RPC[chain], 'eth_call', [{ to: tokenAddress, data }, 'latest'])) as string;
    return Number(BigInt(result)) / 1e6;
  } catch {
    return 0;
  }
}

async function fetchSolanaTokenBalance(mint: string, holder: string): Promise<number> {
  if (!ALCHEMY_KEY) return 0;
  try {
    const result = (await rpcCall(SOL_RPC, 'getTokenAccountsByOwner', [
      holder,
      { mint },
      { encoding: 'jsonParsed' },
    ])) as { value: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }> };
    return result.value.reduce((sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
  } catch {
    return 0;
  }
}

export interface Balances {
  evmUsdc: number;
  evmUsdt: number;
  solUsdc: number;
  solUsdt: number;
  total: number;
  byChain: Record<EvmChain, { usdc: number; usdt: number }>;
}

export async function fetchBalances(evmAddress: string | undefined, solAddress: string | undefined): Promise<Balances> {
  const byChain = {} as Record<EvmChain, { usdc: number; usdt: number }>;
  let evmUsdc = 0;
  let evmUsdt = 0;

  if (evmAddress) {
    const results = await Promise.all(
      EVM_CHAINS.flatMap((chain) => [
        fetchEvmTokenBalance(chain, EVM_USDC[chain], evmAddress).then((v) => ({ chain, token: 'usdc' as const, v })),
        fetchEvmTokenBalance(chain, EVM_USDT[chain], evmAddress).then((v) => ({ chain, token: 'usdt' as const, v })),
      ]),
    );
    for (const chain of EVM_CHAINS) byChain[chain] = { usdc: 0, usdt: 0 };
    for (const { chain, token, v } of results) {
      byChain[chain][token] = v;
      if (token === 'usdc') evmUsdc += v;
      else evmUsdt += v;
    }
  }

  const [solUsdc, solUsdt] = solAddress
    ? await Promise.all([
        fetchSolanaTokenBalance(SOL_USDC_MINT, solAddress),
        fetchSolanaTokenBalance(SOL_USDT_MINT, solAddress),
      ])
    : [0, 0];

  return {
    evmUsdc,
    evmUsdt,
    solUsdc,
    solUsdt,
    total: evmUsdc + evmUsdt + solUsdc + solUsdt,
    byChain,
  };
}
