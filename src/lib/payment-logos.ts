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
  // Cryptorefills' other coins (each id checked against CoinMarketCap): Tron, Worldcoin, Dai, PayPal USD, First Digital USD, Ethena USDe, Euro Coin, World Liberty USD1, Sky USDS.
  ZEC: 1437, 'USDC.e': 3408, TRX: 1958, WLD: 13502, DAI: 4943, PYUSD: 27772, FDUSD: 26081, USDE: 29470, EUROC: 20641, USD1: 36148, USDS: 33039, GRAM: 11419,
};

const TOKEN_COLOR: Readonly<Record<string, string>> = {
  ZEC: '#F4B728', 'USDC.e': '#2775CA', USDC: '#2775CA', USDT: '#26A17B', ETH: '#627EEA', SOL: '#9945FF', BTC: '#F7931A', TON: '#0098EA', SUI: '#4DA2FF', BNB: '#F3BA2F', XRP: '#23292F',
  LTC: '#345D9D', DOGE: '#C2A633', DASH: '#008CE7', ARK: '#F70000', BRUSD: '#1F8A70', BRC: '#9945FF', KRAKEN: '#5741D9',
  TRX: '#EB0029', WLD: '#1F1F1F', DAI: '#F5AC37', PYUSD: '#0070E0', FDUSD: '#2D7DF6', USDE: '#2B2B2B', EUROC: '#2775CA', USD1: '#D4AF37', USDS: '#F5A623', GRAM: '#0098EA',
};

/** The DefiLlama icon name of each chain (some chains are served by their coin's logo instead, see CHAIN_LOGO). */
const CHAIN_LLAMA: Partial<Record<ChainKey, string>> = {
  ethereum: 'ethereum', base: 'base', polygon: 'polygon', arbitrum: 'arbitrum', optimism: 'optimism', bsc: 'binance', solana: 'solana', tron: 'tron', ton: 'ton',
  sui: 'sui', bitcoin: 'bitcoin', xrpl: 'xrpl', litecoin: 'litecoin', dogecoin: 'doge', tempo: 'tempo',
  avalanche: 'avalanche', plasma: 'plasma', soneium: 'soneium', celo: 'celo', sonic: 'sonic', hyperliquid: 'hyperliquid',
  // Circle's Arc (its arch "A") and Robinhood Chain (the feather); both checked against the chains' own sites.
  arc: 'arc', robinhood: 'robinhood',
};

const CHAIN_COLOR: Readonly<Record<ChainKey, string>> = {
  ethereum: '#627EEA', base: '#0052FF', polygon: '#8247E5', arbitrum: '#28A0F0', optimism: '#FF0420', bsc: '#F3BA2F', solana: '#9945FF', tron: '#EB0029', ton: '#0098EA',
  sui: '#4DA2FF', bitcoin: '#F7931A', lightning: '#F7931A', xrpl: '#23292F', litecoin: '#345D9D', dogecoin: '#C2A633', dash: '#008CE7', ark: '#F70000', tempo: '#2DD4BF',
  binance: '#F3BA2F', kraken: '#5741D9',
  avalanche: '#E84142', plasma: '#12B76A', soneium: '#1B1B1F', xlayer: '#111111', celo: '#FCFF52', sonic: '#FE9A3C', worldchain: '#1F1F1F',
  zcash: '#F4B728', hyperliquid: '#4AD0C0', arc: '#7B61FF', robinhood: '#9CC900',
};

/** Coins CoinMarketCap's CDN has no id for here, by their CoinGecko image: Startale USD (USDSC, on Soneium) and Mento Dollar (USDm, on Celo). */
const TOKEN_IMAGE: Readonly<Record<string, string>> = {
  USDSC: 'https://coin-images.coingecko.com/coins/images/70883/large/stataleusd_2x.png',
  USDM: 'https://coin-images.coingecko.com/coins/images/13161/large/USDm_%28Mento_Dollar%29.png',
};

export const tokenLogo = (token: string): LogoSpec => {
  const id = TOKEN_CMC_ID[token];
  const image = TOKEN_IMAGE[token.toUpperCase()];
  return { uris: id ? [cmc(id)] : image ? [image] : [], glyph: token.slice(0, 2), color: TOKEN_COLOR[token] ?? '#2A2B27' };
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
  if (chain === 'zcash') uris.push(cmc(TOKEN_CMC_ID.ZEC));
  return { uris, glyph: CHAIN_NAME[chain].slice(0, 1), color: CHAIN_COLOR[chain] };
};

/** The logo of a network named the way the wallet sheet names it ("Arc", "Base", "Solana"); null for one with no logo of its own (Linea). */
export const chainLogoByName = (name: string): LogoSpec | null => {
  const key = name.trim().toLowerCase();
  const id = CHAIN_ALIAS[key] ?? key;
  return id in CHAIN_COLOR ? chainLogo(id as ChainKey) : null;
};

/** Other ways the app names a network in its text (history rows, payment cards). */
const CHAIN_ALIAS: Readonly<Record<string, ChainKey>> = {
  evm: 'base', 'base (evm)': 'base', xrp: 'xrpl', 'xrp ledger': 'xrpl', 'robinhood chain': 'robinhood', bnb: 'bsc', 'bnb chain': 'bsc', 'binance smart chain': 'bsc',
};

/** The chain a coin lives on natively: its chain badge adds nothing when the method is on that chain. */
const NATIVE_CHAIN: Readonly<Record<string, ChainKey>> = {
  ETH: 'ethereum', SOL: 'solana', BTC: 'bitcoin', TON: 'ton', SUI: 'sui', BNB: 'bsc', XRP: 'xrpl', LTC: 'litecoin', DOGE: 'dogecoin', DASH: 'dash', ARK: 'ark', ZEC: 'zcash',
};

/**
 * The network a chip's second line should name: the chain when the coin isn't native to it and the chip's own label doesn't already say so
 * (ETH on Base, USDC on Arc, USDC.e on Tempo), else null. Without it three "ETH" chips and two "USDC" chips differ only by a small logo.
 */
export function methodNetworkName(method: PaymentMethod): string | null {
  if (NATIVE_CHAIN[method.token] === method.chain) return null;
  const name = CHAIN_NAME[method.chain];
  return method.label.toLowerCase().includes(name.toLowerCase()) ? null : name;
}

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
  const stable = method.group === 'USDC' || method.group === 'USDT' || method.group === 'BRUSD' || ['USDC', 'USDC.e', 'USDT', 'BRC'].includes(method.token);
  const native = NATIVE_CHAIN[method.token];
  const showBadge = method.group !== 'Exchange Pay' && method.chain !== 'lightning' && (stable || (native !== undefined && native !== method.chain));
  return { main, badge: showBadge ? chainLogo(method.chain) : null, bolt: method.chain === 'lightning' };
}
