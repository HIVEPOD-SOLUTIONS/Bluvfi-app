/** Whole micro-USDC (1 USDC = 1,000,000) as "$0.05": at least two decimals, never more than six, no float noise. */
export function microToUsd(micro: number): string {
  const n = Math.round(micro);
  const whole = Math.trunc(n / 1_000_000);
  const frac = String(Math.abs(n) % 1_000_000).padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${n < 0 ? '-' : ''}$${Math.abs(whole).toLocaleString('en-US')}.${frac}`;
}

/** A provider's price per call as dollars: "0.1" -> "$0.10", "0.005" -> "$0.005". */
export const priceUsd = (price: string): string => microToUsd(Math.round(Number(price) * 1_000_000));
