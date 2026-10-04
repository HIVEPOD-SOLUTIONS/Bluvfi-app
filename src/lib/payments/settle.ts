import { Connection } from '@solana/web3.js';
import type { Payment } from '@/lib/api-types';
import { EVM_TOKENS, evmPublicClient } from './evm-pay';

/**
 * Settles History rows that the server never will. Bill payments are settled by the web backend (Bitrefill sync);
 * everything else — card funding (saved as "submitted" with no hash or reference) and transfers/bridges that carry a
 * transaction hash — just sits at "pending" unless someone looks at the chain. These checks do that.
 */

export type Verdict = { status: 'completed' | 'failed'; txHash?: string } | null;

const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '';
const ALCHEMY_SUBDOMAIN: Record<number, string> = { 1: 'eth-mainnet', 8453: 'base-mainnet', 137: 'polygon-mainnet', 42161: 'arb-mainnet', 10: 'opt-mainnet' };
const SOLANA_RPC = ALCHEMY_KEY ? `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : 'https://api.mainnet-beta.solana.com';

/** A card-funding row that never shows up on-chain after this long was not paid (declined, abandoned…). */
const FUNDING_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Chains a payment's hash could be on, most likely first (the web labels EVM payments "Base"). */
const EVM_CHAIN_IDS = [8453, 1, 137, 42161, 10];

const FUNDING_TOKEN_BY_LABEL: [RegExp, keyof typeof EVM_TOKENS][] = [
  [/base/i, 'usdc_base'],
  [/polygon/i, 'usdc_polygon'],
  [/arbitrum/i, 'usdc_arbitrum'],
  [/optimism/i, 'usdc_optimism'],
  [/ethereum|mainnet/i, 'usdc_erc20'],
];

async function evmReceipt(txHash: string): Promise<Verdict> {
  for (const chainId of EVM_CHAIN_IDS) {
    try {
      const receipt = await evmPublicClient(chainId).getTransactionReceipt({ hash: txHash as `0x${string}` });
      return { status: receipt.status === 'success' ? 'completed' : 'failed' };
    } catch {
      // Not on this chain (or not mined yet): try the next.
    }
  }
  return null;
}

async function solanaStatus(signature: string): Promise<Verdict> {
  try {
    const { value } = await new Connection(SOLANA_RPC, 'confirmed').getSignatureStatuses([signature], { searchTransactionHistory: true });
    const s = value[0];
    if (!s) return null;
    if (s.err) return { status: 'failed' };
    return s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized' ? { status: 'completed' } : null;
  } catch {
    return null;
  }
}

/** Looks for the USDC the card provider should have sent to this wallet since the row was created. */
async function cardFunding(p: Payment, evmAddress: string): Promise<Verdict> {
  const created = new Date(p.createdAt).getTime();
  const amount = Number(p.amountUsdc);
  const tokenKey = FUNDING_TOKEN_BY_LABEL.find(([re]) => re.test(p.description ?? ''))?.[1];
  if (!ALCHEMY_KEY || !tokenKey || !(amount > 0)) return null;
  const token = EVM_TOKENS[tokenKey];
  const sub = ALCHEMY_SUBDOMAIN[token.chainId];

  try {
    const res = await fetch(`https://${sub}.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getAssetTransfers',
        params: [
          {
            fromBlock: '0x0',
            toBlock: 'latest',
            toAddress: evmAddress,
            contractAddresses: [token.contract],
            category: ['erc20'],
            order: 'desc',
            maxCount: '0x19',
            withMetadata: true,
          },
        ],
      }),
    });
    const json = (await res.json()) as { result?: { transfers: { value: number; hash: string; metadata: { blockTimestamp: string } }[] } };
    const transfers = json.result?.transfers;
    if (!transfers) return null;

    // The provider delivers the requested USDC amount (a little less if it nets fees), so accept 3% under.
    const hit = transfers.find(
      (t) => t.value >= amount * 0.97 && new Date(t.metadata.blockTimestamp).getTime() >= created - 60_000,
    );
    if (hit) return { status: 'completed', txHash: hit.hash };
    return Date.now() - created > FUNDING_EXPIRY_MS ? { status: 'failed' } : null;
  } catch {
    return null;
  }
}

/** Statuses that mean "still waiting" — `submitted` is what card funding rows are saved with. */
export const isPendingStatus = (status: string) => status === 'pending' || status === 'processing' || status === 'submitted';

/** Best-effort: returns a terminal verdict for a pending row, or null when it's genuinely still in flight / unknowable. */
export async function verifyPayment(p: Payment, evmAddress: string | null): Promise<Verdict> {
  if (p.type === 'bill') return null; // the web backend settles these (Bitrefill sync)
  if (p.txHash) return p.chain === 'solana' ? solanaStatus(p.txHash) : evmReceipt(p.txHash);
  if (p.type === 'deposit' && /card funding/i.test(p.description ?? '') && evmAddress) return cardFunding(p, evmAddress);
  return null;
}
