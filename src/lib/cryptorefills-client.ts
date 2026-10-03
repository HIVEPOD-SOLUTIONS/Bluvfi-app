import { createPublicClient, createWalletClient, custom, erc20Abi, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import { API_BASE_URL } from '@/lib/api';
import type {
  CrOrderRequest,
  CrOrderStatus,
  CrPartnerOrder,
  CrPartnerRequest,
  CrPartnerStatus,
  CrPhase1,
  CrRail,
} from '@/lib/cryptorefills-types';

/**
 * The app half of the Cryptorefills checkout, as bluvfi web's `cryptorefills-client.ts`, using the Privy
 * Expo wallet providers instead of browser wallets.
 *
 * Gasless x402 (USDC):
 *   Base   — the embedded EVM wallet signs an EIP-3009 transferWithAuthorization (a signature, not a
 *            transaction); Cryptorefills relays it.
 *   Solana — the embedded Solana wallet partially signs a v0 USDC transfer whose fee payer is
 *            Cryptorefills' facilitator, which pays the SOL fee.
 * Partner API (any other coin): creates an order and returns a deposit address to send to.
 */

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '';
const BASE_RPC = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const SOLANA_RPC = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

type GetAccessToken = () => Promise<string | null>;
type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
/** The Privy embedded Solana wallet provider, as far as this flow needs it. */
type SolanaProvider = {
  request(args: { method: 'signTransaction'; params: { transaction: unknown } }): Promise<{ signedTransaction: Uint8Array }>;
};

export type CrPayStep = 'quoting' | 'signing' | 'settling';

export const RAIL_LABEL: Record<CrRail, string> = { base: 'Base', solana: 'Solana' };

/**
 * The gasless x402 checkout can't run right now (Cryptorefills or its facilitator is down) and, by the time
 * this is thrown, nothing was charged. The caller may fall back to a deposit-address order paid from the wallet.
 */
export class GaslessUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GaslessUnavailableError';
  }
}

/** Fetches a bluvfi API route with the Privy token and returns the parsed body whatever the status. */
async function apiCall(
  path: string,
  getAccessToken: GetAccessToken,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function usdcBalanceOnBase(address: string): Promise<number> {
  const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const bal = await client.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address as Hex] });
  return Number(bal) / 1e6;
}

export async function usdcBalanceOnSolana(owner: string): Promise<number> {
  const { Connection, PublicKey } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const { getAssociatedTokenAddress } = require('@solana/spl-token') as typeof import('@solana/spl-token');
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  const ata = await getAssociatedTokenAddress(new PublicKey(SOLANA_USDC), new PublicKey(owner));
  const bal = await conn.getTokenAccountBalance(ata).catch(() => null); // no ATA yet → 0
  return bal ? Number(bal.value.amount) / 1e6 : 0;
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomNonce(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Turns wallet/network errors into one short sentence for the user. */
export function friendlyPayError(err: unknown): string {
  const m = (err as Error)?.message ?? 'Payment failed.';
  if (/reject|denied|cancel/i.test(m)) return 'You cancelled the signature. Nothing was charged.';
  if (/blockhash|expired/i.test(m)) return 'The payment window closed before it was sent. Nothing was charged. Please try again.';
  return m.split('\n')[0];
}

async function signBase(phase1: CrPhase1, provider: Eip1193Provider, address: string): Promise<string> {
  const { requirement, expiresAt } = phase1;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${base.id.toString(16)}` }] });
  } catch {
    /* signing typed data doesn't need the active chain */
  }
  const walletClient = createWalletClient({ chain: base, transport: custom(provider) });
  const from = address as Hex;
  const authorization = {
    from,
    to: requirement.payTo as Hex,
    value: BigInt(requirement.maxAmountRequired),
    validAfter: BigInt(0),
    validBefore: BigInt(expiresAt),
    nonce: randomNonce(),
  };
  const signature = await walletClient.signTypedData({
    account: from,
    domain: {
      name: requirement.extra?.name ?? 'USD Coin',
      version: requirement.extra?.version ?? '2',
      chainId: base.id,
      verifyingContract: BASE_USDC,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });
  return b64url(
    JSON.stringify({
      x402Version: 2,
      scheme: 'exact',
      network: requirement.network,
      payload: {
        signature,
        authorization: {
          ...authorization,
          value: authorization.value.toString(),
          validAfter: '0',
          validBefore: authorization.validBefore.toString(),
        },
      },
    }),
  );
}

/**
 * Cryptorefills' Solana recipe: exactly 3 instructions (compute-unit limit, compute-unit price, SPL
 * TransferChecked), payerKey = extra.feePayer, fresh blockhash, partially signed by the user — the
 * facilitator signs the fee slot.
 */
async function signSolana(phase1: CrPhase1, provider: SolanaProvider, address: string): Promise<string> {
  const { requirement } = phase1;
  const feePayerKey = requirement.extra?.feePayer;
  if (!feePayerKey) throw new Error('Payment request is missing the Solana fee payer.');
  const { ComputeBudgetProgram, Connection, PublicKey, TransactionMessage, VersionedTransaction } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const { createTransferCheckedInstruction, getAssociatedTokenAddress } = require('@solana/spl-token') as typeof import('@solana/spl-token');

  const mint = new PublicKey(requirement.asset);
  const owner = new PublicKey(address);
  const senderAta = await getAssociatedTokenAddress(mint, owner);
  const recipientAta = await getAssociatedTokenAddress(mint, new PublicKey(requirement.payTo)); // payTo is the OWNER
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  const { blockhash } = await conn.getLatestBlockhash('finalized'); // re-fetched right before signing (~60s window)

  const message = new TransactionMessage({
    payerKey: new PublicKey(feePayerKey),
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
      createTransferCheckedInstruction(senderAta, mint, recipientAta, owner, BigInt(requirement.maxAmountRequired), 6),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  if (tx.message.compiledInstructions.length !== 3) throw new Error('Unexpected Solana transaction shape.');

  const { signedTransaction } = await provider.request({ method: 'signTransaction', params: { transaction: tx } });
  // Privy returns the signed VersionedTransaction; the facilitator wants its serialized bytes.
  const bytes: Uint8Array =
    signedTransaction instanceof Uint8Array ? signedTransaction : (signedTransaction as unknown as { serialize(): Uint8Array }).serialize();
  if (bytes.length > 1232) throw new Error('Solana transaction too large.');
  return b64url(
    JSON.stringify({
      x402Version: 2,
      scheme: 'exact',
      network: requirement.network,
      payload: { transaction: bytesToB64(bytes) }, // inner: plain base64; outer: base64url
    }),
  );
}

/**
 * Runs the whole gasless payment: balance check → Phase 1 (verified 402) → sign → Phase 2. If the final
 * price is more than 3% (+$0.10) above `expectedUsd`, `confirmPriceChange` decides whether to go on.
 * Returns the order receipt, or null if the user declined the new price.
 */
export async function payCryptorefillsOrder(opts: {
  order: CrOrderRequest;
  productName: string;
  expectedUsd: number;
  rail: CrRail;
  evm?: { provider: Eip1193Provider; address: string };
  solana?: { provider: SolanaProvider; address: string };
  getAccessToken: GetAccessToken;
  onStep?: (step: CrPayStep) => void;
  confirmPriceChange: (newUsd: number) => Promise<boolean>;
}): Promise<CrOrderStatus | null> {
  const { order, productName, expectedUsd, rail, evm, solana, getAccessToken, onStep, confirmPriceChange } = opts;

  const address = rail === 'solana' ? solana?.address : evm?.address;
  if (!address) throw new Error(`No ${RAIL_LABEL[rail]} wallet connected.`);
  const balance = rail === 'solana' ? await usdcBalanceOnSolana(address) : await usdcBalanceOnBase(address);
  if (balance < expectedUsd) {
    throw new Error(
      `You need $${expectedUsd.toFixed(2)} USDC on ${RAIL_LABEL[rail]} but have $${balance.toFixed(2)}. Add funds and try again.`,
    );
  }

  onStep?.('quoting');
  const quote = await apiCall('/api/cryptorefills/orders', getAccessToken, {
    method: 'POST',
    body: { phase: 'quote', order, rail },
  });
  if (!quote.ok) {
    // A server-side failure means the gasless rail is down; a 4xx is a problem with the order itself.
    if (quote.status >= 500) throw new GaslessUnavailableError(quote.data.error ?? "Couldn't start the order.");
    throw new Error(quote.data.error ?? "Couldn't start the order.");
  }
  const phase1 = quote.data as CrPhase1;

  // Never sign more than the user saw without asking again.
  const amount = Number(phase1.requirement.maxAmountRequired) / 1e6;
  if (amount > expectedUsd * 1.03 + 0.1 && !(await confirmPriceChange(amount))) return null;

  onStep?.('signing');
  const paymentSignature =
    rail === 'solana' ? await signSolana(phase1, solana!.provider, solana!.address) : await signBase(phase1, evm!.provider, evm!.address);

  onStep?.('settling');
  const body = { phase: 'pay', order, rail, sessionId: phase1.sessionId, paymentSignature, productName };
  // 503 = facilitator unreachable, nothing charged; the same signature may be retried.
  for (let attempt = 0; ; attempt++) {
    const res = await apiCall('/api/cryptorefills/orders', getAccessToken, { method: 'POST', body });
    if (res.ok) return res.data.order as CrOrderStatus;
    if (res.status === 503 && res.data.retryable) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      // Facilitator unreachable after retries: nothing was charged.
      throw new GaslessUnavailableError(res.data.error ?? 'The gasless payment service is unavailable.');
    }
    throw new Error(res.data.error ?? 'Payment failed.');
  }
}

/** Polls a gasless order until completed/failed/expired, or 10 minutes pass. Stops early if `signal` aborts. */
export async function pollCryptorefillsOrder(
  orderId: string,
  getAccessToken: GetAccessToken,
  opts: { onUpdate?: (o: CrOrderStatus) => void; signal?: AbortSignal } = {},
): Promise<CrOrderStatus | null> {
  const started = Date.now();
  let last: CrOrderStatus | null = null;
  while (Date.now() - started < 10 * 60_000 && !opts.signal?.aborted) {
    await new Promise((r) => setTimeout(r, 5000));
    if (opts.signal?.aborted) break;
    try {
      const res = await apiCall(`/api/cryptorefills/orders/${encodeURIComponent(orderId)}`, getAccessToken);
      if (res.ok && res.data.order) {
        last = res.data.order as CrOrderStatus;
        opts.onUpdate?.(last);
        if (last.status !== 'processing') return last;
      }
    } catch {
      /* transient — keep polling */
    }
  }
  return last;
}

export async function fetchCryptorefillsOrder(orderId: string, getAccessToken: GetAccessToken) {
  return apiCall(`/api/cryptorefills/orders/${encodeURIComponent(orderId)}`, getAccessToken);
}

export async function fetchPartnerOrder(orderId: string, getAccessToken: GetAccessToken) {
  return apiCall(`/api/cryptorefills/partner-orders/${encodeURIComponent(orderId)}`, getAccessToken);
}

// ── Partner API: any coin via deposit address ────────────────────────────────

export async function validatePartnerOrder(order: CrPartnerRequest, getAccessToken: GetAccessToken) {
  const res = await apiCall('/api/cryptorefills/partner-orders', getAccessToken, { method: 'POST', body: { action: 'validate', order } });
  if (!res.ok) throw new Error(res.data.error ?? "Couldn't check this order.");
  return res.data as { coin_amount?: string; coin?: string };
}

export async function createPartnerOrder(
  order: CrPartnerRequest,
  priceUsd: number,
  productName: string,
  getAccessToken: GetAccessToken,
): Promise<CrPartnerOrder> {
  const res = await apiCall('/api/cryptorefills/partner-orders', getAccessToken, {
    method: 'POST',
    body: { action: 'create', order, priceUsd, productName },
  });
  if (!res.ok) throw new Error(res.data.error ?? "Couldn't create the order.");
  return res.data.order as CrPartnerOrder;
}

/**
 * Polls a deposit-address order every 15s until it's delivered, failed or expired. Payment windows run
 * 1–3 hours, so this keeps going for 3 hours or until `signal` aborts (the order keeps working and the
 * code is emailed).
 */
export async function pollPartnerOrder(
  orderId: string,
  getAccessToken: GetAccessToken,
  opts: { onUpdate?: (o: CrPartnerStatus) => void; signal?: AbortSignal } = {},
): Promise<CrPartnerStatus | null> {
  const started = Date.now();
  let last: CrPartnerStatus | null = null;
  while (Date.now() - started < 3 * 60 * 60_000 && !opts.signal?.aborted) {
    await new Promise((r) => setTimeout(r, 15_000));
    if (opts.signal?.aborted) break;
    try {
      const res = await fetchPartnerOrder(orderId, getAccessToken);
      if (res.ok && res.data.order) {
        last = res.data.order as CrPartnerStatus;
        opts.onUpdate?.(last);
        if (['completed', 'failed', 'expired'].includes(last.status)) return last;
      }
    } catch {
      /* transient — keep polling */
    }
  }
  return last;
}
