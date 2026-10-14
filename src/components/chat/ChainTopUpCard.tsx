import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChainTopUpPanel } from '@/components/dashboard/ChainTopUpPanel';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useChatSheet } from '@/lib/chat-context';
import { SWAP_CHAIN_META, isSwapChain, type SwapChain } from '@/lib/swap-chains';

/**
 * Confirm card for the assistant's fund_wallet_from_chain tool: puts USDC (or ETH) into the Bluvfi wallet on Base from Arc, Tempo, Robinhood
 * Chain, Zcash or Hyperliquid. Nothing moves until the person acts in the panel. Reports {funded: true} back to the chat. Mirrors the website's
 * chain-topup-card.tsx.
 */
type Output = {
  chainTopUp: true;
  chain?: SwapChain;
  token: 'usdc' | 'eth';
  amount: string;
  amountUsd: number;
  refundAddress?: string;
  funded?: boolean;
};

export function ChainTopUpCard({ toolCallId, output }: { toolCallId: string; output: Output }) {
  const { reportToolResult } = useChatSheet();
  const [funded, setFunded] = useState(output.funded === true);
  const symbol = output.token === 'eth' ? 'ETH' : 'USDC';
  if (funded) {
    return (
      <View style={styles.ok}>
        <Text style={styles.okText}>
          ✓ {output.amount} {symbol} is in your Bluvfi wallet on Base.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ marginVertical: 4 }}>
      <ChainTopUpPanel
        inChat
        token={output.token}
        amount={output.amount}
        amountUsd={output.amountUsd}
        purpose="wallet"
        initialChain={isSwapChain(output.chain) ? output.chain : undefined}
        initialRefundAddress={output.refundAddress}
        title={`Add ${output.amount} ${symbol} to your wallet on Base`}
        onFunded={() => {
          setFunded(true);
          reportToolResult({
            tool: 'fund_wallet_from_chain',
            toolCallId,
            output: {
              ...output,
              funded: true,
              tip: `Done: ${output.amount} ${symbol} arrived in the user's Bluvfi wallet on Base${output.chain ? ` (paid from ${SWAP_CHAIN_META[output.chain].label})` : ''}. Continue with what they wanted next.`,
            },
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ok: { backgroundColor: 'rgba(143,174,130,0.1)', borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.borderSage, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginVertical: 4 },
  okText: { ...Type.small, color: Colors.sage },
});
