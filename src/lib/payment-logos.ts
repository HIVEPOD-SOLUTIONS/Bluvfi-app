import { CHAIN_NAME, type ChainKey, type PaymentMethod } from '@/lib/payment-methods';

/**
 * The logo of every coin and chain the Bitrefill checkout offers. Coin logos come from CoinMarketCap's public logo CDN (the same source the
 * Crypto tab uses) and chain logos from DefiLlama's icon CDN. When an image can't load there is always a coloured circle with the symbol,
 * so a chip never shows a blank.
 */

export interface LogoSpec {
  /** Tried in order. */
  uris: string[];
  /** Shown when none loads. */
  glyph: string;
  /** The circle behind the glyph (the coin's brand colour). */
  color: string;
}

const cmc = (id: number) => `https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`;
const llama = (name: string) => `https://icons.llamao.fi/icons/chains/rsz_${name}.jpg`;

/** CoinMarketCap ids of the coins and tokens. */
export const TOKEN_CMC_ID: Readonly<Record<string, number>> = {
  USDC: 3408, USDT: 825, ETH: 1027, SOL: 5426, BTC: 1, TON: 11419, SUI: 20947, BNB: 1839, XRP: 52, LTC: 2, DOGE: 74, DASH: 131, ARK: 1586,
};

const TOKEN_COLOR: Readonly<Record<string, string>> = {
  USDC: '#2775CA', USDT: '#26A17B', ETH: '#627EEA', SOL: '#9945FF', BTC: '#F7931A', TON: '#0098EA', SUI: '#4DA2FF', BNB: '#F3BA2F', XRP: '#23292F',
  LTC: '#345D9D', DOGE: '#C2A633', DASH: '#008CE7', ARK: '#F70000', BRUSD: '#1F8A70', BRC: '#9945FF', KRAKEN: '#5741D9',
};

/** The DefiLlama icon name of each chain (some chains are served by their coin's logo instead, see CHAIN_LOGO). */
const CHAIN_LLAMA: Partial<Record<ChainKey, string>> = {
  ethereum: 'ethereum', base: 'base', polygon: 'polygon', arbitrum: 'arbitrum', optimism: 'optimism', bsc: 'binance', solana: 'solana', tron: 'tron', ton: 'ton',
  sui: 'sui', bitcoin: 'bitcoin', xrpl: 'xrpl', litecoin: 'litecoin', dogecoin: 'doge', tempo: 'tempo',
};

const CHAIN_COLOR: Readonly<Record<ChainKey, string>> = {
  ethereum: '#627EEA', base: '#0052FF', polygon: '#8247E5', arbitrum: '#28A0F0', optimism: '#FF0420', bsc: '#F3BA2F', solana: '#9945FF', tron: '#EB0029', ton: '#0098EA',
  sui: '#4DA2FF', bitcoin: '#F7931A', lightning: '#F7931A', xrpl: '#23292F', litecoin: '#345D9D', dogecoin: '#C2A633', dash: '#008CE7', ark: '#F70000', tempo: '#2DD4BF',
  binance: '#F3BA2F', kraken: '#5741D9',
};

export const tokenLogo = (token: string): LogoSpec => {
  const id = TOKEN_CMC_ID[token];
  return { uris: id ? [cmc(id)] : [], glyph: token.slice(0, 2), color: TOKEN_COLOR[token] ?? '#2A2B27' };
};

export const chainLogo = (chain: ChainKey): LogoSpec => {
  const uris: string[] = [];
  const llamaName = CHAIN_LLAMA[chain];
  if (llamaName) uris.push(llama(llamaName));
  // Chains with no icon of their own use their coin's logo.
  if (chain === 'lightning') uris.push(cmc(TOKEN_CMC_ID.BTC));
  if (chain === 'dash') uris.push(cmc(TOKEN_CMC_ID.DASH));
  if (chain === 'ark') uris.push(cmc(TOKEN_CMC_ID.ARK));
  if (chain === 'binance') uris.push(cmc(TOKEN_CMC_ID.BNB));
  return { uris, glyph: CHAIN_NAME[chain].slice(0, 1), color: CHAIN_COLOR[chain] };
};

/** The chain a coin lives on natively: its chain badge adds nothing when the method is on that chain. */
const NATIVE_CHAIN: Readonly<Record<string, ChainKey>> = {
  ETH: 'ethereum', SOL: 'solana', BTC: 'bitcoin', TON: 'ton', SUI: 'sui', BNB: 'bsc', XRP: 'xrpl', LTC: 'litecoin', DOGE: 'dogecoin', DASH: 'dash', ARK: 'ark',
};

export interface MethodLogos {
  main: LogoSpec;
  /** A small second logo at the corner: the chain a stablecoin is on, or the chain of an ETH or USDC that isn't on its own chain. */
  badge: LogoSpec | null;
  /** Lightning is Bitcoin with a bolt. */
  bolt: boolean;
}

/**
 * What to draw for a payment method: the token's logo, with its chain's logo in the corner when the token is on a chain other than its own
 * (USDC on Base, ETH on Arbitrum). Native coins (Bitcoin, Litecoin, XRP…) are just their own logo.
 */
export function methodLogos(method: PaymentMethod): MethodLogos {
  const main = method.group === 'Exchange Pay' ? chainLogo(method.chain) : tokenLogo(method.token);
  const stable = method.group === 'USDC' || method.group === 'USDT' || method.group === 'BRUSD' || ['USDC', 'USDT', 'BRC'].includes(method.token);
  const native = NATIVE_CHAIN[method.token];
  const showBadge = method.group !== 'Exchange Pay' && method.chain !== 'lightning' && (stable || (native !== undefined && native !== method.chain));
  return { main, badge: showBadge ? chainLogo(method.chain) : null, bolt: method.chain === 'lightning' };
}
