import type { Chain } from 'viem';
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains';
import { domaChain } from '@/lib/doma-chain';

/** Small pieces shared by the payment layers (evm-pay.ts and gas-relay.ts), kept apart so they don't import each other. */

export type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

/** The user's embedded EVM wallet: its address and EIP-1193 provider, plus the Privy token the gasless relay needs. */
export interface EvmWallet {
  address: string;
  getProvider: () => Promise<Eip1193Provider>;
  getAccessToken?: () => Promise<string | null>;
}

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  [domaChain.id]: domaChain,
};

export function evmChain(chainId: number): Chain {
  const c = CHAINS[chainId];
  if (!c) throw new Error(`Chain ${chainId} isn't supported for wallet payments.`);
  return c;
}

export function isUserRejection(err: unknown): boolean {
  const e = err as { code?: number; message?: string; shortMessage?: string; cause?: { code?: number } } | null;
  if (e?.code === 4001 || e?.cause?.code === 4001) return true;
  return /user rejected|rejected the request|denied|cancel/i.test(`${e?.shortMessage ?? ''} ${e?.message ?? ''}`);
}
