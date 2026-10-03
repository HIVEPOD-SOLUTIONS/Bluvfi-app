import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  http,
  parseAbi,
  parseUnits,
  type Hex,
} from 'viem';
import { createEvmAdapter, getArcKit } from '@/lib/arc-kit';
import { evmChain, isUserRejection, type Eip1193Provider, type EvmWallet } from '@/lib/payments/evm-common';
import { tryRelayUsdc } from '@/lib/payments/gas-relay';

/**
 * Every EVM payment from the user's wallet goes through here (Bitrefill, stocks, Cryptorefills deposits,
 * Doma, wallet sends), so all providers get the same fallback. bluvfi web's lib/evm-pay.ts uses Privy's
 * gas sponsorship as its first layer; Privy's Expo SDK has no equivalent, so the app's first layer is Bluvfi's
 * own relayer instead:
 *
 *   Layer 1 — Gasless USDC through Bluvfi's relayer (/api/relay/transfer, see gas-relay.ts): the wallet signs
 *             an EIP-3009 authorization and Bluvfi's server pays the gas. Native USDC transfers only; skipped
 *             when the relay is off, unfunded or rate-limited, and for USDT / ETH / contract calls.
 *   Layer 2 — The embedded wallet sends the transaction itself; the user pays gas in the chain's native
 *             token. Skipped if they have none.
 *   Layer 3 — Circle App Kit send (Circle sponsors gas; the wallet signs). Plain token/ETH transfers only,
 *             on chains App Kit knows.
 *
 * If the user rejects a prompt, we stop — never re-prompt them on the next layer. Contract calls (approve,
 * Seaport fills, Doma pay) can only use layer 2, since layers 1 and 3 send plain transfers.
 */

export { evmChain, isUserRejection };
export type { Eip1193Provider, EvmWallet };

export type PayLayer = 1 | 2 | 3;

const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '';
const ALCHEMY_SUBDOMAIN: Record<number, string> = {
  1: 'eth-mainnet',
  8453: 'base-mainnet',
  137: 'polygon-mainnet',
  42161: 'arb-mainnet',
  10: 'opt-mainnet',
};

// App Kit's chain names for the chains it supports (layer 3).
const ARCKIT_CHAINS: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
};

// USDT's transfer() on some chains returns nothing — a stripped ABI avoids decode errors.
const TRANSFER_NO_RETURN = parseAbi(['function transfer(address to, uint256 amount)']);

/** Stablecoins the app pays with, keyed like bluvfi's Bitrefill payment methods (usdc_base, usdt_erc20, …). */
export const EVM_TOKENS: Record<string, { chainId: number; contract: Hex; symbol: 'USDC' | 'USDT' }> = {
  usdc_base: { chainId: 8453, contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
  usdt_base: { chainId: 8453, contract: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT' },
  usdc_erc20: { chainId: 1, contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
  usdt_erc20: { chainId: 1, contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' },
  usdc_polygon: { chainId: 137, contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC' },
  usdt_polygon: { chainId: 137, contract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT' },
  usdc_arbitrum: { chainId: 42161, contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC' },
  usdt_arbitrum: { chainId: 42161, contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT' },
  usdc_optimism: { chainId: 10, contract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC' },
  usdt_optimism: { chainId: 10, contract: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT' },
};

/** Public client on Alchemy where we have it, else the chain's own RPC. */
export function evmPublicClient(chainId: number) {
  const sub = ALCHEMY_SUBDOMAIN[chainId];
  return createPublicClient({
    chain: evmChain(chainId),
    transport: http(ALCHEMY_KEY && sub ? `https://${sub}.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined),
  });
}

/** One-line, user-facing version of a wallet/RPC error. */
export function friendlyEvmError(err: unknown, chainName = 'this network'): string {
  if (isUserRejection(err)) return 'Cancelled. Nothing was sent.';
  const raw = (err as Error)?.message ?? String(err);
  const m = raw.toLowerCase();
  if (m.includes('insufficient funds for gas') || m.includes('gas required exceeds') || m.includes('no native gas')) {
    return `Not enough gas on ${chainName}.`;
  }
  if (m.includes('insufficient token balance') || m.includes('balance_insufficient') || m.includes('exceeds balance') || m.includes('invalid opcode')) {
    return `Not enough balance on ${chainName}.`;
  }
  return raw.split('\n')[0];
}

export interface EvmPayment {
  chainId: number;
  /** Contract call or plain value transfer. */
  to: Hex;
  data?: Hex;
  value?: bigint;
  /**
   * Set for plain token/ETH transfers so layer 3 (App Kit) can do it.
   * `amount` is a decimal string in token units ("12.5").
   */
  transfer?: { token: Hex | 'native'; recipient: Hex; amount: string; symbol?: string };
}

/**
 * Sends one EVM transaction through the layers and returns its hash and the layer that succeeded. Does not
 * wait for confirmation (see waitForEvmTx).
 */
export async function payEvm(opts: {
  payment: EvmPayment;
  wallet: EvmWallet;
  onLayer?: (layer: PayLayer) => void;
  /** Tag for console logs, e.g. "bitrefill". */
  label?: string;
}): Promise<{ hash: Hex; layer: PayLayer }> {
  const { payment, wallet, onLayer, label = 'pay' } = opts;
  const chain = evmChain(payment.chainId);
  let lastErr: unknown;

  // ── Layer 1: gasless USDC through Bluvfi's relayer ──
  const t1 = payment.transfer;
  if (t1 && t1.token !== 'native' && t1.symbol === 'USDC' && wallet.getAccessToken) {
    onLayer?.(1);
    const hash = await tryRelayUsdc({
      chainId: payment.chainId,
      token: t1.token,
      recipient: t1.recipient,
      atomic: parseUnits(t1.amount, 6),
      wallet,
      getAccessToken: wallet.getAccessToken,
    });
    if (hash) return { hash, layer: 1 };
  }

  // ── Layer 2: the wallet sends it, the user pays gas ──
  try {
    onLayer?.(2);
    const account = wallet.address as Hex;
    // Check native gas first so a missing balance is a clean, catchable error.
    const gas = await evmPublicClient(payment.chainId).getBalance({ address: account });
    if (gas === BigInt(0)) throw new Error(`No native gas: no ${chain.nativeCurrency.symbol} on ${chain.name}`);
    const client = createWalletClient({ account, chain, transport: custom(await wallet.getProvider()) });
    await client.switchChain({ id: payment.chainId });
    const hash = await client.sendTransaction({ account, chain, to: payment.to, data: payment.data, value: payment.value });
    return { hash, layer: 2 };
  } catch (err) {
    if (isUserRejection(err)) throw err;
    lastErr = err;
    console.warn(`[${label}] Layer 2 (user gas) failed on ${chain.name}:`, friendlyEvmError(err, chain.name));
  }

  // ── Layer 3: Circle App Kit (transfers only) ──
  const arcChain = ARCKIT_CHAINS[payment.chainId];
  if (payment.transfer && arcChain) {
    onLayer?.(3);
    const [arcKit, adapter] = await Promise.all([getArcKit(), wallet.getProvider().then(createEvmAdapter)]);
    const t = payment.transfer;
    // App Kit only knows the "USDT" alias on Ethereum; elsewhere pass the contract address.
    const token = t.token === 'native' ? 'NATIVE' : t.symbol === 'USDC' ? 'USDC' : t.symbol === 'USDT' && payment.chainId === 1 ? 'USDT' : t.token;
    try {
      const step: any = await arcKit.send({
        from: { adapter, chain: arcChain as never },
        to: t.recipient,
        amount: t.amount,
        token: token as never,
      });
      if (step.state === 'error' || !step.txHash) throw new Error('Transfer did not complete');
      return { hash: step.txHash as Hex, layer: 3 };
    } catch (err) {
      if (isUserRejection(err)) throw err;
      console.warn(`[${label}] Layer 3 (App Kit) failed on ${chain.name}:`, friendlyEvmError(err, chain.name));
      throw new Error(friendlyEvmError(err, chain.name));
    }
  }

  throw new Error(friendlyEvmError(lastErr, chain.name));
}

/** Builds and sends an ERC-20 or native transfer through the layers. */
export function payEvmTransfer(opts: {
  chainId: number;
  token: Hex | 'native';
  /** Token symbol — USDT gets the no-return transfer ABI; USDC/USDT aliases help App Kit. */
  symbol: string;
  decimals: number;
  recipient: Hex;
  amount: string;
  wallet: EvmWallet;
  onLayer?: (layer: PayLayer) => void;
  label?: string;
}) {
  const { chainId, token, symbol, decimals, recipient, amount, ...rest } = opts;
  const atomic = parseUnits(amount, decimals);
  const payment: EvmPayment =
    token === 'native'
      ? { chainId, to: recipient, value: atomic, transfer: { token, recipient, amount, symbol } }
      : {
          chainId,
          to: token,
          data: encodeFunctionData({
            abi: symbol === 'USDT' ? TRANSFER_NO_RETURN : erc20Abi,
            functionName: 'transfer',
            args: [recipient, atomic],
          }),
          transfer: { token, recipient, amount, symbol },
        };
  return payEvm({ payment, ...rest });
}

/** Waits for a transaction and throws if it reverted. */
export async function waitForEvmTx(chainId: number, hash: Hex) {
  const receipt = await evmPublicClient(chainId).waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The transaction failed on-chain. Nothing was charged.');
  return receipt;
}
