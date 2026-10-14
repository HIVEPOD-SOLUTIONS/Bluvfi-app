import { chainLogo, tokenLogo, type LogoSpec } from '@/lib/payment-logos';
import type { ChainKey } from '@/lib/payment-methods';

/**
 * Logos for the coins and networks Cryptorefills accepts ("pay with another coin"), from the names its payment-methods API uses. Bridged
 * tokens (USDC.e, USDT.e) show their base coin's logo. A network named plainly "Mainnet" is the coin's own chain (Bitcoin, Litecoin, Dogecoin, Ethereum).
 */

const COIN_ALIAS: Readonly<Record<string, string>> = { 'USDC.E': 'USDC', 'USDT.E': 'USDT' };

export function crTokenLogo(coin: string): LogoSpec {
  const key = coin.trim().toUpperCase();
  return tokenLogo(COIN_ALIAS[key] ?? key);
}

const NETWORK_CHAIN: Readonly<Record<string, ChainKey>> = {
  'eth mainnet': 'ethereum', ethereum: 'ethereum', 'polygon (matic)': 'polygon', polygon: 'polygon', avalanche: 'avalanche', arbitrum: 'arbitrum', optimism: 'optimism',
  'binance smart chain': 'bsc', bsc: 'bsc', plasma: 'plasma', soneium: 'soneium', 'x layer': 'xlayer', celo: 'celo', tron: 'tron', solana: 'solana', ton: 'ton',
  lightning: 'lightning', base: 'base', sonic: 'sonic', sui: 'sui', worldchain: 'worldchain', 'world chain': 'worldchain',
};

/** A plain "Mainnet" belongs to whichever coin it is for. */
const COIN_NATIVE_CHAIN: Readonly<Record<string, ChainKey>> = { BTC: 'bitcoin', LTC: 'litecoin', DOGE: 'dogecoin', ETH: 'ethereum' };

/** The chain a Cryptorefills network name means, or null when it isn't one we have a logo for. */
export function crChainKey(network: string, coin: string): ChainKey | null {
  const n = network.trim().toLowerCase();
  if (n === 'mainnet') return COIN_NATIVE_CHAIN[coin.trim().toUpperCase()] ?? null;
  return NETWORK_CHAIN[n] ?? null;
}

/** The logo for a network. A network we don't know still gets its first letter on a neutral circle. */
export function crChainLogo(network: string, coin: string): LogoSpec {
  const key = crChainKey(network, coin);
  if (key) return chainLogo(key);
  return { uris: [], glyph: network.trim().slice(0, 1).toUpperCase() || '?', color: '#3A3B36' };
}
