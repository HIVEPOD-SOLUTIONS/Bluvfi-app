import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Connection } from '@solana/web3.js';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Check } from '@/components/ui/Check';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useAuth } from '@/lib/auth-context';
import { SOLANA_RPC } from '@/lib/mwa';
import { useSkrBalance } from '@/lib/skr-balance';
import { sendFromWallet, walletRailFor } from '@/lib/payments/wallet-send';
import { SEND_SOL_RESERVE_LAMPORTS, sendConvertedUsdc, type SendOutcome } from '@/lib/skr-send';
import { convertSkr, fetchQuote, formatSkr, formatUsdc, parseSkrAmount, quotedPrice, readSnapshot, skrText, SWAP, type ConvertResult, type Quote, type Stage } from '@/lib/skr-swap';
import { useSolanaPaySource } from '@/lib/wallet-connection';

// Constant, so the sheet isn't asked to re-measure on every render of the screen behind it.
const SNAP_POINTS = ['88%'];
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const STAGE_TEXT: Record<Stage, string> = {
  quote: 'Getting the price…',
  prepare: 'Preparing…',
  check: 'Checking it’s safe…',
  sign: 'Approve in your wallet…',
  confirm: 'Waiting for the network…',
};

/**
 * Turn SKR into USDC in your own wallet (the Bluvfi wallet, or the one you connected), so you can spend it later. Nothing is held by
 * Bluvfi: the swap is built by Jupiter, checked on the phone, and approved in your wallet like any payment.
 */
export function ConvertSkrSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { solanaAddress, getSolanaProvider } = useAuth();
  const src = useSolanaPaySource({ address: solanaAddress, getProvider: getSolanaProvider });
  const balance = useSkrBalance(src.address);
  const have = balance.data ?? null;

  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ConvertResult | null>(null);
  // When the connected (e.g. Seeker) wallet does the converting, its USDC can be sent straight on to the Bluvfi wallet, where payments are made.
  const canSendOn = src.usingWallet && !!solanaAddress;
  const [toBluvfi, setToBluvfi] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SendOutcome | null>(null);

  const micro = parseSkrAmount(amount);
  const tooMuch = micro !== null && have !== null && micro > have;
  const busy = stage !== null;

  // Start fresh each time it opens.
  const { refetch } = balance;
  useEffect(() => {
    if (!open) return;
    setAmount('');
    setQuote(null);
    setQuoteError(null);
    setStage(null);
    setError(null);
    setDone(null);
    setSent(null);
    setSending(false);
    setToBluvfi(true);
    refetch();
  }, [open, refetch]);

  // A live price for the amount typed, a moment after the last keystroke.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!open || micro === null || tooMuch) return;
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await fetchQuote('ExactIn', micro);
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) setQuoteError((e as Error).message);
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setQuoting(false);
    };
  }, [open, micro, tooMuch]);

  /** Sends the USDC that was just converted from this wallet to the Bluvfi wallet: a second approval. Can be retried. */
  const sendOn = async (convertedMicro: number) => {
    if (!src.address || !solanaAddress) return;
    setSending(true);
    setSent(null);
    const rail = walletRailFor('USDC', 'Solana');
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const outcome = rail
      ? await sendConvertedUsdc({
          convertedMicro,
          readBalance: async () => (await readSnapshot(connection, src.address!)).usdcMicro,
          send: (amount) => sendFromWallet({ rail, coin: 'USDC', to: solanaAddress, amount, solana: { address: src.address!, getProvider: src.getProvider }, autoSkr: false }),
        })
      : ({ status: 'failed', error: 'This wallet can’t send USDC on Solana.', amountMicro: convertedMicro } as SendOutcome);
    setSent(outcome);
    setSending(false);
    qc.invalidateQueries({ predicate: (q) => /balance/i.test(String(q.queryKey[0])) });
  };

  const convert = async () => {
    if (!src.address || micro === null || !quote) return;
    setError(null);
    setStage('quote');
    try {
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      const provider = await src.getProvider();
      const sendAfter = canSendOn && toBluvfi;
      const res = await convertSkr({
        user: src.address,
        mode: 'ExactIn',
        amountMicro: micro,
        provider,
        connection,
        onStage: setStage,
        // The wallet also pays for the transfer that follows, so it must keep a little more SOL.
        minSolLamports: sendAfter ? SWAP.minSolLamports + SEND_SOL_RESERVE_LAMPORTS : undefined,
      });
      setDone(res);
      qc.invalidateQueries({ predicate: (q) => /balance/i.test(String(q.queryKey[0])) });
      setStage(null);
      if (sendAfter) await sendOn(res.usdcInMicro);
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t convert. Nothing was changed.');
    } finally {
      setStage(null);
    }
  };

  const pct = (p: number) => {
    if (have === null) return;
    setAmount(skrText(Math.floor(have * p)));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Convert SKR to USDC" snapPoints={SNAP_POINTS} scrollable>
      {done ? (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>Converted</Text>
          <Text style={styles.doneLine}>
            −{formatSkr(done.skrOutMicro)} SKR   <Text style={{ color: Colors.sage }}>+{formatUsdc(done.usdcInMicro)} USDC</Text>
          </Text>
          {!canSendOn ? <Text style={styles.hint}>The USDC is in your wallet and ready to spend.</Text> : null}
          {canSendOn && sending ? <Text style={styles.hint}>Sending the USDC to your Bluvfi wallet… approve it in {src.label}.</Text> : null}
          {canSendOn && sent?.status === 'sent' ? (
            <>
              <Text style={[styles.hint, { color: Colors.sage }]}>Sent {formatUsdc(sent.amountMicro)} to your Bluvfi wallet. It’s ready to spend there.</Text>
              <Pressable onPress={() => Linking.openURL(`https://solscan.io/tx/${sent.signature}`).catch(() => {})} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                <Text style={styles.link}>View the transfer</Text>
              </Pressable>
            </>
          ) : null}
          {canSendOn && sent?.status === 'failed' ? <Text style={styles.error}>Couldn’t send it on: {sent.error} The USDC is safe in {src.label}.</Text> : null}
          {canSendOn && sent?.status === 'too_small' ? <Text style={styles.hint}>That’s too small to be worth sending on. The USDC is in {src.label}.</Text> : null}
          {canSendOn && !sending && sent?.status !== 'sent' ? (
            <View style={{ alignSelf: 'flex-start', marginTop: Spacing.xs }}>
              <Button size="sm" variant="outline" onPress={() => sendOn(sent && sent.status !== 'too_small' ? sent.amountMicro : done.usdcInMicro)}>
                {sent ? 'Try sending it again' : 'Send it to my Bluvfi wallet'}
              </Button>
            </View>
          ) : null}
          <Pressable onPress={() => Linking.openURL(`https://solscan.io/tx/${done.signature}`).catch(() => {})} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
            <Text style={styles.link}>View on Solscan</Text>
          </Pressable>
          <View style={{ marginTop: Spacing.md }}>
            <Button fullWidth disabled={sending} onPress={onClose}>
              Done
            </Button>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.lead}>Turn your SKR into USDC to spend. It happens in your own wallet at the current market price, and you approve it like any payment.</Text>

          <View style={styles.walletRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>FROM</Text>
              <Text style={styles.walletName}>
                {src.label}
                {src.address ? <Text style={styles.mono}>  {short(src.address)}</Text> : null}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.label}>SKR AVAILABLE</Text>
              <Text style={styles.walletName}>{have === null ? '…' : formatSkr(have)}</Text>
            </View>
          </View>

          {!src.address ? <Text style={styles.error}>No wallet is ready yet. Sign in again, or connect a wallet on your profile.</Text> : null}

          <Text style={styles.label}>SKR TO CONVERT</Text>
          <BottomSheetTextInput
            style={styles.input}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={Colors.tx2}
            editable={!busy}
          />
          <View style={styles.chips}>
            {([['25%', 0.25], ['50%', 0.5], ['Max', 1]] as const).map(([label, p]) => (
              <Pressable key={label} disabled={busy || have === null || have <= 0} onPress={() => pct(p)} accessibilityRole="button" style={styles.chip}>
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {tooMuch ? <Text style={styles.error}>You only have {formatSkr(have ?? 0)} SKR in this wallet.</Text> : null}

          {quote ? (
            <View style={styles.quote}>
              <Row label="You get about" value={`${formatUsdc(quote.outMicro)} USDC`} strong />
              <Row label="At least" value={`${formatUsdc(quote.minOutMicro)} USDC`} />
              <Row label="Price" value={`1 SKR ≈ $${quotedPrice(quote).toFixed(4)}`} />
              <Row label="Market impact" value={`${quote.priceImpactPct.toFixed(2)}%`} />
            </View>
          ) : quoting ? (
            <Text style={styles.hint}>Getting the price…</Text>
          ) : quoteError ? (
            <Text style={styles.error}>{quoteError}</Text>
          ) : null}

          <Text style={styles.hint}>
            Prices can move a little before it goes through: you’re guaranteed at least the “at least” amount, or it doesn’t happen. You also need about 0.003 SOL in this wallet for the network fee.
          </Text>

          {canSendOn ? (
            <View style={styles.sendOption}>
              <Check checked={toBluvfi} onToggle={() => setToBluvfi((v) => !v)} disabled={busy} label="Then send the USDC to my Bluvfi wallet" />
              <Text style={styles.hint}>
                Your Bluvfi wallet is where payments are made from. This is a second approval in {src.label}, and keeps about {((SWAP.minSolLamports + SEND_SOL_RESERVE_LAMPORTS) / 1e9).toFixed(3)} SOL for the two network fees. If the second step fails, the USDC stays safe in {src.label}.
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={{ marginTop: Spacing.md }}>
            <Button fullWidth disabled={!quote || busy || !src.address} loading={busy} onPress={convert}>
              {busy && stage ? STAGE_TEXT[stage] : canSendOn && toBluvfi ? 'Convert and send to Bluvfi wallet' : 'Convert'}
            </Button>
          </View>
          <Text style={styles.hint}>Most you can convert at once: {formatUsdc(SWAP.maxUsdcOutMicro)} worth.</Text>
        </>
      )}
    </BottomSheet>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { color: Colors.sage, fontFamily: Fonts.monoBold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { ...Type.body, color: Colors.tx1, marginBottom: Spacing.md },
  label: { ...Type.label, color: Colors.tx2, marginTop: Spacing.md, marginBottom: Spacing.xs },
  hint: { ...Type.small, color: Colors.tx2, marginTop: Spacing.sm },
  error: { ...Type.small, color: Colors.redAlert, marginTop: Spacing.sm },
  link: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage, textDecorationLine: 'underline' },
  mono: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.tx2 },
  walletRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, backgroundColor: Colors.bg2, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  walletName: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  input: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 14, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Fonts.monoBold, fontSize: 22 },
  chips: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border },
  chipText: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  sendOption: { marginTop: Spacing.sm, backgroundColor: Colors.bg2, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  quote: { marginTop: Spacing.lg, backgroundColor: SharColors.tint, borderRadius: Radii.lg, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.lg, gap: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  rowLabel: { ...Type.small, color: Colors.tx1 },
  rowValue: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.tx0 },
  doneCard: { backgroundColor: Colors.bg2, borderRadius: Radii.xl, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.xl, gap: Spacing.sm },
  doneTitle: { ...Type.h2, color: Colors.tx0 },
  doneLine: { fontFamily: Fonts.monoBold, fontSize: 16, color: Colors.tx0 },
});
