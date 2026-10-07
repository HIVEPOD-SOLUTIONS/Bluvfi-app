/**
 * "Convert and send to my Bluvfi wallet": after the Seeker (connected) wallet has turned SKR into USDC, the USDC it received is
 * sent on to the person's Bluvfi wallet, so it can be spent from there. It is a second approval in their wallet, and a separate
 * step on purpose: if it fails or is declined the conversion has already happened, the USDC is safe in the wallet that converted it,
 * and the step can simply be tried again. Pure, with the wallet calls passed in, so it can be tested.
 */

/** The smallest amount worth sending (a cent): below this the network fee would be silly. */
export const MIN_SEND_MICRO = 10_000;

/** Extra SOL to keep in the converting wallet when it will also send: the transfer's fee, and rent if the Bluvfi wallet has no USDC account yet. */
export const SEND_SOL_RESERVE_LAMPORTS = 3_000_000;

/**
 * How much to send on: what the conversion produced, but never more than the wallet actually holds right now (a price move can leave
 * it a hair under the simulated figure), and never USDC that was already in the wallet before. Null balance (couldn't be read) trusts the
 * conversion's own figure. Returns 0 when it's not worth sending.
 */
export function amountToSend(convertedMicro: number, balanceMicro: number | null): number {
  const amount = balanceMicro === null ? convertedMicro : Math.min(convertedMicro, balanceMicro);
  return Number.isSafeInteger(amount) && amount >= MIN_SEND_MICRO ? amount : 0;
}

/** "1.652250": the decimal string the wallet sender takes, exact (no floating-point rounding up). */
export const usdcDecimal = (micro: number): string => `${Math.floor(micro / 1_000_000)}.${String(micro % 1_000_000).padStart(6, '0')}`;

export type SendOutcome =
  | { status: 'sent'; signature: string; amountMicro: number }
  | { status: 'too_small'; amountMicro: number }
  | { status: 'failed'; error: string; amountMicro: number };

/** Sends the converted USDC on. Never throws: the conversion is already done, so a problem here is reported, not raised. */
export async function sendConvertedUsdc(o: {
  convertedMicro: number;
  readBalance: () => Promise<number | null>;
  send: (amountDecimal: string) => Promise<string>;
}): Promise<SendOutcome> {
  const balance = await o.readBalance().catch(() => null);
  const amount = amountToSend(o.convertedMicro, balance);
  if (amount === 0) return { status: 'too_small', amountMicro: o.convertedMicro };
  try {
    const signature = await o.send(usdcDecimal(amount));
    return { status: 'sent', signature, amountMicro: amount };
  } catch (e) {
    return { status: 'failed', error: (e as Error)?.message ?? 'Couldn’t send it.', amountMicro: amount };
  }
}
