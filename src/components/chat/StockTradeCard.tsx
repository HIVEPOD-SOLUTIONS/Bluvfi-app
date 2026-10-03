import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { StockLogo } from '@/components/invest/StockLogo';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import type { StockOrder, StockQuote, StocksPortfolio } from '@/hooks/use-stocks';
import { useAuth } from '@/lib/auth-context';
import { useChatSheet } from '@/lib/chat-context';
import {
  executeStockTrade,
  fetchStockQuote,
  friendlyTradeError,
  orderFailureMessage,
  walletShare,
  watchStockOrder,
  type TradeStep,
} from '@/lib/stocks-client';

/**
 * Confirm card for the assistant's trade_stock tool — the same trade as Invest → Stocks. Nothing happens
 * until the user taps Confirm; then it refreshes the price, pays from the wallet (buys), places the order and
 * reports {done, …} back to the chat. Once reported, a re-render shows the result instead of offering to
 * trade again.
 */

type Output = {
  pendingStockTrade: true;
  ticker: string;
  name: string;
  side: 'buy' | 'sell';
  quote: StockQuote;
  // Set after the card reports back:
  done?: boolean;
  orderId?: string;
  status?: string;
  fillPrice?: string | null;
  fillQuantity?: string | null;
  error?: string;
};

type State = 'idle' | 'refreshing' | TradeStep | 'done' | 'error';

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StockTradeCard({ toolCallId, output }: { toolCallId: string; output: Output }) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const { reportToolResult } = useChatSheet();
  const queryClient = useQueryClient();
  const [quote, setQuote] = useState<StockQuote>(output.quote);
  const [credit, setCredit] = useState(0);
  const [state, setState] = useState<State>(output.done === true ? 'done' : output.done === false ? 'error' : 'idle');
  const [msg, setMsg] = useState<string | null>(output.done === false ? output.error ?? "The trade didn't go through." : null);
  const [order, setOrder] = useState<Pick<StockOrder, 'status' | 'fillPrice' | 'fillQuantity'> | null>(
    output.done ? { status: output.status ?? 'pending', fillPrice: output.fillPrice, fillQuantity: output.fillQuantity } : null,
  );
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const report = (result: Record<string, unknown>) =>
    reportToolResult({ tool: 'trade_stock', toolCallId, output: { ...output, ...result } });
  const refreshPortfolio = () => {
    queryClient.invalidateQueries({ queryKey: ['stocks-portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  // Any leftover credit is used first, so the wallet only pays the rest.
  useEffect(() => {
    if (output.done !== undefined || output.side !== 'buy') return;
    call<StocksPortfolio>('/api/stocks/portfolio')
      .then((d) => {
        if (alive.current) setCredit(Number(d.cashUsd) || 0);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output.done, output.side]);

  // Reported as still settling in an earlier render: keep watching it.
  useEffect(() => {
    if (!output.done || output.status !== 'pending' || !output.orderId) return;
    watchStockOrder({ id: output.orderId, status: 'pending' }, call, () => alive.current).then((o) => {
      if (alive.current) setOrder(o);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output.done, output.status, output.orderId]);

  const confirm = async () => {
    setMsg(null);
    try {
      // Prices move — re-quote the same size right before paying.
      setState('refreshing');
      const { quote: fresh } = await fetchStockQuote(call, quote.asset, quote.side, quote.quantity);
      setQuote(fresh);

      const result = await executeStockTrade({
        quote: fresh,
        creditUsd: credit,
        wallet: getEvmWallet(),
        call,
        onStep: setState,
        isAlive: () => alive.current,
      });
      setOrder(result);
      refreshPortfolio();
      if (result.status === 'filled' || result.status === 'pending') {
        setState('done');
        report({ done: true, orderId: result.id, status: result.status, fillPrice: result.fillPrice, fillQuantity: result.fillQuantity });
      } else {
        const m = orderFailureMessage(result, fresh.side);
        setState('error');
        setMsg(m);
        report({ done: false, error: m });
      }
    } catch (e) {
      const m = friendlyTradeError(e);
      setState('error');
      setMsg(m);
      refreshPortfolio();
      report({ done: false, error: m });
    }
  };

  const busy = state === 'refreshing' || state === 'funding' || state === 'placing' || state === 'pending';
  const fromWallet = walletShare(quote, credit);
  const buying = output.side === 'buy';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <StockLogo ticker={output.ticker} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {buying ? 'Buy' : 'Sell'} {Number(quote.quantity)} {output.ticker}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {output.name} · Backpack
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.total}>{usd(Number(quote.estimateUsdc))}</Text>
          <Text style={styles.tiny}>{buying ? 'max, incl. fee' : 'min to wallet'}</Text>
        </View>
      </View>

      {state === 'idle' && (
        <>
          <View style={{ gap: 4 }}>
            {(
              [
                ['Market price', usd(quote.marketPrice)],
                [buying ? 'Max per share' : 'Min per share', usd(Number(quote.limitPrice))],
                ['Bluvfi fee (est.)', usd(Number(quote.feeUsdc))],
                ...(buying ? [['From your wallet', `${usd(fromWallet)} USDC`]] : [['Paid to', 'Your wallet (USDC)']]),
              ] as [string, string][]
            ).map(([k, v]) => (
              <View key={k} style={styles.kv}>
                <Text style={styles.sub}>{k}</Text>
                <Text style={styles.value}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button
                variant="outline"
                fullWidth
                onPress={() => {
                  setState('error');
                  setMsg('Cancelled. Nothing was traded.');
                  report({ done: false, error: 'Cancelled by user' });
                }}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" fullWidth onPress={confirm}>
                {`Confirm ${output.side}`}
              </Button>
            </View>
          </View>
        </>
      )}

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={Colors.sage} />
          <Text style={styles.sub}>
            {state === 'refreshing'
              ? 'Checking the latest price…'
              : state === 'funding'
                ? `Sending ${usd(fromWallet)} USDC from your wallet…`
                : state === 'placing'
                  ? 'Sending your order…'
                  : 'Getting the best price…'}
          </Text>
        </View>
      )}

      {state === 'done' && order && (
        <Text style={styles.value}>
          {order.status === 'filled'
            ? `✅ ${buying ? 'Bought' : 'Sold'} ${Number(order.fillQuantity)} ${output.ticker} at ${usd(Number(order.fillPrice))}${
                buying ? '.' : ' — money on its way to your wallet.'
              }`
            : '⏳ Order accepted — settling. Your holdings update in a few minutes.'}
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
  title: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  tiny: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  total: { ...Type.h3, fontFamily: Type.amount.fontFamily, color: Colors.tx0 },
  kv: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { ...Type.small, color: Colors.tx0 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  error: { ...Type.small, color: Colors.redAlert },
});
