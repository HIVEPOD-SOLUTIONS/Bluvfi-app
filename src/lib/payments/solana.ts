import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { announceAutoConversion, skrPayEnabled } from '@/lib/skr-pay';
import { coverUsdcWithSkr, SwapError, type SwapSigner } from '@/lib/skr-swap';

/** Mirrors bluvfi web's `pay-bill-confirm-card.tsx` Solana payment path exactly. */
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** bluvfi web's bill-pay receiver — unset there too, so bill pay stays a no-op on Solana until configured. */
export const SOLANA_BILL_RECEIVER = process.env.EXPO_PUBLIC_SOLANA_BILL_RECEIVER ?? '';

interface SolanaProvider {
  request: (args: {
    method: 'signAndSendTransaction';
    params: { transaction: Transaction; connection: Connection };
  }) => Promise<{ signature: string }>;
}

/** Sends `amount` USDC (SPL) from `fromAddress` to `toAddress`. Returns the signature. */
export async function sendUsdcSolana(
  provider: SolanaProvider,
  fromAddress: string,
  toAddress: string,
  amount: number,
): Promise<string> {
  if (!toAddress) throw new Error('No receiving address configured');

  const alchemyKey = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '';
  const connection = new Connection(`https://solana-mainnet.g.alchemy.com/v2/${alchemyKey}`, 'confirmed');

  const mint = new PublicKey(SOLANA_USDC_MINT);
  const sender = new PublicKey(fromAddress);
  const receiver = new PublicKey(toAddress);

  const senderAta = await getAssociatedTokenAddress(mint, sender);
  let senderAccount = await getAccount(connection, senderAta).catch(() => null);
  const requiredMicro = BigInt(Math.round(amount * 1_000_000));
  // Short on USDC but holding SKR, with "use my SKR" on: convert just the missing amount first, then pay as normal.
  if ((senderAccount?.amount ?? 0n) < requiredMicro && skrPayEnabled()) {
    try {
      const converted = await coverUsdcWithSkr({
        enabled: true,
        user: fromAddress,
        balanceMicro: senderAccount?.amount ?? 0n,
        requiredMicro,
        provider: provider as unknown as SwapSigner,
        connection,
      });
      if (converted) {
        announceAutoConversion(converted);
        senderAccount = await getAccount(connection, senderAta).catch(() => null);
      }
    } catch (e) {
      if (e instanceof SwapError) throw new Error(`Couldn’t convert your SKR to cover this payment. ${e.message}`);
      throw e;
    }
  }
  if (!senderAccount || senderAccount.amount < requiredMicro) {
    const bal = senderAccount ? (Number(senderAccount.amount) / 1_000_000).toFixed(2) : '0.00';
    throw new Error(`Insufficient USDC balance on Solana. You have $${bal} but need $${amount.toFixed(2)}.`);
  }

  const receiverAta = await getAssociatedTokenAddress(mint, receiver);
  const { blockhash } = await connection.getLatestBlockhash();
  const transaction = new Transaction({ recentBlockhash: blockhash, feePayer: sender }).add(
    createTransferInstruction(senderAta, receiverAta, sender, requiredMicro, [], TOKEN_PROGRAM_ID),
  );

  const { signature } = await provider.request({
    method: 'signAndSendTransaction',
    params: { transaction, connection },
  });
  return signature;
}
