import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { RISK_TEXT, microToUsd, usePayoutAction, usePayoutQuote, type QueuePayout } from '@/hooks/use-shar';
import { ApiError } from '@/lib/api';

const SNAP_POINTS = ['88%'];
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Pay or reject one payout. For commission the SKR amount is priced when this sheet opens and shown here; the click sends
 * exactly that amount, and the server refuses it if the price moved too far since.
 */
export function PayoutSheet({ payout, onClose }: { payout: QueuePayout | null; onClose: () => void }) {
  const toast = useToast();
  const action = usePayoutAction();
  const quote = usePayoutQuote(payout?.kind ?? null, payout?.id ?? null);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setRejecting(false);
    setError(null);
  }, [payout?.id]);

  const q = quote.data?.quote;
  const isCommission = payout?.kind === 'commission';
  const treasuryLow = !!q?.treasury && Number(q.treasury.skr.replace(/,/g, '')) < q.skrMicro / 1_000_000;
  const flags = q?.risk?.flags ?? [];

  const confirmPay = () => {
    if (!payout || !q) return;
    const warning = flags.length > 0 ? `\n\nLinked accounts:\n• ${flags.map((f) => RISK_TEXT[f]).join('\n• ')}\n\nBy sending you confirm you've checked this.` : '';
    Alert.alert(
      `Send ${q.skr} SKR?`,
      `To ${q.wallet}\n\nThis sends real SKR from the treasury and can't be undone.${warning}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: flags.length > 0 ? 'Send anyway' : 'Send', style: 'destructive', onPress: pay },
      ],
    );
  };

  const pay = async () => {
    if (!payout || !q) return;
    setError(null);
    try {
      const res = await action.mutateAsync({ kind: payout.kind, id: payout.id, action: 'pay', expectedSkrMicro: q.skrMicro, acknowledgeRisk: flags.length > 0 });
      toast({ variant: 'success', title: res.status === 'paid' ? 'Paid' : 'Sent, confirming', subtitle: `${num((res.skrMicro ?? q.skrMicro) / 1_000_000)} SKR · ${(res.signature ?? '').slice(0, 10)}…` });
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t pay that.');
      // The price moved: show the new amount rather than leaving the old one on screen.
      // The price moved, or new flags appeared since the quote: show the current picture rather than the old one.
      if (e instanceof ApiError && e.status === 409) quote.refetch();
    }
  };

  const reject = async () => {
    if (!payout) return;
    setError(null);
    try {
      await action.mutateAsync({ kind: payout.kind, id: payout.id, action: 'reject', note });
      toast({ variant: 'success', title: 'Declined', subtitle: isCommission ? 'The money went back to the owner.' : 'The Shar went back to the user.' });
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t reject that.');
    }
  };

  return (
    <BottomSheet open={!!payout} onClose={onClose} title={isCommission ? 'Commission payout' : 'Shar claim'} snapPoints={SNAP_POINTS} scrollable>
      {payout ? (
        <>
          <View style={styles.card}>
            <Row label="USER" value={payout.userId} mono />
            <Row label="WALLET" value={payout.wallet} mono />
            {payout.shar !== null ? <Row label="SHAR" value={num(payout.shar)} /> : null}
            {payout.usd ? <Row label="OWED" value={`$${payout.usd}`} /> : null}
          </View>

          {quote.isLoading ? (
            <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xl }} />
          ) : quote.isError ? (
            <Text style={styles.error}>{(quote.error as Error).message}</Text>
          ) : q ? (
            <>
              <View style={styles.send}>
                <Text style={styles.sendLabel}>YOU WILL SEND</Text>
                <Text style={styles.sendValue}>{q.skr} SKR</Text>
                {q.usdPerSkr ? (
                  <Text style={styles.sendSub}>
                    {microToUsd(q.usdMicro ?? 0)} at ${q.usdPerSkr} per SKR{q.priceImpactPct ? ` · impact ${q.priceImpactPct.toFixed(2)}%` : ''}
                  </Text>
                ) : (
                  <Text style={styles.sendSub}>Fixed when the claim was made.</Text>
                )}
              </View>
              {q.treasury ? (
                <Text style={[styles.muted, treasuryLow && { color: Colors.redAlert }]}>
                  Treasury {num(Number(q.treasury.skr))} SKR · {q.treasury.sol} SOL{treasuryLow ? ' — not enough SKR for this' : ''}
                </Text>
              ) : (
                <Text style={[styles.muted, { color: Colors.amber }]}>The treasury isn’t set up on the server yet.</Text>
              )}
            </>
          ) : null}

          {q?.risk ? (
            flags.length > 0 ? (
              <View style={styles.risk}>
                <Text style={styles.riskTitle}>Linked to {q.risk.linkedAccounts} other {q.risk.linkedAccounts === 1 ? 'account' : 'accounts'}</Text>
                {flags.map((f) => (
                  <Text key={f} style={styles.riskText}>
                    • {RISK_TEXT[f]}
                  </Text>
                ))}
                <Text style={styles.riskHint}>Check before paying. Declining is always safe.</Text>
              </View>
            ) : (
              <Text style={styles.muted}>
                {!q.risk.deviceChecks ? 'Phone checks aren’t set up on the server yet: only the wallet was checked.' : q.risk.info.includes('no_device') ? 'No links found, but no phone is on record for this account.' : 'No links to other accounts found.'}
              </Text>
            )
          ) : null}

          {rejecting ? (
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              <Text style={styles.label}>Reason (the user doesn’t see this)</Text>
              <BottomSheetTextInput style={styles.input} value={note} onChangeText={setNote} placeholder="e.g. wallet looks wrong" placeholderTextColor={Colors.tx2} maxLength={200} />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button variant="destructive" fullWidth loading={action.isPending} onPress={reject}>
                    Decline it
                  </Button>
                </View>
                <Button variant="ghost" onPress={() => setRejecting(false)}>
                  Back
                </Button>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              <Button fullWidth disabled={!q || treasuryLow} loading={action.isPending} onPress={confirmPay}>
                {q ? (flags.length > 0 ? `Review and pay ${q.skr} SKR` : `Pay ${q.skr} SKR`) : 'Pay'}
              </Button>
              <Button variant="outline" fullWidth onPress={() => setRejecting(true)}>
                Decline…
              </Button>
            </View>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={[styles.dataValue, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bg2, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  dataRow: { gap: 2 },
  dataLabel: { ...Type.label, color: Colors.tx2 },
  dataValue: { ...Type.body, color: Colors.tx0 },
  mono: { fontFamily: Fonts.mono, fontSize: 12 },
  send: { marginTop: Spacing.lg, backgroundColor: 'rgba(10,10,232,0.14)', borderRadius: Radii.lg, borderWidth: 1, borderColor: 'rgba(143,176,255,0.28)', padding: Spacing.lg, gap: 4 },
  sendLabel: { ...Type.label, color: Colors.tx2 },
  sendValue: { ...Type.amount, color: Colors.tx0 },
  sendSub: { ...Type.small, color: Colors.tx1 },
  muted: { ...Type.small, color: Colors.tx2, marginTop: Spacing.sm },
  risk: { marginTop: Spacing.md, backgroundColor: 'rgba(224,160,48,0.10)', borderRadius: Radii.lg, borderWidth: 1, borderColor: 'rgba(224,160,48,0.35)', padding: Spacing.md, gap: 4 },
  riskTitle: { ...Type.body, color: Colors.amber, fontFamily: Fonts.sansSemiBold },
  riskText: { ...Type.small, color: Colors.tx1 },
  riskHint: { ...Type.small, color: Colors.tx2, marginTop: 4 },
  label: { ...Type.label, color: Colors.tx2 },
  input: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Type.body.fontFamily, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  error: { ...Type.small, color: Colors.redAlert, marginTop: Spacing.md },
});
