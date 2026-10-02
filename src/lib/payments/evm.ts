import { encodeFunctionData, parseUnits } from 'viem';

/**
 * Direct ERC-20 transfer via Privy's embedded-wallet EIP-1193 provider
 * (`provider.request({ method: 'eth_sendTransaction', ... })`).
 *
 * Mirrors bluvfi web's `pay-bill-confirm-card.tsx` / `payment-modal.tsx`
 * payment constants exactly (same USDC contract, same receiver), but skips
 * Circle's Arc SDK (`@circle-fin/adapter-viem-v2` + `arc-kit`) in favor of a
 * plain `eth_sendTransaction` call — avoids pulling in a web-oriented SDK of
 * uncertain React Native compatibility for what is, underneath, one ERC-20
 * `transfer()` call. Functionally equivalent end state (same contract call).
 */

export const BASE_USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const EVM_BILL_RECEIVER = '0x9404966338eB27aF420a952574d777598Bbb58c4' as const;

const TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

/** Sends `amount` USDC (Base mainnet) from `fromAddress` to `to`. Returns the tx hash. */
export async function sendUsdcEvm(
  provider: Eip1193Provider,
  fromAddress: string,
  to: string,
  amount: number,
): Promise<string> {
  const data = encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: 'transfer',
    args: [to as `0x${string}`, parseUnits(amount.toFixed(6), 6)],
  });

  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from: fromAddress, to: BASE_USDC_CONTRACT, data }],
  });

  return hash as string;
}
