import { encodeFunctionData, erc20Abi, type Hex } from 'viem';
import * as SecureStore from 'expo-secure-store';
import { evmPublicClient, payEvm, payEvmTransfer, waitForEvmTx, type EvmWallet, type PayLayer } from '@/lib/payments/evm-pay';
import { SWAP_CHAIN_META, type SwapChain } from '@/lib/swap-chains';

/**
 * The phone's half of paying from Arc, Tempo, Robinhood Chain, Zcash or Hyperliquid (the server half is bluvfi's swap service:
 * /api/bitrefill/chain-purchase, /api/chain-topup and the /api/chain-swaps ledger). It mirrors bluvfi web's lib/chain-purchase-client.ts, so
 * Bills, the wallet top-up for Cryptorefills, Backpack and Doma, and the chat cards all behave the same:
 *   - Arc and Tempo ("route" chains) come back as a token approval and a transaction that the Bluvfi wallet signs; the signed hash is
 *     reported so the swap can be tracked to the end;
 *   - Robinhood Chain, Zcash and Hyperliquid ("deposit" chains) come back as an address to pay. Robinhood Chain ETH can also be sent from
 *     the Bluvfi wallet in one tap.
 * Nothing here holds a key: the wallet signs, the server reads its own swap service.
 */

/** The server's call helper (useApiClient()). */
export type ApiCall = <T>(path: string, options?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; query?: Record<string, string | number | undefined> }) => Promise<T>;

/** What the swap service hands back for a route chain: what the wallet must sign. */
export interface RoutePayment {
  chainId: number;
  approval?: { token: string; spender: string; amount: string } | null;
  transactionRequest?: { to: string; data: string; value?: string | null } | null;
}

export type PurchaseChain = SwapChain;

/** The result of POST /api/bitrefill/chain-purchase. */
export interface ChainPurchaseResult {
  chain: PurchaseChain;
  invoiceId: string;
  invoiceAccessToken?: string;
  expirationMinutes?: number;
  priceUsd: number;
  walletRequestId: string;
  /** What the person pays, a decimal in `symbol`. */
  amount: string;
  symbol: string;
  depositAddress: string | null;
  depositMemo: string | null;
  refundAddress: string;
  expiresAt: string | null;
  payment: RoutePayment | null;
}

/** The result of POST /api/chain-topup. */
export interface TopUpResult {
  walletRequestId: string;
  chain: SwapChain;
  amount: string;
  symbol: string;
  depositAddress: string | null;
  depositMemo: string | null;
  refundAddress: string;
  expiresAt: string | null;
  payment: RoutePayment | null;
  receive: { token: 'usdc' | 'eth'; amount: string; recipient: string };
}

export type TopUpToken = 'usdc' | 'eth';
export type TopUpPurpose = 'cryptorefills' | 'stocks' | 'doma' | 'wallet';

export interface ChainSwapRow {
  id: string;
  purpose: string;
  reference: string | null;
  chain: string;
  status: 'awaiting_payment' | 'processing' | 'completed' | 'failed' | 'expired';
  pay: string;
  receive: string;
  depositAddress: string | null;
  depositMemo: string | null;
  refundAddress: string;
  userTxHash: string | null;
  swapTxHash: string | null;
  createdAt: string;
  summary: string;
  fundsAt: string;
  explorer: string | null;
}

export interface PurchaseRequestBody {
  chain: PurchaseChain;
  refundAddress: string;
  productId: string;
  packageId?: string;
  customValue?: number;
  recipientEmail?: string;
  recipientName?: string;
  sendTo?: string;
}

export function startChainPurchase(call: ApiCall, body: PurchaseRequestBody): Promise<ChainPurchaseResult> {
  return call<ChainPurchaseResult>('/api/bitrefill/chain-purchase', { method: 'POST', body });
}

export function startChainTopUp(
  call: ApiCall,
  body: { chain: SwapChain; token: TopUpToken; amount: string; amountUsd: number; recipient: string; refundAddress?: string; purpose: TopUpPurpose; reference?: string },
): Promise<TopUpResult> {
  return call<TopUpResult>('/api/chain-topup', { method: 'POST', body });
}

export function chainTopUpStatus(call: ApiCall, walletRequestId: string) {
  return call<{ progress: ChainSwapRow['status']; error: string | null; chain: string | null; summary: string }>(`/api/chain-topup/${encodeURIComponent(walletRequestId)}`);
}

export async function listChainSwaps(call: ApiCall): Promise<ChainSwapRow[]> {
  const res = await call<{ swaps: ChainSwapRow[] }>('/api/chain-swaps');
  return res.swaps ?? [];
}

export type RouteStage = 'approving' | 'paying' | 'confirming';

// ── Signed but unreported route hashes ───────────────────────────────────────
// Kept on the phone until the server has them (it then stores them and keeps retrying the swap service itself), so a hash can never be lost
// between the wallet and the service if the app closes right after signing.

const PENDING_KEY = 'bluvfi.pending-route-reports';
interface PendingReport {
  url: string;
  txHash: string;
  at: number;
}

async function readPending(): Promise<PendingReport[]> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_KEY);
    const list = raw ? (JSON.parse(raw) as PendingReport[]) : [];
    return Array.isArray(list) ? list.filter((p) => typeof p?.url === 'string' && typeof p?.txHash === 'string') : [];
  } catch {
    return [];
  }
}

async function writePending(list: PendingReport[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(list.slice(-20)));
  } catch {
    /* the report is still attempted below; only the retry-on-next-launch is lost */
  }
}

/** True when the server has dealt with the hash: accepted, or refused for good (a 4xx means it already has a decision). */
async function sendReport(call: ApiCall, url: string, txHash: string): Promise<boolean> {
  try {
    await call(url, { method: 'POST', body: { txHash } });
    return true;
  } catch (e) {
    const status = (e as { status?: number })?.status;
    return typeof status === 'number' && status >= 400 && status < 500;
  }
}

/** Retries any route hash this phone signed but never got to the server. Call once when the app opens signed in. */
export async function retryPendingRouteReports(call: ApiCall): Promise<void> {
  const list = await readPending();
  if (!list.length) return;
  const keep: PendingReport[] = [];
  for (const p of list) {
    if (Date.now() - p.at > 7 * 86_400_000) continue; // a week old: give up locally
    if (!(await sendReport(call, p.url, p.txHash))) keep.push(p);
  }
  await writePending(keep);
}

/**
 * Route chains (Arc, Tempo): signs what the swap service returned with the Bluvfi wallet. First the token approval (the exact amount, and
 * only if the allowance is short; never an unlimited approval to a router), then the swap transaction, and reports the hash to `reportUrl`
 * so the swap can be tracked. Both go through the shared payment layers.
 */
export async function payRouteSwap(opts: {
  chain: SwapChain;
  payment: RoutePayment | null;
  /** The address the route was prepared for: it must be the signing wallet. */
  refundAddress: string;
  reportUrl: string;
  wallet: EvmWallet;
  call: ApiCall;
  onStage?: (stage: RouteStage, layer?: PayLayer) => void;
}): Promise<Hex> {
  const { chain, payment: p, wallet, call, onStage } = opts;
  const meta = SWAP_CHAIN_META[chain];
  if (meta.kind !== 'route' || !meta.wallet) throw new Error(`${meta.label} payments aren’t signed in the app.`);
  const chainId = meta.wallet.chainId;
  if (!p?.transactionRequest?.to || !p.transactionRequest.data) throw new Error(`This ${meta.label} payment has no transaction to sign.`);
  if (wallet.address.toLowerCase() !== opts.refundAddress.toLowerCase()) {
    throw new Error('This payment was prepared for a different wallet. Please start again.');
  }
  if (p.chainId !== chainId) throw new Error('This payment targets an unexpected network.');

  const account = wallet.address as Hex;
  if (p.approval) {
    const token = p.approval.token as Hex;
    const spender = p.approval.spender as Hex;
    const needed = BigInt(p.approval.amount);
    const allowance = await evmPublicClient(chainId).readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, spender] });
    if (allowance < needed) {
      onStage?.('approving');
      const { hash } = await payEvm({
        payment: { chainId, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, needed] }) },
        wallet,
        onLayer: (l) => onStage?.('approving', l),
        label: `${chain}-approve`,
      });
      await waitForEvmTx(chainId, hash);
    }
  }

  onStage?.('paying');
  const tx = p.transactionRequest;
  const { hash } = await payEvm({
    payment: { chainId, to: tx.to as Hex, data: tx.data as Hex, ...(tx.value && BigInt(tx.value) > BigInt(0) ? { value: BigInt(tx.value) } : {}) },
    wallet,
    onLayer: (l) => onStage?.('paying', l),
    label: `${chain}-route`,
  });

  // Report straight away (before waiting): a mined-but-unreported route can't be tracked. Kept on the phone until the server confirms it.
  onStage?.('confirming');
  await writePending([...(await readPending()), { url: opts.reportUrl, txHash: hash, at: Date.now() }]);
  let delivered = false;
  for (let attempt = 0; attempt < 3 && !delivered; attempt++) {
    delivered = await sendReport(call, opts.reportUrl, hash);
    if (!delivered) await new Promise((r) => setTimeout(r, 1500));
  }
  if (delivered) await writePending((await readPending()).filter((x) => x.txHash !== hash));
  await waitForEvmTx(chainId, hash).catch(() => {});
  return hash;
}

/**
 * Deposit chains the Bluvfi wallet can pay on (Robinhood Chain ETH): sends exactly `amount` to the deposit address, and records the hash on
 * the swap's ledger row so the transfer stays traceable.
 */
export async function payDepositFromWallet(opts: {
  chain: SwapChain;
  depositAddress: string;
  amount: string;
  wallet: EvmWallet;
  /** Records the hash on the swap's ledger row. */
  track?: { walletRequestId: string; call: ApiCall };
}): Promise<Hex> {
  const meta = SWAP_CHAIN_META[opts.chain];
  if (meta.kind !== 'deposit' || !meta.wallet) throw new Error(`${meta.label} can’t be paid from the Bluvfi wallet.`);
  const { hash } = await payEvmTransfer({
    chainId: meta.wallet.chainId,
    token: meta.wallet.token,
    symbol: meta.symbol,
    decimals: meta.wallet.tokenDecimals,
    recipient: opts.depositAddress as Hex,
    amount: opts.amount,
    wallet: opts.wallet,
    label: `${opts.chain}-deposit`,
  });
  if (opts.track) {
    // Before waiting: the hash is what lets anyone trace this transfer later.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await opts.track.call(`/api/chain-swaps/${encodeURIComponent(opts.track.walletRequestId)}/user-tx`, { method: 'POST', body: { txHash: hash } });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  await waitForEvmTx(meta.wallet.chainId, hash).catch(() => {});
  return hash;
}

/** The Bluvfi wallet's balance of what a swap chain spends (null if it can't be read, or the chain has no wallet). */
export async function walletSwapBalance(chain: SwapChain, address: string): Promise<number | null> {
  const w = SWAP_CHAIN_META[chain].wallet;
  if (!w) return null;
  try {
    const client = evmPublicClient(w.chainId);
    const raw = w.token === 'native' ? await client.getBalance({ address: address as Hex }) : await client.readContract({ address: w.token, abi: erc20Abi, functionName: 'balanceOf', args: [address as Hex] });
    return Number(raw) / 10 ** w.tokenDecimals;
  } catch {
    return null;
  }
}

/** The Bluvfi wallet's USDC or ETH on Base: what a top-up is measured against (null if it can't be read). */
export async function baseBalance(token: TopUpToken, address: string): Promise<number | null> {
  try {
    const client = evmPublicClient(8453);
    if (token === 'eth') return Number(await client.getBalance({ address: address as Hex })) / 1e18;
    return Number(await client.readContract({ address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', abi: erc20Abi, functionName: 'balanceOf', args: [address as Hex] })) / 1e6;
  } catch {
    return null;
  }
}

/** What a top-up must cover: only the shortfall, plus a little headroom for price moves; deposit chains have a minimum, so a small shortfall rounds up to it. */
export function topUpPlan(opts: { need: number; needUsd: number; onBase: number | null; token: TopUpToken; kind: 'route' | 'deposit'; minUsd: number }) {
  const usdPerUnit = opts.need > 0 ? opts.needUsd / opts.need : 1;
  const short = opts.onBase === null ? opts.need : Math.max(0, opts.need - opts.onBase);
  let units = short * 1.005;
  let usd = units * usdPerUnit;
  if (opts.kind === 'deposit' && usd < opts.minUsd) {
    usd = opts.minUsd;
    units = usd / usdPerUnit;
  }
  const dp = opts.token === 'eth' ? 6 : 2;
  const rounded = Math.ceil(units * 10 ** dp) / 10 ** dp;
  return { amount: rounded.toFixed(dp), usd: Math.round(usd * 100) / 100, covered: opts.onBase !== null && short <= 0 };
}
