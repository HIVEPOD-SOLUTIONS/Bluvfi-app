import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { useChatSheet } from '@/lib/chat-context';
import {
  CONDUIT_CONTROLLER_ABI,
  DOMA_BRIDGE_URL,
  LISTING_CHAINS,
  SEAPORT_ABI,
  SEAPORT_ADDRESS,
  SEAPORT_CONDUIT_CONTROLLER,
  ZERO_BYTES32,
  domaChain,
  listingPayment,
  toAdvancedOrder,
  type DomaListingFulfillment,
} from '@/lib/doma-chain';
import { evmPublicClient, friendlyEvmError, payEvm, waitForEvmTx } from '@/lib/payments/evm-pay';

/**
 * Buy card for the assistant's doma_buy_listing tool — fills a Doma marketplace listing (a Seaport 1.6
 * order) from the user's own wallet:
 *   1. re-fetch the fulfillment for THIS wallet (Doma's zone signature is bound to the buyer and short-lived),
 *   2. check the token balance on the listing's chain,
 *   3. approve the payment token to Seaport (or the order's conduit) if needed,
 *   4. simulate, then send fulfillAdvancedOrder — the domain goes to the buyer.
 * Nothing is sent until the user taps Buy. Reports {paid, txHash} to the chat.
 */

type Output = {
  domaListingBuy: true;
  listing: {
    name: string;
    externalId: string;
    chainId: number;
    chainName: string;
    expiresAt?: string;
    symbol: string;
    decimals: number;
    priceDisplay: number;
  };
  payment: { token: Hex | 'native'; amount: string };
  buyer: string;
  paid?: boolean;
  txHash?: string;
  error?: string;
};

type State = 'idle' | 'preparing' | 'approving' | 'buying' | 'done' | 'error';

export function DomaListingCard({ toolCallId, output }: { toolCallId: string; output: Output }) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const { reportToolResult } = useChatSheet();
  const [state, setState] = useState<State>(output.paid === true ? 'done' : output.paid === false ? 'error' : 'idle');
  const [msg, setMsg] = useState<string | null>(output.paid === false ? output.error ?? "The purchase didn't go through." : null);
  const [txHash, setTxHash] = useState<string | undefined>(output.txHash);

  const { listing } = output;
  const chain = LISTING_CHAINS[listing.chainId];
  const price = `${listing.priceDisplay.toLocaleString(undefined, { maximumFractionDigits: listing.decimals > 6 ? 6 : 2 })} ${listing.symbol}`;
  const expired = listing.expiresAt ? new Date(listing.expiresAt).getTime() < Date.now() : false;
  const native = output.payment.token === 'native';

  const report = (result: Record<string, unknown>) =>
    reportToolResult({ tool: 'doma_buy_listing', toolCallId, output: { ...output, ...result } });

  const buy = async () => {
    setMsg(null);
    try {
      if (!chain) throw new Error("This listing is on a chain Bluvfi can't pay on.");
      const wallet = getEvmWallet();
      const buyer = wallet.address as Hex;
      if (buyer.toLowerCase() !== output.buyer.toLowerCase()) throw new Error('Your wallet changed. Ask the assistant to set up the purchase again.');

      // 1. Fresh fulfillment for this buyer.
      setState('preparing');
      let fulfillment: DomaListingFulfillment;
      try {
        const data = await call<{ result: DomaListingFulfillment }>('/api/doma/action', {
          method: 'POST',
          body: { action: 'getListingFulfillment', payload: { orderId: listing.externalId, buyer } },
        });
        fulfillment = data.result;
      } catch (e) {
        const m = (e as Error).message ?? '';
        throw new Error(/not found/i.test(m) ? 'This listing is no longer available — it may have just sold.' : m || "Couldn't load the listing.");
      }
      const { token, amount } = listingPayment(fulfillment);
      // Never pay more than the user was shown.
      if (amount > BigInt(output.payment.amount)) throw new Error('The price changed. Ask the assistant to check the listing again.');
      const isNative = token === 'native';

      // 2. Balances on the listing's chain.
      const pub = evmPublicClient(chain.id);
      const gas = await pub.getBalance({ address: buyer });
      const bal = isNative ? gas : await pub.readContract({ address: token as Hex, abi: erc20Abi, functionName: 'balanceOf', args: [buyer] });
      const bridge = chain.id === domaChain.id ? ` Bridge funds at ${DOMA_BRIDGE_URL}, then try again.` : ' Add funds, then try again.';
      if (bal < amount) throw new Error(`You need ${price} on ${chain.name}.${bridge}`);

      // 3. Approve the token to whoever Seaport pulls through: itself for a zero conduit key, else the order's conduit.
      if (!isNative) {
        let spender: Hex = SEAPORT_ADDRESS;
        const conduitKey = fulfillment.order.parameters.conduitKey;
        if (conduitKey && conduitKey !== ZERO_BYTES32) {
          const [conduit, exists] = await pub.readContract({
            address: SEAPORT_CONDUIT_CONTROLLER,
            abi: CONDUIT_CONTROLLER_ABI,
            functionName: 'getConduit',
            args: [conduitKey],
          });
          if (!exists) throw new Error('This listing uses an unknown conduit.');
          spender = conduit;
        }
        const allowance = await pub.readContract({ address: token as Hex, abi: erc20Abi, functionName: 'allowance', args: [buyer, spender] });
        if (allowance < amount) {
          setState('approving');
          const { hash: approveHash } = await payEvm({
            payment: { chainId: chain.id, to: token as Hex, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }) },
            wallet,
            label: 'doma-listing',
          });
          await waitForEvmTx(chain.id, approveHash);
        }
      }

      // 4. Simulate first so a stale or sold listing fails here, not on-chain.
      setState('buying');
      const order = toAdvancedOrder(fulfillment);
      await pub.simulateContract({
        account: buyer,
        address: SEAPORT_ADDRESS,
        abi: SEAPORT_ABI,
        functionName: 'fulfillAdvancedOrder',
        args: [order, [], ZERO_BYTES32, buyer],
        ...(isNative ? { value: amount } : {}),
      });
      const { hash } = await payEvm({
        payment: {
          chainId: chain.id,
          to: SEAPORT_ADDRESS,
          data: encodeFunctionData({ abi: SEAPORT_ABI, functionName: 'fulfillAdvancedOrder', args: [order, [], ZERO_BYTES32, buyer] }),
          ...(isNative ? { value: amount } : {}),
        },
        wallet,
        label: 'doma-listing',
      });
      await waitForEvmTx(chain.id, hash);
      setTxHash(hash);
      setState('done');
      report({ paid: true, txHash: hash });
    } catch (e) {
      const raw = (e as Error)?.message ?? 'Purchase failed.';
      let m = /OrderAlreadyFilled|0x1a515574|already filled/i.test(raw)
        ? 'Someone else bought this listing first. Nothing was charged.'
        : friendlyEvmError(e, chain?.name);
      if (/gas/i.test(m) && chain?.id === domaChain.id) m += ` Bridge a little ETH at ${DOMA_BRIDGE_URL}, then try again.`;
      setState('error');
      setMsg(m);
      report({ paid: false, error: m });
    }
  };

  const busy = state === 'preparing' || state === 'approving' || state === 'buying';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.icon}>
          <Text style={{ fontSize: 18 }}>🏷️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {listing.name}
          </Text>
          <Text style={styles.sub}>Doma marketplace · {listing.chainName}</Text>
        </View>
        <Text style={styles.amount}>{price}</Text>
      </View>

      {state === 'idle' &&
        (expired ? (
          <Text style={styles.warn}>This listing has expired. Ask the assistant to look for it again.</Text>
        ) : (
          <>
            <Text style={styles.tiny}>
              Paid from your wallet on {listing.chainName}
              {native ? '' : ' (approve, then buy)'}. The domain is sent to your wallet.
            </Text>
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="outline"
                  fullWidth
                  onPress={() => {
                    setState('error');
                    setMsg('Cancelled. Nothing was sent.');
                    report({ paid: false, error: 'Cancelled by user' });
                  }}
                >
                  Cancel
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" fullWidth onPress={buy}>
                  {`Buy for ${price}`}
                </Button>
              </View>
            </View>
          </>
        ))}

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={Colors.sage} />
          <Text style={styles.sub}>
            {state === 'preparing'
              ? 'Checking the listing and your balance…'
              : state === 'approving'
                ? `Approving ${listing.symbol} (1 of 2)…`
                : `Sending the purchase${native ? '' : ' (2 of 2)'}…`}
          </Text>
        </View>
      )}

      {state === 'done' && (
        <Text style={styles.value}>
          ✅ {listing.name} is yours.{' '}
          {txHash && chain?.blockExplorers ? (
            <Text style={styles.link} onPress={() => Linking.openURL(`${chain.blockExplorers!.default.url}/tx/${txHash}`)}>
              View transaction
            </Text>
          ) : null}
        </Text>
      )}

      {state === 'error' && msg ? <Text style={styles.error}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginVertical: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: { width: 40, height: 40, borderRadius: Radii.lg, backgroundColor: 'rgba(242,240,232,0.06)', alignItems: 'center', justifyContent: 'center' },
  title: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  tiny: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  amount: { ...Type.h3, fontFamily: Type.amount.fontFamily, color: Colors.tx0 },
  value: { ...Type.small, color: Colors.tx0 },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
  warn: { ...Type.small, color: Colors.amber },
  error: { ...Type.small, color: Colors.redAlert },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
