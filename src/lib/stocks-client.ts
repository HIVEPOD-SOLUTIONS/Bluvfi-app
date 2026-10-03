import { ApiError } from '@/lib/api';
import type { StockOrder, StockQuote } from '@/hooks/use-stocks';
import { payEvmTransfer, type EvmWallet } from '@/lib/payments/evm-pay';

/**
 * The app half of a Backpack stock trade, shared by Invest → Stocks and the AI chat's trade card (mirrors
 * bluvfi web's `lib/stocks-client.ts`). A buy pays with USDC from the user's wallet in the same step, through
 * the shared payment layers; a sale's money goes back to the wallet server-side once it settles.
 */

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

type Call = <T>(path: string, options?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => Promise<T>;

export type TradeStep = 'funding' | 'placing' | 'pending';

/** USDC the wallet must send for a buy: the quote's max cost minus credit already held, rounded up to the cent. */
export function walletShare(quote: StockQuote, creditUsd: number): number {
  return quote.side === 'buy' ? Math.max(0, Math.ceil((Number(quote.estimateUsdc) - creditUsd) * 100) / 100) : 0;
}

/** GET /api/stocks/quote with its query string. */
export function fetchStockQuote(call: Call, asset: string, side: string, quantity: string) {
  return call<{ quote: StockQuote }>(
    `/api/stocks/quote?asset=${encodeURIComponent(asset)}&side=${side}&quantity=${encodeURIComponent(quantity)}`,
  );
}

/**
 * Moves `amountUsd` of USDC (Base) from the user's Bluvfi wallet to Bluvfi's Backpack account and waits until
 * the server has credited it.
 */
async function fundFromWallet(amountUsd: number, wallet: EvmWallet, call: Call) {
  const info = await call<{ address: `0x${string}` }>('/api/stocks/deposit');
  const { hash } = await payEvmTransfer({
    chainId: 8453,
    token: BASE_USDC,
    symbol: 'USDC',
    decimals: 6,
    recipient: info.address,
    amount: amountUsd.toFixed(2),
    wallet,
    label: 'stocks',
  });
  // The receipt can take a few seconds to be visible to the server.
  for (let i = 0; i < 20; i++) {
    try {
      await call('/api/stocks/deposit', { method: 'POST', body: { txHash: hash } });
      return;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err;
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
  throw new Error("Your USDC was sent but isn't confirmed yet. It'll be saved as credit once it confirms — try the buy again in a minute.");
}

/** Polls an order until it leaves "pending" or ~2 minutes pass (deferred settlement can take a moment). */
export async function watchStockOrder(order: StockOrder, call: Call, isAlive: () => boolean = () => true): Promise<StockOrder> {
  for (let i = 0; i < 40 && order.status === 'pending' && isAlive(); i++) {
    await new Promise((res) => setTimeout(res, 3000));
    const o = await call<{ order: StockOrder }>(`/api/stocks/orders/${order.id}`).catch(() => null);
    if (o?.order) order = o.order;
  }
  return order;
}

/** Funds a buy from the wallet (whatever credit doesn't cover), places the trade at the quoted price cap, and waits for it to settle. */
export async function executeStockTrade(opts: {
  quote: StockQuote;
  creditUsd: number;
  wallet: EvmWallet;
  call: Call;
  onStep?: (s: TradeStep) => void;
  isAlive?: () => boolean;
}): Promise<StockOrder> {
  const { quote, creditUsd, wallet, call, onStep, isAlive } = opts;
  const fromWallet = walletShare(quote, creditUsd);
  if (fromWallet > 0) {
    onStep?.('funding');
    await fundFromWallet(fromWallet, wallet, call);
  }
  onStep?.('placing');
  let placed: { order: StockOrder };
  try {
    placed = await call<{ order: StockOrder }>('/api/stocks/trade', {
      method: 'POST',
      body: { asset: quote.asset, side: quote.side, quantity: quote.quantity, limitPrice: quote.limitPrice },
    });
  } catch (e) {
    // Money already moved in stays as credit for the next buy — say so.
    const m = (e as Error).message;
    throw new Error(fromWallet > 0 ? `${m} Your $${fromWallet.toFixed(2)} is saved as credit for your next buy.` : m);
  }
  onStep?.('pending');
  return watchStockOrder(placed.order, call, isAlive);
}

/** One-line reason a non-filled order didn't go through. */
export function orderFailureMessage(order: StockOrder, side: 'buy' | 'sell'): string {
  return order.status === 'expired' || order.status === 'cancelled'
    ? `No one filled the order within your price cap. ${side === 'buy' ? 'Your money is kept as credit for your next buy' : 'Your shares are unchanged'}.`
    : order.error ?? 'The order failed. Nothing was charged.';
}

export function friendlyTradeError(err: unknown): string {
  const m = (err as Error)?.message ?? 'The trade failed.';
  return /reject|denied|cancel/i.test(m) ? 'Cancelled. Nothing was sent.' : m.split('\n')[0];
}
