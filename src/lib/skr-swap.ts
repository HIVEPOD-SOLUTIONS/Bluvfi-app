import { Buffer } from 'buffer';
import { PublicKey, VersionedTransaction, type Connection } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

/**
 * Converting SKR to USDC on the person's own wallet, through Jupiter. Used two ways: the "Convert" button (they choose how much SKR),
 * and automatically when a payment needs more USDC than they have (only the missing amount is converted, from their SKR).
 *
 * Nothing here ever holds a key: the transaction is built by Jupiter, CHECKED here, and then signed by the person's own wallet (the
 * Bluvfi wallet or the wallet they connected), which is the same approval they give any payment. Because the transaction comes from a
 * third party, it is only signed when ALL of this holds:
 *   1. it is a normal v0 transaction that only the person signs, paid for by them;
 *   2. it only calls the compute-budget, associated-token-account and Jupiter programs (and creating an account is only for them);
 *   3. a simulation shows what it does to their wallet: SKR out no more than the quote allows, USDC in no less than the quote
 *      guarantees, and no more than a few thousandths of a SOL spent.
 * If any of that fails nothing is signed, and nothing has moved.
 */

export const SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const JUPITER_API = 'https://lite-api.jup.ag';

export const SWAP = {
  /** Worst price move we accept between the quote and the swap, in basis points (1%). */
  slippageBps: 100,
  /** Refuse a route that moves the price more than this (percent). */
  maxPriceImpactPct: 2,
  /** The most SOL a swap may cost (network fee plus the rent for a new USDC account, which is about 0.002 SOL). */
  maxSolSpentLamports: 5_000_000,
  /** Keep at least this much SOL to pay the fee, or the swap would fail partway. */
  minSolLamports: 3_000_000,
  /** The most USDC one conversion may produce (micro-USDC), as a guard against a bug or a bad price. */
  maxUsdcOutMicro: 1_000_000_000,
  /** Added to the USDC a payment is short by, so rounding can't leave it a hair short. */
  cushionMicro: 10_000,
  quoteTimeoutMs: 10_000,
} as const;

export type SwapMode = 'ExactIn' | 'ExactOut';
export type SwapErrorCode = 'quote' | 'no_liquidity' | 'price_impact' | 'limit' | 'balance' | 'fees' | 'build' | 'tx_rejected' | 'simulation' | 'send' | 'confirm';

export class SwapError extends Error {
  constructor(public code: SwapErrorCode, message: string) {
    super(message);
    this.name = 'SwapError';
  }
}

/** A quote Jupiter gave us, reduced to what we check. `raw` is sent back to Jupiter unchanged to build the swap. */
export interface Quote {
  raw: Record<string, unknown>;
  mode: SwapMode;
  /** SKR the swap takes, as quoted. */
  inMicro: number;
  /** USDC the swap gives, as quoted. */
  outMicro: number;
  /** The most SKR it may take after price movement. */
  maxInMicro: number;
  /** The least USDC it may give after price movement. */
  minOutMicro: number;
  priceImpactPct: number;
}

const DIGITS = /^\d+$/;
const asMicro = (v: unknown): number => (typeof v === 'string' && DIGITS.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : NaN);

/** Reads Jupiter's quote, refusing anything that isn't exactly the swap that was asked for, on a sane price. */
export function parseQuote(json: unknown, mode: SwapMode, amountMicro: number): Quote {
  const j = json as Record<string, unknown> | null;
  if (!j || typeof j !== 'object') throw new SwapError('quote', 'Couldn’t get a price right now. Try again in a moment.');
  if (typeof j.errorCode === 'string' || typeof j.error === 'string') {
    const noRoute = /route|liquidity|token_not_tradable/i.test(`${j.errorCode} ${j.error}`);
    throw new SwapError(noRoute ? 'no_liquidity' : 'quote', noRoute ? 'There isn’t enough SKR liquidity to convert that amount right now. Try a smaller amount.' : 'Couldn’t get a price right now. Try again in a moment.');
  }
  const inMicro = asMicro(j.inAmount);
  const outMicro = asMicro(j.outAmount);
  const threshold = asMicro(j.otherAmountThreshold);
  if (j.inputMint !== SKR_MINT || j.outputMint !== USDC_MINT || j.swapMode !== mode || !(inMicro > 0) || !(outMicro > 0) || !(threshold > 0)) {
    throw new SwapError('quote', 'The price we got back wasn’t for this conversion, so it was ignored. Try again.');
  }
  if (mode === 'ExactIn' ? inMicro !== amountMicro : outMicro !== amountMicro) throw new SwapError('quote', 'The price we got back didn’t match the amount, so it was ignored. Try again.');
  const impact = Number(j.priceImpactPct ?? 0);
  if (!Number.isFinite(impact) || impact < 0 || impact > SWAP.maxPriceImpactPct) {
    throw new SwapError('price_impact', 'The SKR price looks unreliable right now (it would move the market too much). Try a smaller amount or try again shortly.');
  }
  // The guaranteed side must be sane: a quote that allows far more slippage than we asked for is refused.
  const slack = SWAP.slippageBps / 10_000 + 0.02;
  if (mode === 'ExactIn') {
    if (threshold > outMicro || threshold < outMicro * (1 - slack)) throw new SwapError('quote', 'The price we got back looked wrong, so it was ignored. Try again.');
    return { raw: j, mode, inMicro, outMicro, maxInMicro: inMicro, minOutMicro: threshold, priceImpactPct: impact };
  }
  if (threshold < inMicro || threshold > inMicro * (1 + slack)) throw new SwapError('quote', 'The price we got back looked wrong, so it was ignored. Try again.');
  return { raw: j, mode, inMicro, outMicro, maxInMicro: threshold, minOutMicro: outMicro, priceImpactPct: impact };
}

export const quoteUrl = (mode: SwapMode, amountMicro: number): string =>
  `${JUPITER_API}/swap/v1/quote?inputMint=${SKR_MINT}&outputMint=${USDC_MINT}&amount=${amountMicro}&slippageBps=${SWAP.slippageBps}&swapMode=${mode}`;

type Fetch = typeof fetch;

export async function fetchQuote(mode: SwapMode, amountMicro: number, f: Fetch = fetch): Promise<Quote> {
  if (!Number.isSafeInteger(amountMicro) || amountMicro <= 0) throw new SwapError('quote', 'Enter an amount above zero.');
  let res: Response;
  try {
    res = await f(quoteUrl(mode, amountMicro), { signal: AbortSignal.timeout(SWAP.quoteTimeoutMs) });
  } catch {
    throw new SwapError('quote', 'Couldn’t reach the price service. Check your connection and try again.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok && !(json && typeof json === 'object')) throw new SwapError('quote', 'Couldn’t get a price right now. Try again in a moment.');
  return parseQuote(json, mode, amountMicro);
}

/** Asks Jupiter to build the (unsigned) swap transaction for this quote and wallet. */
export async function fetchSwapTransaction(quote: Quote, user: string, f: Fetch = fetch): Promise<{ transaction: string; lastValidBlockHeight: number }> {
  let res: Response;
  try {
    res = await f(`${JUPITER_API}/swap/v1/swap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteResponse: quote.raw, userPublicKey: user, dynamicComputeUnitLimit: true, wrapAndUnwrapSol: false }),
      signal: AbortSignal.timeout(SWAP.quoteTimeoutMs * 2),
    });
  } catch {
    throw new SwapError('build', 'Couldn’t prepare the conversion. Check your connection and try again.');
  }
  const j = (await res.json().catch(() => null)) as { swapTransaction?: unknown; lastValidBlockHeight?: unknown } | null;
  if (!res.ok || typeof j?.swapTransaction !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(j.swapTransaction) || !Number.isSafeInteger(Number(j.lastValidBlockHeight))) {
    throw new SwapError('build', 'Couldn’t prepare the conversion. Try again in a moment.');
  }
  return { transaction: j.swapTransaction, lastValidBlockHeight: Number(j.lastValidBlockHeight) };
}

// ── Checking the transaction before anything is signed ────────────────────────

const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const JUPITER_V6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const ALLOWED_PROGRAMS = new Set([COMPUTE_BUDGET, ATA_PROGRAM, JUPITER_V6]);
const MAX_INSTRUCTIONS = 6;

/**
 * Decodes the transaction Jupiter built and refuses it unless it is exactly the kind of transaction a SKR to USDC swap is: a v0
 * transaction that only this person signs and pays for, calling only the compute-budget, account-creation and Jupiter programs.
 * Creating a token account is only accepted if it is paid for by, and owned by, this person.
 */
export function checkSwapTransaction(base64: string, user: string): VersionedTransaction {
  const reject = (why: string): never => {
    throw new SwapError('tx_rejected', `For your safety this conversion was stopped (${why}). Nothing was sent.`);
  };
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(base64, 'base64'));
  } catch {
    return reject('the transaction couldn’t be read');
  }
  const m = tx.message;
  const keys = m.staticAccountKeys;
  if (tx.version !== 0) reject('unexpected transaction format');
  if (m.header.numRequiredSignatures !== 1) reject('it needs more signatures than yours');
  if (keys[0]?.toBase58() !== user) reject('it isn’t paid for by your wallet');
  const instructions = m.compiledInstructions;
  if (instructions.length === 0 || instructions.length > MAX_INSTRUCTIONS) reject('unexpected number of steps');
  for (const ix of instructions) {
    const program = keys[ix.programIdIndex]?.toBase58();
    if (!program || !ALLOWED_PROGRAMS.has(program)) reject('it calls an unexpected program');
    if (program === ATA_PROGRAM) {
      // [payer, token account, owner, mint, system program, token program]: only for the person's own accounts.
      const payer = keys[ix.accountKeyIndexes[0]]?.toBase58();
      const owner = keys[ix.accountKeyIndexes[2]]?.toBase58();
      if (payer !== user || owner !== user) reject('it creates an account for someone else');
    }
  }
  if (!instructions.some((ix) => keys[ix.programIdIndex]?.toBase58() === JUPITER_V6)) reject('it doesn’t swap');
  return tx;
}

// ── Simulating it: what will it do to the wallet? ─────────────────────────────

/** The balances a swap can change: SKR, USDC and SOL. */
export interface Snapshot {
  skrMicro: number;
  usdcMicro: number;
  lamports: number;
}

/** SPL token accounts keep the balance as a little-endian u64 at byte 64. A missing account is a balance of zero. */
function tokenAmount(data: Uint8Array | null | undefined): number {
  if (!data || data.length < 72) return 0;
  return Number(Buffer.from(data).readBigUInt64LE(64));
}

const addresses = (user: string) => {
  const owner = new PublicKey(user);
  return {
    owner,
    skr: getAssociatedTokenAddressSync(new PublicKey(SKR_MINT), owner),
    usdc: getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), owner),
  };
};

/** The wallet's SKR, USDC and SOL right now. */
export async function readSnapshot(connection: Pick<Connection, 'getMultipleAccountsInfo'>, user: string): Promise<Snapshot> {
  const a = addresses(user);
  const [skr, usdc, sol] = await connection.getMultipleAccountsInfo([a.skr, a.usdc, a.owner], 'confirmed');
  return { skrMicro: tokenAmount(skr?.data), usdcMicro: tokenAmount(usdc?.data), lamports: sol?.lamports ?? 0 };
}

/**
 * Runs the transaction on the network without signing or sending it, and checks what it would do to the wallet against the quote.
 * Returns what the swap will do (SKR out, USDC in), or throws if it would fail or do anything the quote doesn't allow.
 */
export async function verifyBySimulation(
  connection: Pick<Connection, 'simulateTransaction'>,
  tx: VersionedTransaction,
  user: string,
  before: Snapshot,
  quote: Quote,
): Promise<{ skrOutMicro: number; usdcInMicro: number }> {
  const a = addresses(user);
  let sim;
  try {
    sim = await connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'processed',
      accounts: { encoding: 'base64', addresses: [a.skr.toBase58(), a.usdc.toBase58(), a.owner.toBase58()] },
    });
  } catch {
    throw new SwapError('simulation', 'Couldn’t check the conversion with the network. Nothing was sent. Try again.');
  }
  if (sim.value.err) throw new SwapError('simulation', 'The network says this conversion would fail right now (the price may have just moved). Nothing was sent. Try again.');
  const post = sim.value.accounts ?? [];
  const decode = (i: number): Uint8Array | null => {
    const d = post[i]?.data;
    return Array.isArray(d) && typeof d[0] === 'string' ? Buffer.from(d[0], 'base64') : null;
  };
  const after: Snapshot = { skrMicro: tokenAmount(decode(0)), usdcMicro: tokenAmount(decode(1)), lamports: post[2]?.lamports ?? 0 };
  const skrOut = before.skrMicro - after.skrMicro;
  const usdcIn = after.usdcMicro - before.usdcMicro;
  const solSpent = before.lamports - after.lamports;
  if (skrOut <= 0 || skrOut > quote.maxInMicro) throw new SwapError('tx_rejected', 'For your safety this conversion was stopped (it would take a different amount of SKR than quoted). Nothing was sent.');
  if (usdcIn < quote.minOutMicro) throw new SwapError('tx_rejected', 'For your safety this conversion was stopped (it would pay out less USDC than quoted). Nothing was sent.');
  if (solSpent > SWAP.maxSolSpentLamports) throw new SwapError('tx_rejected', 'For your safety this conversion was stopped (it would cost more SOL than expected). Nothing was sent.');
  return { skrOutMicro: skrOut, usdcInMicro: usdcIn };
}

// ── Amounts as people type and read them ──────────────────────────────────────

/** "12.5" -> 12500000 (micro-SKR), or null for anything that isn't a positive amount with at most six decimals. */
export function parseSkrAmount(text: string): number | null {
  const m = /^(\d+)(?:\.(\d{0,6}))?$/.exec(text.trim());
  if (!m) return null;
  const micro = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'));
  return Number.isSafeInteger(micro) && micro > 0 ? micro : null;
}

/** 12500000 -> "12.5", with no trailing zeros, for putting back in the amount box. */
export const skrText = (micro: number): string => (micro / 1_000_000).toFixed(6).replace(/\.?0+$/, '');

/** "1,234.56" */
export const formatSkr = (micro: number): string => (micro / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** "$1.65" (two decimals, rounded down so it is never more than the person gets) */
export const formatUsdc = (micro: number): string => '$' + (Math.floor(micro / 10_000) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** What one SKR is worth in this quote, in USD (from the amounts quoted, so it includes the price impact). */
export const quotedPrice = (q: Pick<Quote, 'inMicro' | 'outMicro'>): number => q.outMicro / q.inMicro;

// ── The whole conversion ──────────────────────────────────────────────────────

/** The slice of a Solana wallet provider used to sign (the Bluvfi wallet, or a connected wallet app). */
export interface SwapSigner {
  request(args: { method: 'signAndSendTransaction'; params: { transaction: VersionedTransaction; connection?: unknown } }): Promise<{ signature?: string }>;
}

export type Stage = 'quote' | 'prepare' | 'check' | 'sign' | 'confirm';

export interface ConvertResult {
  signature: string;
  /** SKR the swap will have taken and USDC it will have paid in, as simulated just before signing. */
  skrOutMicro: number;
  usdcInMicro: number;
}

export interface ConvertOptions {
  user: string;
  mode: SwapMode;
  /** ExactIn: SKR to convert (micro-SKR). ExactOut: USDC wanted (micro-USDC). */
  amountMicro: number;
  provider: SwapSigner;
  connection: Pick<Connection, 'getMultipleAccountsInfo' | 'simulateTransaction' | 'confirmTransaction'>;
  fetchImpl?: Fetch;
  onStage?: (stage: Stage) => void;
  /** The SOL the wallet must hold for fees. Raised when another transaction follows the swap (see skr-send.ts). */
  minSolLamports?: number;
}

const microToSkr = (n: number) => (n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Converts SKR to USDC in the person's own wallet: quote, balance and fee checks, build, safety checks, simulation, sign, confirm.
 * Throws a SwapError (with a plain-language message) at the first problem, always before anything is signed unless it is the
 * confirmation itself that fails.
 */
export async function convertSkr(o: ConvertOptions): Promise<ConvertResult> {
  const stage = o.onStage ?? (() => {});
  stage('quote');
  const quote = await fetchQuote(o.mode, o.amountMicro, o.fetchImpl);
  if (quote.outMicro > SWAP.maxUsdcOutMicro) throw new SwapError('limit', `That’s more than the ${(SWAP.maxUsdcOutMicro / 1_000_000).toLocaleString('en-US')} USDC limit for one conversion. Convert a smaller amount.`);

  const before = await readSnapshot(o.connection, o.user);
  if (before.skrMicro < quote.maxInMicro) throw new SwapError('balance', `You have ${microToSkr(before.skrMicro)} SKR but this needs up to ${microToSkr(quote.maxInMicro)} SKR.`);
  const needSol = Math.max(SWAP.minSolLamports, o.minSolLamports ?? 0);
  if (before.lamports < needSol) throw new SwapError('fees', `You need a little SOL (about ${(needSol / 1e9).toFixed(3)}) in this wallet to pay the network fee${needSol > SWAP.minSolLamports ? 's' : ''}. Add some and try again.`);

  stage('prepare');
  const built = await fetchSwapTransaction(quote, o.user, o.fetchImpl);

  stage('check');
  const tx = checkSwapTransaction(built.transaction, o.user);
  const effect = await verifyBySimulation(o.connection, tx, o.user, before, quote);

  stage('sign');
  // If the wallet declines or can't send it, nothing has moved, and its own message is kept.
  const { signature } = await o.provider.request({ method: 'signAndSendTransaction', params: { transaction: tx, connection: o.connection } });
  if (!signature) throw new SwapError('send', 'The wallet didn’t return a transaction. Check your wallet before trying again.');

  stage('confirm');
  let outcome;
  try {
    outcome = await o.connection.confirmTransaction({ signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: built.lastValidBlockHeight }, 'confirmed');
  } catch {
    throw new SwapError('confirm', `Sent, but we couldn’t confirm it yet. Check your wallet before trying again (signature ${signature.slice(0, 8)}…).`);
  }
  if (outcome.value.err) throw new SwapError('confirm', 'The conversion failed on the network, so nothing changed. Try again.');
  return { signature, skrOutMicro: effect.skrOutMicro, usdcInMicro: effect.usdcInMicro };
}

// ── Paying with SKR ───────────────────────────────────────────────────────────

/**
 * Called by a USDC payment before it sends. If the wallet already has enough USDC (or the "use my SKR" setting is off) it does
 * nothing and returns null. Otherwise it converts just the shortfall from the person's SKR and returns what it did, so the
 * payment can carry on. If that can't be done it throws a SwapError whose message says why (and nothing has moved).
 */
export async function coverUsdcWithSkr(o: {
  enabled: boolean;
  user: string;
  balanceMicro: bigint | number;
  requiredMicro: bigint | number;
  provider: SwapSigner;
  connection: ConvertOptions['connection'];
  fetchImpl?: Fetch;
}): Promise<ConvertResult | null> {
  const short = usdcShortfall(o.balanceMicro, o.requiredMicro);
  if (!o.enabled || short <= 0) return null;
  return topUpUsdcFromSkr({ user: o.user, shortfallMicro: short, provider: o.provider, connection: o.connection, fetchImpl: o.fetchImpl });
}


/** How much USDC a payment is short by, or 0. */
export const usdcShortfall = (balanceMicro: bigint | number, requiredMicro: bigint | number): number => Math.max(0, Number(requiredMicro) - Number(balanceMicro));

/**
 * Converts just enough SKR to cover a USDC payment the wallet is short for (plus a cent of cushion). The USDC side is exact, so the
 * payment then goes through as normal.
 */
export async function topUpUsdcFromSkr(o: Omit<ConvertOptions, 'mode' | 'amountMicro'> & { shortfallMicro: number }): Promise<ConvertResult> {
  if (!(o.shortfallMicro > 0)) throw new SwapError('quote', 'Nothing to convert.');
  try {
    return await convertSkr({ ...o, mode: 'ExactOut', amountMicro: Math.ceil(o.shortfallMicro) + SWAP.cushionMicro });
  } catch (e) {
    if (e instanceof SwapError && e.code === 'balance') {
      throw new SwapError('balance', `You don’t have enough USDC, and not enough SKR to cover the difference. ${e.message}`);
    }
    throw e;
  }
}
