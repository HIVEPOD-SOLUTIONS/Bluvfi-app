import { Platform } from 'react-native';
import type { Connection, PublicKey, Transaction } from '@solana/web3.js';

/**
 * Solana Mobile Wallet Adapter (MWA) — lets the user connect an external Solana wallet app (Seeker's Seed Vault,
 * Phantom, Solflare, Backpack…) and approve transactions in it. This is the Solana Mobile Stack's wallet interface.
 *
 * MWA is an Android native module, so it only exists in builds made after it was added; on iOS and on older
 * builds `mwaAvailable` is false and every wallet feature simply stays hidden instead of crashing at startup.
 */

type Mwa = typeof import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');

let mwa: Mwa | null = null;
try {
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mwa = require('@solana-mobile/mobile-wallet-adapter-protocol-web3js') as Mwa;
  }
} catch {
  mwa = null; // native module missing from this build
}

export const mwaAvailable = mwa !== null;

const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '';
export const SOLANA_RPC = ALCHEMY_KEY ? `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : 'https://api.mainnet-beta.solana.com';

/** What the wallet app shows when asking the user to approve Bluvfi. The icon path is relative to `uri`. */
const APP_IDENTITY = { name: 'Bluvfi', uri: 'https://www.bluvfi.xyz', icon: 'favicon.png' } as const;
const CHAIN = 'solana:mainnet';

export interface ConnectedWallet {
  /** Base58 address of the authorised account. */
  address: string;
  /** "Phantom", "Solflare", "Seed Vault"… as far as the wallet tells us. */
  name: string;
  /** Lets the next session skip the approval screen; kept in secure storage. */
  authToken: string;
}

export type WalletErrorKind = 'not-found' | 'declined' | 'unavailable' | 'failed';

export class WalletError extends Error {
  constructor(
    message: string,
    public kind: WalletErrorKind,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

/** Turns anything the adapter or a wallet throws into one sentence the user can act on. */
export function friendlyWalletError(err: unknown): WalletError {
  if (err instanceof WalletError) return err;
  const e = err as { code?: string | number; message?: string; name?: string };
  const message = e?.message ?? '';
  if (e?.code === 'ERROR_WALLET_NOT_FOUND' || /wallet not found|no wallet|found no installed wallet/i.test(message)) {
    return new WalletError('No compatible Solana wallet found on this phone. Install Phantom or Solflare, then try again.', 'not-found');
  }
  if (e?.code === -1 || e?.code === -3 || e?.code === 'ERROR_ASSOCIATION_CANCELLED' || /declined|reject|cancel|not signed/i.test(message)) {
    return new WalletError('Cancelled in your wallet. Nothing was sent.', 'declined');
  }
  if (e?.code === 'ERROR_SESSION_TIMEOUT' || e?.code === 'ERROR_SESSION_CLOSED') {
    return new WalletError('Your wallet took too long to respond. Open it and try again.', 'failed');
  }
  if (e?.code === -4 || /not submitted/i.test(message)) {
    return new WalletError("Your wallet couldn't send the transaction. Please try again.", 'failed');
  }
  if (/insufficient|not enough/i.test(message)) return new WalletError(message.split('\n')[0], 'failed');
  return new WalletError("Couldn't talk to your wallet. Please try again.", 'failed');
}

function requireMwa(): Mwa {
  if (!mwa) throw new WalletError('Wallet connect needs an updated version of the app.', 'unavailable');
  return mwa;
}

const b64 = (s: string) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require('buffer') as typeof import('buffer');
  return Buffer.from(s, 'base64');
};

/** The wallet's name from the link base it advertises (it has no separate "name" field), else its own account label. */
function walletName(uriBase: string | undefined, label: string | undefined): string {
  const host = (() => {
    try {
      return uriBase ? new URL(uriBase).hostname : '';
    } catch {
      return '';
    }
  })();
  if (/phantom/i.test(host)) return 'Phantom';
  if (/solflare/i.test(host)) return 'Solflare';
  if (/backpack/i.test(host)) return 'Backpack';
  if (/jup/i.test(host)) return 'Jupiter';
  if (/seedvault|solanamobile/i.test(host)) return 'Seed Vault';
  return label && label.length <= 24 ? label : 'Solana wallet';
}

function toConnected(auth: { accounts: readonly { address: string; label?: string }[]; auth_token: string; wallet_uri_base?: string }, previous?: ConnectedWallet): ConnectedWallet {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PublicKey } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const account = auth.accounts[0];
  if (!account) throw new WalletError('Your wallet did not share an account. Please try again.', 'failed');
  return {
    address: new PublicKey(b64(account.address)).toBase58(),
    name: previous?.name && !auth.wallet_uri_base ? previous.name : walletName(auth.wallet_uri_base, account.label),
    authToken: auth.auth_token,
  };
}

/**
 * Opens the user's wallet app and asks them to share an account. Passing the previous connection reuses its token,
 * which skips the approval screen when the wallet still remembers us.
 */
export async function connectWallet(previous?: ConnectedWallet | null): Promise<ConnectedWallet> {
  const m = requireMwa();
  const run = (authToken?: string) =>
    m.transact(async (wallet) =>
      toConnected(await wallet.authorize({ identity: APP_IDENTITY, chain: CHAIN, auth_token: authToken }), previous ?? undefined),
    );
  try {
    return await run(previous?.authToken);
  } catch (err) {
    // A stale token is refused with "authorization failed"; fall back to a fresh approval once.
    if (previous && (err as { code?: number })?.code === -1) {
      try {
        return await run(undefined);
      } catch (retryErr) {
        throw friendlyWalletError(retryErr);
      }
    }
    throw friendlyWalletError(err);
  }
}

/**
 * Builds a transaction for the connected account, has the wallet sign and send it, and returns the signature along
 * with the (possibly refreshed) connection. One wallet session covers re-authorising, building and sending, so the
 * user sees a single approval screen.
 */
export async function signAndSend(
  current: ConnectedWallet,
  build: (payer: PublicKey, connection: Connection) => Promise<Transaction>,
): Promise<{ signature: string; wallet: ConnectedWallet }> {
  const m = requireMwa();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Connection, PublicKey } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  try {
    return await m.transact(async (wallet) => {
      const wallet2 = toConnected(
        await wallet.authorize({ identity: APP_IDENTITY, chain: CHAIN, auth_token: current.authToken }),
        current,
      );
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      const tx = await build(new PublicKey(wallet2.address), connection);
      const [signature] = await wallet.signAndSendTransactions({ transactions: [tx] });
      return { signature, wallet: wallet2 };
    });
  } catch (err) {
    throw friendlyWalletError(err);
  }
}

// ── Transfers ────────────────────────────────────────────────────────────────

export const SOLANA_MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

export type TransferAsset = 'SOL' | keyof typeof SOLANA_MINTS;

const DECIMALS: Record<TransferAsset, number> = { SOL: 9, USDC: 6, USDT: 6 };

/** "12.5" → 12500000n, without floating-point error. Throws on anything that isn't a positive amount. */
function toBaseUnits(amount: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(amount.trim());
  if (!m) throw new WalletError('Enter a valid amount.', 'failed');
  const [, whole, frac = ''] = m;
  const units = BigInt(whole + frac.padEnd(decimals, '0').slice(0, decimals));
  if (units <= 0n) throw new WalletError('Enter an amount above zero.', 'failed');
  return units;
}

/** A transfer of `amount` of `asset` from the connected account to `to` (any Solana address, including deposit addresses). */
export async function buildTransfer(opts: {
  payer: PublicKey;
  connection: Connection;
  to: string;
  asset: TransferAsset;
  amount: string;
}): Promise<Transaction> {
  const { payer, connection, to, asset, amount } = opts;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const web3 = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const units = toBaseUnits(amount, DECIMALS[asset]);

  let toKey: PublicKey;
  try {
    toKey = new web3.PublicKey(to);
  } catch {
    throw new WalletError("That isn't a valid Solana address.", 'failed');
  }

  const tx = new web3.Transaction();
  if (asset === 'SOL') {
    tx.add(web3.SystemProgram.transfer({ fromPubkey: payer, toPubkey: toKey, lamports: units }));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const spl = require('@solana/spl-token') as typeof import('@solana/spl-token');
    const mint = new web3.PublicKey(SOLANA_MINTS[asset]);
    const from = spl.getAssociatedTokenAddressSync(mint, payer);
    const dest = spl.getAssociatedTokenAddressSync(mint, toKey, true); // true: deposit addresses can be off-curve
    const [source, destination] = await Promise.all([connection.getAccountInfo(from), connection.getAccountInfo(dest)]);
    if (!source) throw new WalletError(`You don't have any ${asset} in this wallet.`, 'failed');
    // The recipient may never have held this token; creating its account costs the sender a little SOL.
    if (!destination) tx.add(spl.createAssociatedTokenAccountIdempotentInstruction(payer, dest, toKey, mint));
    tx.add(spl.createTransferCheckedInstruction(from, mint, dest, payer, units, DECIMALS[asset]));
  }

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  return tx;
}

/** Waits until the network has confirmed `signature` (or gives up after about 45 seconds). Returns true if confirmed. */
export async function waitForConfirmation(signature: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Connection } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const connection = new Connection(SOLANA_RPC, 'confirmed');
  for (let i = 0; i < 30; i++) {
    const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const s = value[0];
    if (s?.err) throw new WalletError('The transfer failed on the network.', 'failed');
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

// ── Balances ─────────────────────────────────────────────────────────────────

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? 'RPC error');
  return json.result as T;
}

export interface WalletBalances {
  sol: number;
  usdc: number;
}

/** SOL and USDC held by any Solana address (the connected wallet's, here). */
export async function fetchWalletBalances(address: string): Promise<WalletBalances> {
  const [sol, tokens] = await Promise.all([
    rpc<{ value: number }>('getBalance', [address]),
    rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }[] }>('getTokenAccountsByOwner', [
      address,
      { mint: SOLANA_MINTS.USDC },
      { encoding: 'jsonParsed' },
    ]),
  ]);
  return {
    sol: sol.value / 1e9,
    usdc: tokens.value.reduce((sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0),
  };
}
