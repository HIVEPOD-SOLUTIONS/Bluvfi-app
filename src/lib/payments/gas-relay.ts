import { createWalletClient, custom, type Hex } from 'viem';
import { API_BASE_URL } from '@/lib/api';
import { evmChain, isUserRejection, type Eip1193Provider } from '@/lib/payments/evm-common';

/**
 * Gasless USDC transfer through Bluvfi's relayer (`/api/relay/transfer`), the app's payment layer 1.
 *
 * The wallet signs an EIP-3009 `transferWithAuthorization` — a signature, no transaction and no gas — for one
 * transfer of USDC to one recipient. Bluvfi's server submits it and pays the gas, so it can never move more
 * or elsewhere. Native USDC on the supported chains only; everything else (USDT, ETH, contract calls) skips
 * this layer. When the relay is off, unfunded or rate-limited, `tryRelayUsdc` returns null and the caller
 * moves on to the next layer.
 */

const USDC: Record<number, Hex> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
};

type RelayStatus = { enabled: boolean; chains: number[]; maxUsdc: number };
let statusCache: { at: number; value: RelayStatus } | null = null;
const STATUS_TTL_MS = 60_000;

/** Whether the server's relayer is on (cached for a minute), so the user is only asked to sign when it can run. */
async function relayStatus(): Promise<RelayStatus> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value;
  let value: RelayStatus = { enabled: false, chains: [], maxUsdc: 0 };
  try {
    const res = await fetch(`${API_BASE_URL}/api/relay/transfer`);
    if (res.ok) value = (await res.json()) as RelayStatus;
  } catch {
    /* offline or old server: treat as disabled */
  }
  statusCache = { at: Date.now(), value };
  return value;
}

function randomNonce(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Sends `amount` USDC gaslessly. Returns the transaction hash, or null if this layer can't carry the payment
 * (not USDC, unsupported chain, relay off/unfunded/rate-limited, or the call failed) so the next layer runs.
 * A user rejecting the signature is re-thrown — the caller must stop, not try the next layer.
 */
export async function tryRelayUsdc(opts: {
  chainId: number;
  /** USDC token address being paid (must be the native USDC for the chain). */
  token: Hex;
  recipient: Hex;
  /** Atomic USDC (6 decimals). */
  atomic: bigint;
  wallet: { address: string; getProvider: () => Promise<Eip1193Provider> };
  getAccessToken: () => Promise<string | null>;
}): Promise<Hex | null> {
  const { chainId, token, recipient, atomic, wallet, getAccessToken } = opts;
  const usdc = USDC[chainId];
  if (!usdc || usdc.toLowerCase() !== token.toLowerCase()) return null;

  const status = await relayStatus();
  if (!status.enabled || !status.chains.includes(chainId) || Number(atomic) / 1e6 > status.maxUsdc) return null;

  try {
    const chain = evmChain(chainId);
    const from = wallet.address as Hex;
    const authorization = {
      from,
      to: recipient,
      value: atomic,
      validAfter: BigInt(0),
      validBefore: BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
      nonce: randomNonce(),
    };
    const client = createWalletClient({ account: from, chain, transport: custom(await wallet.getProvider()) });
    const signature = await client.signTypedData({
      account: from,
      domain: { name: 'USD Coin', version: '2', chainId, verifyingContract: usdc },
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

    const token_ = await getAccessToken();
    const res = await fetch(`${API_BASE_URL}/api/relay/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token_ ? { Authorization: `Bearer ${token_}` } : {}) },
      body: JSON.stringify({
        chainId,
        from,
        to: recipient,
        value: authorization.value.toString(),
        validAfter: '0',
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
        signature,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.hash === 'string') return data.hash as Hex;

    console.warn('[relay] gasless transfer not used:', data.code ?? res.status, data.error ?? '');
    // Off, unfunded or rate-limited server-side: don't ask again for a minute.
    if (['RELAY_DISABLED', 'RELAY_UNFUNDED', 'RATE_LIMITED'].includes(data.code)) statusCache = null;
    return null;
  } catch (err) {
    if (isUserRejection(err)) throw err;
    console.warn('[relay] gasless transfer failed:', (err as Error)?.message?.split('\n')[0]);
    return null;
  }
}
