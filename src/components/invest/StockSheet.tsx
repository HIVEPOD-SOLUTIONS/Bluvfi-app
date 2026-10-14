import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { MoreChainsLink } from '@/components/dashboard/PaymentMethodPicker';
import { useApiClient } from '@/hooks/use-api';
import type { StockOrder, StockQuote, StockRow, StocksPortfolio } from '@/hooks/use-stocks';
import { useAuth } from '@/lib/auth-context';
import { executeStockTrade, fetchStockQuote, friendlyTradeError, orderFailureMessage, walletShare } from '@/lib/stocks-client';
import { ChainTopUpPanel } from '@/components/dashboard/ChainTopUpPanel';
import { PriceChart } from './PriceChart';
import { StockLogo } from './StockLogo';

const usd = (n: number, dp = 2) => `$${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const pct = (n: number | null) => (n === null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);

type Step = 'form' | 'review' | 'funding' | 'placing' | 'pending' | 'done' | 'error';

interface StockSheetProps {
  stock: StockRow | null;
  portfolio: StocksPortfolio | undefined;
  enabled: boolean;
  onClose: () => void;
}

/** Buy or sell one stock: quote, then (for buys) fund from the wallet, place the order and wait for the fill. */
export function StockSheet({ stock, portfolio, enabled, onClose }: StockSheetProps) {
  return (
    <BottomSheet
      open={!!stock}
      onClose={onClose}
      title={stock ? `${stock.ticker} · ${stock.name}` : ''}
      snapPoints={['92%']}
      scrollable
    >
      {stock && <StockTrade key={stock.asset} stock={stock} portfolio={portfolio} enabled={enabled} onClose={onClose} />}
    </BottomSheet>
  );
}

function StockTrade({ stock, portfolio, enabled, onClose }: Omit<StockSheetProps, 'stock'> & { stock: StockRow }) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState(''); // buy: dollars · sell: shares
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<StockOrder | null>(null);
  // A buy funded from Arc, Tempo, Robinhood Chain, Zcash or Hyperliquid: the Base wallet is topped up first, then the trade goes ahead.
  const [showTopUp, setShowTopUp] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const refreshPortfolio = () => {
    queryClient.invalidateQueries({ queryKey: ['stocks-portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  const owned = Number(portfolio?.positions.find((p) => p.asset === stock.asset)?.quantity ?? 0);
  const credit = portfolio?.cashUsd ?? 0;
  const price = stock.price ?? 0;
  // Buy is entered in dollars; the exchange trades shares, so convert (the quote snaps to the allowed step).
  const shares = side === 'buy' ? (price > 0 ? Number(amount) / price : 0) : Number(amount);
  const estimate = side === 'buy' ? Number(amount) || 0 : shares * price;
  // What has to come from the wallet: the quote's max cost minus any credit already held.
  const fromWallet = quote ? walletShare(quote, credit) : 0;

  const review = async () => {
    setMsg(null);
    try {
      const qty = side === 'buy' ? shares.toFixed(6) : amount;
      const d = await fetchStockQuote(call, stock.asset, side, qty);
      setQuote(d.quote);
      setStep('review');
    } catch (e) {
      setMsg((e as Error).message || "Couldn't price this trade.");
    }
  };

  const confirm = async () => {
    if (!quote) return;
    try {
      // Same trade as the chat's trade card: fund from the wallet (what credit doesn't cover), place, wait.
      const order = await executeStockTrade({
        quote,
        creditUsd: credit,
        wallet: getEvmWallet(),
        call,
        onStep: setStep,
        isAlive: () => alive.current,
      });
      if (!alive.current) return;
      refreshPortfolio();
      setResult(order);
      if (order.status === 'filled' || order.status === 'pending') setStep('done');
      else {
        setStep('error');
        setMsg(orderFailureMessage(order, quote.side));
      }
    } catch (e) {
      setStep('error');
      setMsg(friendlyTradeError(e));
      refreshPortfolio();
    }
  };

  return (
    <View>
      <View style={styles.priceRow}>
        <StockLogo ticker={stock.ticker} size={48} />
        <View>
          <Text style={styles.price}>{stock.price !== null ? usd(stock.price) : '—'}</Text>
          <Text style={[styles.change, { color: (stock.changePct ?? 0) >= 0 ? Colors.sage : Colors.redAlert }]}>
            {pct(stock.changePct)} today
          </Text>
        </View>
      </View>
      <PriceChart asset={stock.asset} />

      <View style={{ marginTop: Spacing.xl }}>
        {!enabled ? (
          <Text style={styles.notice}>Trading is coming soon. Prices and charts are live.</Text>
        ) : step === 'done' && result ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>{result.status === 'filled' ? '✅' : '⏳'}</Text>
            <Text style={styles.title}>
              {result.status === 'filled'
                ? `${side === 'buy' ? 'Bought' : 'Sold'} ${Number(result.fillQuantity)} ${stock.ticker} at ${usd(Number(result.fillPrice))}`
                : 'Order accepted — settling'}
            </Text>
            <Text style={styles.sub}>
              {result.status !== 'filled'
                ? 'It usually settles within a few minutes. Your holdings update when it does.'
                : side === 'sell'
                  ? 'The money is on its way to your wallet as USDC.'
                  : 'Your holdings are updated.'}
            </Text>
            <View style={{ height: Spacing.lg }} />
            <Button variant="secondary" fullWidth onPress={onClose}>
              Done
            </Button>
          </View>
        ) : step === 'error' ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={styles.title}>{msg}</Text>
            <View style={{ height: Spacing.lg }} />
            <Button
              variant="outline"
              onPress={() => {
                setStep('form');
                setMsg(null);
              }}
            >
              Back
            </Button>
          </View>
        ) : step === 'funding' || step === 'placing' || step === 'pending' ? (
          <View style={styles.center}>
            <Text style={styles.title}>
              {step === 'funding' ? `Sending ${usd(fromWallet)} USDC from your wallet…` : step === 'placing' ? 'Sending your order…' : 'Getting the best price…'}
            </Text>
            {step === 'funding' && <Text style={styles.sub}>Usually no gas needed; if the gasless route isn't available, the network fee comes from your wallet. Then we place the order.</Text>}
          </View>
        ) : step === 'review' && quote ? (
          <View style={{ gap: Spacing.md }}>
            <View style={styles.reviewCard}>
              {(
                [
                  [quote.side === 'buy' ? 'Buy' : 'Sell', `${Number(quote.quantity)} ${stock.ticker}`],
                  ['Market price', usd(quote.marketPrice)],
                  [quote.side === 'buy' ? 'Max price per share' : 'Min price per share', usd(Number(quote.limitPrice))],
                  ['Bluvfi fee (est.)', usd(Number(quote.feeUsdc))],
                  [quote.side === 'buy' ? 'You pay at most' : 'You receive at least', usd(Number(quote.estimateUsdc))],
                  ...(quote.side === 'buy' && credit >= 0.01 ? [['Paid from credit', usd(Math.min(credit, Number(quote.estimateUsdc)))]] : []),
                  ...(quote.side === 'buy' ? [['From your wallet (USDC)', usd(fromWallet)]] : [['Paid to', 'Your wallet (USDC)']]),
                ] as [string, string][]
              ).map(([k, v]) => (
                <View key={k} style={styles.reviewRow}>
                  <Text style={styles.reviewKey}>{k}</Text>
                  <Text style={styles.reviewValue}>{v}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.sub, { textAlign: 'center' }]}>
              {quote.side === 'buy'
                ? 'Filled at or better than your max price; anything unused is kept as credit for your next buy.'
                : 'Filled at or better than your min price; the money goes straight to your wallet.'}
            </Text>
            {quote.side === 'buy' && fromWallet > 0 ? (
              showTopUp ? (
                <ChainTopUpPanel
                  token="usdc"
                  amount={fromWallet.toFixed(2)}
                  amountUsd={fromWallet}
                  purpose="stocks"
                  reference={`Buy ${Number(quote.quantity)} ${stock.ticker}`}
                  onFunded={() => {
                    setShowTopUp(false);
                    void confirm();
                  }}
                />
              ) : (
                <MoreChainsLink onPress={() => setShowTopUp(true)} textStyle={styles.topUpLink} />
              )
            ) : null}
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="outline"
                  fullWidth
                  onPress={() => {
                    setShowTopUp(false);
                    setStep('form');
                  }}
                >
                  Back
                </Button>
              </View>
              {!(showTopUp && quote.side === 'buy' && fromWallet > 0) ? (
                <View style={{ flex: 1 }}>
                  <Button variant="secondary" fullWidth onPress={confirm}>
                    {`Confirm ${quote.side}`}
                  </Button>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={{ gap: Spacing.md }}>
            <View style={styles.actions}>
              {(['buy', 'sell'] as const).map((s) => (
                <Pressable
                  key={s}
                  disabled={s === 'sell' && !owned}
                  onPress={() => {
                    setSide(s);
                    setAmount('');
                    setMsg(null);
                  }}
                  style={[styles.sideButton, side === s && styles.sideButtonActive, s === 'sell' && !owned && { opacity: 0.4 }]}
                >
                  <Text style={[styles.sideText, side === s && styles.sideTextActive]}>
                    {s === 'buy' ? 'Buy' : `Sell${owned ? ` (${owned})` : ''}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.inputWrap}>
              {side === 'buy' && <Text style={styles.prefix}>$</Text>}
              <BottomSheetTextInput
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder={side === 'buy' ? 'Amount in USD (e.g. 50)' : 'Shares to sell'}
                placeholderTextColor={Colors.tx2}
                style={styles.input}
              />
              {side === 'sell' && owned > 0 && (
                <Pressable onPress={() => setAmount(String(owned))} style={styles.maxButton}>
                  <Text style={styles.maxText}>Max</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.sub}>
              {side === 'buy'
                ? `≈ ${shares > 0 ? shares.toFixed(4) : '0'} ${stock.ticker} · paid with USDC from your wallet`
                : `≈ ${usd(estimate)} to your wallet · you own ${owned} ${stock.ticker}`}
            </Text>
            {msg ? <Text style={styles.error}>{msg}</Text> : null}
            <Button variant="secondary" fullWidth disabled={!(Number(amount) > 0)} onPress={review}>
              {`Review ${side === 'buy' && Number(amount) > 0 ? `${usd(Number(amount))} buy` : side}`}
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topUpLink: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline', textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  price: { ...Type.h1, color: Colors.tx0 },
  change: { ...Type.small },
  notice: { ...Type.body, color: Colors.tx1, textAlign: 'center', backgroundColor: Colors.bg0, borderRadius: Radii.xl, padding: Spacing.lg },
  center: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  emoji: { fontSize: 36 },
  title: { ...Type.h3, color: Colors.tx0, textAlign: 'center' },
  sub: { ...Type.small, color: Colors.tx1 },
  error: { ...Type.small, color: Colors.redAlert },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  reviewCard: { backgroundColor: Colors.bg0, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.xl, padding: Spacing.lg },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  reviewKey: { ...Type.body, color: Colors.tx1 },
  reviewValue: { ...Type.body, color: Colors.tx0 },
  sideButton: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radii.xl, backgroundColor: Colors.bg2 },
  sideButtonActive: { backgroundColor: Colors.blue },
  sideText: { ...Type.body, fontFamily: Type.h3.fontFamily, color: Colors.tx1 },
  sideTextActive: { color: '#FFFFFF' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
  },
  prefix: { ...Type.body, color: Colors.tx1, marginRight: 4 },
  input: { ...Type.body, flex: 1, color: Colors.tx0, paddingVertical: 14 },
  maxButton: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 4, paddingHorizontal: Spacing.md },
  maxText: { ...Type.small, color: Colors.tx0 },
});
