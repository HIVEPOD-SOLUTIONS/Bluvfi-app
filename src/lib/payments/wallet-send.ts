import { parseUnits, type Hex } from 'viem';
import { payEvmTransfer, type EvmWallet } from '@/lib/payments/evm-pay';

/**
 * Pays a deposit address straight from the user's Bluvfi wallet — for providers that hand back "send X COIN
 * on NETWORK to ADDRESS" (Cryptorefills' other-crypto checkout, Bitrefill's ETH/SOL methods). Covers what
 * Bluvfi wallets hold: USDC/USDT/ETH on the EVM chains, and USDC/USDT/SOL on Solana. Mirrors bluvfi web's
 * `lib/wallet-send.ts`.
 *
 * EVM sends go through the shared layers in evm-pay.ts; Solana sends are signed by the embedded Solana wallet
 * (tiny SOL fee).
 */

const EVM_CHAINS: Record<string, number> = {
  'ETH Mainnet': 1,
  Mainnet: 1, // Cryptorefills' name for ETH on Ethereum
  Base: 8453,
  'Polygon (Matic)': 137,
  Arbitrum: 42161,
  Optimism: 10,
};

const EVM_TOKENS: Record<number, Record<string, Hex>> = {
  1: { USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  8453: { USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' },
  137: { USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
  42161: { USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
  10: { USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' },
};

// ETH is native on all of these except Polygon (POL).
const EVM_NATIVE_ETH = new Set([1, 8453, 42161, 10]);

const SOLANA_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

export type WalletRail = { kind: 'evm'; chainId: number; token: Hex | 'native' } | { kind: 'solana'; mint: string | 'native' };

/** How the Bluvfi wallet can pay `coin` on `network`, or null if it can't. */
export function walletRailFor(coin: string, network: string): WalletRail | null {
  if (network === 'Solana') {
    if (coin === 'SOL') return { kind: 'solana', mint: 'native' };
    return SOLANA_MINTS[coin] ? { kind: 'solana', mint: SOLANA_MINTS[coin] } : null;
  }
  const chainId = EVM_CHAINS[network];
  if (!chainId) return null;
  if (coin === 'ETH') return EVM_NATIVE_ETH.has(chainId) ? { kind: 'evm', chainId, token: 'native' } : null;
  const token = EVM_TOKENS[chainId]?.[coin];
  return token ? { kind: 'evm', chainId, token } : null;
}

/** Sends exactly `amount` (a decimal string in coin units) and returns the tx hash / signature. */
export async function sendFromWallet(opts: {
  rail: WalletRail;
  coin: string;
  to: string;
  amount: string;
  evmWallet?: () => EvmWallet;
  solana?: { address: string; getProvider: () => Promise<any> };
}): Promise<string> {
  const { rail, coin, to, amount, evmWallet, solana } = opts;

  if (rail.kind === 'evm') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error("That deposit address isn't an EVM address.");
    if (!evmWallet) throw new Error('No wallet connected.');
    const { hash } = await payEvmTransfer({
      chainId: rail.chainId,
      token: rail.token,
      symbol: coin,
      decimals: rail.token === 'native' ? 18 : 6,
      recipient: to as Hex,
      amount,
      wallet: evmWallet(),
      label: 'wallet-send',
    });
    return hash;
  }

  if (!solana) throw new Error('No Solana wallet connected.');
  const { Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const conn = new Connection(`https://solana-mainnet.g.alchemy.com/v2/${process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? ''}`, 'confirmed');
  const from = new PublicKey(solana.address);
  const dest = new PublicKey(to);
  const tx = new Transaction();
  if (rail.mint === 'native') {
    tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: dest, lamports: BigInt(parseUnits(amount, 9)) }));
  } else {
    const { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddress } = require('@solana/spl-token') as typeof import('@solana/spl-token');
    const mint = new PublicKey(rail.mint);
    const fromAta = await getAssociatedTokenAddress(mint, from);
    const destAta = await getAssociatedTokenAddress(mint, dest, true);
    // Deposit addresses are usually fresh wallets with no token account yet.
    tx.add(createAssociatedTokenAccountIdempotentInstruction(from, destAta, dest, mint));
    tx.add(createTransferCheckedInstruction(fromAta, mint, destAta, from, BigInt(parseUnits(amount, 6)), 6));
  }
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;
  const provider = await solana.getProvider();
  const { signature } = await provider.request({ method: 'signAndSendTransaction', params: { transaction: tx, connection: conn } });
  await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}
