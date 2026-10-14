import type { Payment } from '@/lib/api-types';
import { SWAP_CHAIN_META } from '@/lib/swap-chains';

/** A Bitrefill order record from `/api/bitrefill/orders` (the delivery details live here, not on the payment). */
export interface BitrefillOrder {
  invoiceId: string;
  productName: string | null;
  packageValue: string;
  paymentMethod: string;
  status: string;
  redemptionCode: string | null;
  esimInstallLink: string | null;
  recipientEmail: string | null;
  amountUsdc: string | null;
  createdAt: string;
}

/** "Purchased Netflix via usdc_base" becomes { title: "Netflix", method: "USDC · Base" }. */
export function parsePurchase(description: string | null): { title: string; method?: string } {
  const text = (description ?? '').trim();
  if (!text) return { title: 'Digital product' };
  const match = text.match(/^Purchased\s+(.+?)(?:\s+via\s+(.+))?$/i);
  if (!match) return { title: text };
  const method = match[2]
    ?.split('_')
    .map((w, i) => (i === 0 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' · ');
  return { title: match[1], method };
}

export type StatusTone = 'success' | 'danger' | 'pending';

/** How a payment's status reads to a person, and which colour family it gets. */
export function statusInfo(status: string): { label: string; tone: StatusTone } {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'paid' || s === 'complete') return { label: 'Completed', tone: 'success' };
  if (s === 'failed') return { label: 'Failed', tone: 'danger' };
  if (s === 'expired' || s === 'cancelled' || s === 'canceled') return { label: s === 'expired' ? 'Expired' : 'Cancelled', tone: 'danger' };
  return { label: 'In progress', tone: 'pending' };
}

/** The order that belongs to a payment: a Bitrefill purchase keeps its invoice id as the payment's reference. */
export function findOrder(orders: readonly BitrefillOrder[] | undefined, payment: Pick<Payment, 'referenceId'>): BitrefillOrder | null {
  if (!orders || !payment.referenceId) return null;
  return orders.find((o) => o.invoiceId === payment.referenceId) ?? null;
}

// Explorers for the chains bluvfi's swap service pays from (see swap-chains.ts); Zcash and Hyperliquid hashes aren't EVM hashes, so they get none.
const SWAP_EXPLORER: Record<string, ((hash: string) => string | null) | undefined> = {
  arc: SWAP_CHAIN_META.arc.explorerTx,
  tempo: SWAP_CHAIN_META.tempo.explorerTx,
  robinhood: SWAP_CHAIN_META.robinhood.explorerTx,
};

const EXPLORERS: [RegExp, string][] = [
  [/base/i, 'https://basescan.org/tx/'],
  [/ethereum|mainnet/i, 'https://etherscan.io/tx/'],
  [/polygon/i, 'https://polygonscan.com/tx/'],
  [/arbitrum/i, 'https://arbiscan.io/tx/'],
  [/optimism/i, 'https://optimistic.etherscan.io/tx/'],
  [/avalanche/i, 'https://snowtrace.io/tx/'],
];

/** A block explorer link for the payment's transaction, or null when we can't be sure which network it was on. */
export function explorerUrl(payment: Pick<Payment, 'chain' | 'txHash' | 'description'>): string | null {
  const hash = (payment.txHash ?? '').trim();
  if (!hash) return null;
  const chain = (payment.chain ?? '').toLowerCase();
  if (chain === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(hash) ? `https://solscan.io/tx/${hash}` : null;
  if (chain === 'xrpl' || chain === 'xrp') return /^[0-9A-Fa-f]{64}$/.test(hash) ? `https://livenet.xrpl.org/transactions/${hash}` : null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  // Payments made from Arc, Tempo or Robinhood Chain carry their own network, so the link needs no guessing.
  const swapExplorer = SWAP_EXPLORER[chain];
  if (swapExplorer) return swapExplorer(hash);
  const network = parsePurchase(payment.description).method ?? '';
  const known = EXPLORERS.find(([re]) => re.test(network));
  return known ? known[1] + hash : null;
}

/** "abcd…wxyz" for a long id. */
export function shortId(id: string | null | undefined): string {
  const s = (id ?? '').trim();
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

/** What the "Ask AI" button sends about this purchase. */
export function askAboutPurchase(payment: Pick<Payment, 'description' | 'status' | 'createdAt'>): string {
  const { title } = parsePurchase(payment.description);
  const when = new Date(payment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const status = statusInfo(payment.status).label.toLowerCase();
  return `Tell me about my ${title} purchase on ${when}. Its status is ${status}. If anything went wrong, what should I do?`;
}
