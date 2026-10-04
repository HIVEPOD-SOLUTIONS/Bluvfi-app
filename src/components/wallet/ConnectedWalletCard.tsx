import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useCopy } from '@/components/dashboard/WalletTabs';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { buildTransfer, fetchWalletBalances, friendlyWalletError, type TransferAsset } from '@/lib/mwa';
import { useConnectedWallet } from '@/lib/wallet-connection';

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const num = (n: number, dp: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: dp });

function WalletGlyph({ color = Colors.sage }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Rect x={2.5} y={5} width={15} height={11} rx={2.5} stroke={color} strokeWidth={1.5} />
      <Path d="M2.5 8h15M13.5 11.5h1" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Connect an external Solana wallet through Mobile Wallet Adapter (Seeker's Seed Vault, Phantom, Solflare…) and
 * move funds into the Bluvfi wallet in one approval, instead of copying an address between apps. Renders nothing
 * where MWA doesn't exist (iOS, or a build without the native module).
 */
export function ConnectedWalletCard({ bluvfiSolanaAddress }: { bluvfiSolanaAddress: string }) {
  const { available, wallet, connecting, error, connect, disconnect, clearError } = useConnectedWallet();
  const [depositing, setDepositing] = useState(false);
  const { copied, copy } = useCopy(wallet?.address ?? '');
  const balances = useQuery({
    queryKey: ['mwa-balances', wallet?.address],
    queryFn: () => fetchWalletBalances(wallet!.address),
    enabled: !!wallet,
    refetchInterval: 20_000,
  });

  if (!available) return null;

  if (!wallet) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconCircle}>
            <WalletGlyph />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Use your Solana wallet</Text>
            <Text style={styles.sub}>Seeker, Phantom, Solflare or any wallet that supports Mobile Wallet Adapter.</Text>
          </View>
        </View>
        <View style={styles.perks}>
          {['Deposit to Bluvfi in one tap', 'Pay bills straight from your wallet', 'You approve every transfer in your wallet app'].map((t) => (
            <View key={t} style={styles.perkRow}>
              <Text style={styles.tick}>✓</Text>
              <Text style={styles.perkText}>{t}</Text>
            </View>
          ))}
        </View>
        <Button fullWidth loading={connecting} onPress={connect}>
          Connect wallet
        </Button>
        {error ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.error}>{error.message}</Text>
            {error.kind === 'not-found' ? (
              <Text
                style={styles.link}
                onPress={() => {
                  clearError();
                  Linking.openURL('https://phantom.app/download');
                }}
              >
                Get Phantom ›
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.cardConnected]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: 'rgba(143,174,130,0.15)' }]}>
          <Text style={styles.initial}>{wallet.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.title}>{wallet.name}</Text>
            <View style={styles.connectedPill}>
              <View style={styles.dot} />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          </View>
          <Pressable onPress={copy} hitSlop={6}>
            <Text style={styles.sub}>
              {short(wallet.address)} · {copied ? 'Copied!' : 'Tap to copy'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>USDC</Text>
          <Text style={styles.statValue}>{balances.data ? `$${num(balances.data.usdc, 2)}` : '—'}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>SOL</Text>
          <Text style={styles.statValue}>{balances.data ? num(balances.data.sol, 4) : '—'}</Text>
        </View>
      </View>

      {depositing ? (
        <DepositForm
          bluvfiSolanaAddress={bluvfiSolanaAddress}
          walletName={wallet.name}
          usdc={balances.data?.usdc ?? 0}
          sol={balances.data?.sol ?? 0}
          onClose={() => setDepositing(false)}
        />
      ) : (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button fullWidth onPress={() => setDepositing(true)}>
              Deposit to Bluvfi
            </Button>
          </View>
          <Button variant="ghost" onPress={disconnect}>
            Disconnect
          </Button>
        </View>
      )}
    </View>
  );
}

type Phase = 'idle' | 'approving' | 'confirming' | 'done';

function DepositForm({
  bluvfiSolanaAddress,
  walletName,
  usdc,
  sol,
  onClose,
}: {
  bluvfiSolanaAddress: string;
  walletName: string;
  usdc: number;
  sol: number;
  onClose: () => void;
}) {
  const { send } = useConnectedWallet();
  const qc = useQueryClient();
  const [asset, setAsset] = useState<Extract<TransferAsset, 'USDC' | 'SOL'>>('USDC');
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  // Keep a little SOL back so the wallet can still pay network fees.
  const max = asset === 'USDC' ? usdc : Math.max(0, sol - 0.01);
  const value = Number(amount);
  const invalid = !(value > 0) || value > max + 1e-9;

  const submit = async () => {
    setError(null);
    setPhase('approving');
    try {
      const sig = await send(
        (payer, connection) => buildTransfer({ payer, connection, to: bluvfiSolanaAddress, asset, amount }),
        () => setPhase('confirming'),
      );
      setSignature(sig);
      setPhase('done');
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['mwa-balances'] });
    } catch (err) {
      setError(friendlyWalletError(err).message);
      setPhase('idle');
    }
  };

  if (phase === 'done' && signature) {
    return (
      <View style={styles.success}>
        <Text style={styles.successTitle}>
          ✓ Deposited {amount} {asset}
        </Text>
        <Text style={styles.sub}>It's in your Bluvfi wallet and ready to spend.</Text>
        <View style={styles.actions}>
          <Text style={styles.link} onPress={() => Linking.openURL(`https://solscan.io/tx/${signature}`)}>
            View on Solscan ›
          </Text>
          <View style={{ flex: 1 }} />
          <Button size="sm" variant="outline" onPress={onClose}>
            Done
          </Button>
        </View>
      </View>
    );
  }

  const busy = phase === 'approving' || phase === 'confirming';
  return (
    <View style={styles.form}>
      <View style={styles.seg}>
        {(['USDC', 'SOL'] as const).map((a) => (
          <Pressable
            key={a}
            disabled={busy}
            onPress={() => {
              setAsset(a);
              setAmount('');
              setError(null);
            }}
            style={[styles.segItem, asset === a && styles.segActive]}
          >
            <Text style={[styles.segText, asset === a && { color: Colors.tx0 }]}>{a}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputRow}>
        <BottomSheetTextInput
          value={amount}
          onChangeText={(t) => setAmount(t.replace(',', '.').replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          placeholderTextColor={Colors.tx2}
          keyboardType="decimal-pad"
          editable={!busy}
          style={styles.input}
        />
        <Pressable disabled={busy || max <= 0} onPress={() => setAmount(String(Math.floor(max * 1e6) / 1e6))} style={styles.maxPill}>
          <Text style={styles.maxText}>Max</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>
        Available: {asset === 'USDC' ? `$${num(usdc, 2)} USDC` : `${num(sol, 4)} SOL`} · To your Bluvfi wallet {short(bluvfiSolanaAddress)}
      </Text>

      {busy ? (
        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {phase === 'approving' ? `Approve the transfer in ${walletName}…` : 'Confirming on Solana…'}
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button fullWidth loading={busy} disabled={invalid} onPress={submit}>
            {`Deposit ${asset} from ${walletName}`}
          </Button>
        </View>
        <Button variant="ghost" disabled={busy} onPress={onClose}>
          Cancel
        </Button>
      </View>
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
  },
  cardConnected: { borderColor: Colors.borderSage },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(143,174,130,0.12)', alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: Fonts.sansBold, fontSize: 18, color: Colors.sage },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  title: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(143,174,130,0.12)', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.sage },
  connectedText: { ...Type.small, fontSize: 11, color: Colors.sage },
  perks: { gap: 6 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tick: { color: Colors.sage, fontFamily: Fonts.sansBold },
  perkText: { ...Type.small, color: Colors.tx0 },
  statRow: { flexDirection: 'row', gap: Spacing.sm },
  stat: { flex: 1, backgroundColor: 'rgba(242,240,232,0.04)', borderRadius: Radii.lg, padding: Spacing.md, gap: 2 },
  statLabel: { ...Type.label, color: Colors.tx1 },
  statValue: { ...Type.h3, fontFamily: Fonts.sansBold, color: Colors.tx0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  error: { ...Type.small, color: Colors.redAlert },
  link: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  form: { gap: Spacing.md },
  seg: { flexDirection: 'row', gap: 4, backgroundColor: 'rgba(242,240,232,0.04)', borderRadius: Radii.lg, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radii.md },
  segActive: { backgroundColor: Colors.bg2 },
  segText: { ...Type.body, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    flex: 1,
    ...Type.h1,
    color: Colors.tx0,
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.lg,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
  },
  maxPill: { backgroundColor: Colors.bg2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: Spacing.lg },
  maxText: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  progress: { backgroundColor: 'rgba(143,174,130,0.08)', borderRadius: Radii.lg, padding: Spacing.md },
  progressText: { ...Type.small, color: Colors.sage },
  success: { gap: Spacing.sm, backgroundColor: 'rgba(143,174,130,0.08)', borderRadius: Radii.lg, padding: Spacing.lg },
  successTitle: { ...Type.h3, color: Colors.sage },
});
