import { EVM_TOKENS, payEvmTransfer, type EvmWallet } from '@/lib/payments/evm-pay';

/**
 * Pays a Bitrefill invoice from the user's embedded wallet, as bluvfi web's chat "Confirm Payment" card does:
 * an ERC-20 transfer on the invoice's network through the shared layers in evm-pay.ts, or an SPL token
 * transfer on Solana. Throws on failure; `friendlyBitrefillError` turns the error into the sentence shown.
 */

const SOLANA_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '';

/** Methods Bitrefill is paid for outside the wallet: the user sends manually to the deposit address. */
export function isManualMethod(pm: string): boolean {
  return pm === 'xrp' || pm === 'usdt_bsc';
}

export const EVM_NETWORK_LABEL: Record<string, string> = {
  usdc_base: 'Base', usdt_base: 'Base',
  usdc_erc20: 'Ethereum', usdt_erc20: 'Ethereum',
  usdc_polygon: 'Polygon', usdt_polygon: 'Polygon',
  usdc_arbitrum: 'Arbitrum', usdt_arbitrum: 'Arbitrum',
  usdc_optimism: 'Optimism', usdt_optimism: 'Optimism',
  usdt_bsc: 'BSC (BEP-20)',
};

export interface BitrefillPayInput {
  paymentMethod: string;
  paymentAddress: string;
  paymentAmount: number | string;
  wallet: () => EvmWallet;
  getSolanaProvider: () => Promise<any>;
  solanaAddress?: string;
}

export async function payBitrefillInvoice(input: BitrefillPayInput): Promise<void> {
  const { paymentMethod: pm, paymentAddress, paymentAmount } = input;
  if (!paymentAddress) throw new Error('No payment address was returned for this invoice.');
  if (pm.includes('solana')) return paySolana(input);
  return payEvm(input);
}

async function paySolana({ paymentMethod: pm, paymentAddress, paymentAmount, getSolanaProvider, solanaAddress }: BitrefillPayInput) {
  if (!solanaAddress) throw new Error('No Solana wallet connected');
  const { Connection, PublicKey, Transaction } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const { createTransferInstruction, getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token') as typeof import('@solana/spl-token');

  const connection = new Connection(`https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, 'confirmed');
  const token = pm.includes('usdt') ? 'USDT' : 'USDC';
  const mint = new PublicKey(SOLANA_MINTS[token]);
  const sender = new PublicKey(solanaAddress);
  const receiver = new PublicKey(paymentAddress);

  // Pre-flight: the sender needs a token account with enough balance.
  const senderAta = await getAssociatedTokenAddress(mint, sender);
  const senderAccount = await getAccount(connection, senderAta).catch(() => null);
  if (!senderAccount) throw new Error(`Insufficient ${token} balance on Solana. Please add funds and try again.`);
  const requiredMicro = BigInt(Math.round(Number(paymentAmount) * 1_000_000));
  if (senderAccount.amount < requiredMicro) {
    const bal = (Number(senderAccount.amount) / 1_000_000).toFixed(2);
    throw new Error(`Insufficient ${token} on Solana. You have $${bal} but need $${Number(paymentAmount).toFixed(2)}.`);
  }

  // Bitrefill maintains its token accounts, so the receiver ATA needs no creation.
  const receiverAta = await getAssociatedTokenAddress(mint, receiver);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const transaction = new Transaction({ recentBlockhash: blockhash, feePayer: sender }).add(
    createTransferInstruction(senderAta, receiverAta, sender, requiredMicro, [], TOKEN_PROGRAM_ID),
  );

  const provider = await getSolanaProvider();
  const { signature } = await provider.request({ method: 'signAndSendTransaction', params: { transaction, connection } });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
}

async function payEvm({ paymentMethod: pm, paymentAddress, paymentAmount, wallet }: BitrefillPayInput) {
  const token = EVM_TOKENS[pm];
  if (!token) throw new Error(`Paying with ${pm} isn't supported from the wallet.`);
  await payEvmTransfer({
    chainId: token.chainId,
    token: token.contract,
    symbol: token.symbol,
    decimals: 6,
    recipient: paymentAddress as `0x${string}`,
    amount: String(paymentAmount),
    wallet: wallet(),
    label: 'chat/bitrefill',
  });
}

/** Turns a raw wallet/RPC error into the one-line message shown on the payment card. */
export function friendlyBitrefillError(err: unknown, pm: string): string {
  const msg = (err as Error)?.message ?? 'Payment failed';
  const m = msg.toLowerCase();
  const network =
    pm.includes('erc20') ? 'Ethereum'
    : pm.includes('polygon') ? 'Polygon'
    : pm.includes('arbitrum') ? 'Arbitrum'
    : pm.includes('optimism') ? 'Optimism'
    : pm.includes('base') ? 'Base'
    : pm.includes('solana') ? 'Solana'
    : 'this network';
  const token = pm.includes('usdt') ? 'USDT' : 'USDC';

  if (m.includes('cancel') || m.includes('reject') || m.includes('denied')) return 'Payment cancelled.';
  if (m.includes('not supported on') || m.includes('is not supported'))
    return 'This payment method is temporarily unavailable. Please try again or use a different network.';
  if (m.includes("validation failed for 'tokenaddress'") || m.includes('failed to fetch decimals') || (m.includes('http request failed') && network !== 'this network'))
    return `Network RPC error on ${network}. Please wait a moment and try again.`;
  if (m.includes('streamable http error') || m.includes('bad gateway') || m.includes('<!doctype html'))
    return 'Bitrefill is temporarily unavailable. Please try again in a few minutes.';
  if (m.includes('rate_limit') || m.includes('rate limit') || m.includes('quota'))
    return 'Bitrefill rate limit reached. Please wait a moment and try again.';
  if (m.includes('invalidfeopcode') || m.includes('invalid opcode') || m.includes('fe opcode'))
    return `Insufficient ${token} balance on ${network}. Please add funds and try again.`;
  if (m.includes('estimategas') || m.includes('insufficient funds for gas') || m.includes('insufficient funds for transfer') || m.includes('to pay gas')) {
    const gas = pm.includes('polygon') ? 'POL' : pm.includes('solana') ? 'SOL' : 'ETH';
    return `You need ${gas} for gas fees and ${token} to send on ${network}. Please add both to your wallet and try again.`;
  }
  if ((m.includes('insufficient') || m.includes('not enough')) && m.includes('solana')) return msg;
  if (m.includes('insufficient') || m.includes('not enough')) return 'Insufficient balance. Please add funds and try again.';
  if (m.includes('internal_error') || m.includes('failed to process purchase') || m.includes('token account not found') || m.includes('sender token account'))
    return `Insufficient ${token} balance on ${network}. Please add funds and try again.`;
  return msg.split('\n')[0];
}
