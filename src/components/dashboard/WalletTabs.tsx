import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useUnifiedBalance } from '@/hooks/use-unified-balance';
import { AGENT_CHAIN, BRIDGE_SOURCE_OPTIONS, createEvmAdapter, getArcKit, type BridgeSourceChain } from '@/lib/arc-kit';
import { useAuth } from '@/lib/auth-context';

// ─── Shared pieces ────────────────────────────────────────────────────────────

export function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

export function AddressCard({ label, address }: { label: string; address: string }) {
  const { copied, copy } = useCopy(address);
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={copy} style={styles.addressCard}>
        <Text style={styles.address} numberOfLines={1} ellipsizeMode="middle">
          {address}
        </Text>
        <View style={styles.copyPill}>
          <Text style={styles.copyPillText}>{copied ? 'Copied!' : 'Copy'}</Text>
        </View>
      </Pressable>
    </View>
  );
}

export function InfoBox({ children }: { children: string }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

type TxState =
  | { status: 'idle' }
  | { status: 'pending'; label: string }
  | { status: 'success'; message: string; explorerUrl?: string }
  | { status: 'error'; message: string };

function TxResult({ state, onReset }: { state: TxState; onReset: () => void }) {
  if (state.status === 'idle') return null;
  if (state.status === 'pending') return <Text style={styles.pending}>⏳ {state.label}</Text>;
  if (state.status === 'success') {
    return (
      <View style={{ gap: Spacing.sm }}>
        <Text style={styles.success}>✓ {state.message}</Text>
        <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
          {state.explorerUrl && (
            <Pressable onPress={() => Linking.openURL(state.explorerUrl!)}>
              <Text style={styles.link}>View on explorer</Text>
            </Pressable>
          )}
          <Pressable onPress={onReset}>
            <Text style={styles.link}>New transfer</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: Spacing.sm }}>
      <Text style={styles.error}>{state.message}</Text>
      <Pressable onPress={onReset}>
        <Text style={styles.link}>Try again</Text>
      </Pressable>
    </View>
  );
}

/**
 * The wallet used to sign Send / Bridge. The web lists the embedded wallet plus any browser-extension
 * wallets; on a phone the user's Bluvfi (Privy embedded) wallet is the one wallet there is.
 */
function useFundingWallet() {
  const { evmAddress } = useAuth();
  const [connected, setConnected] = useState(false);
  return { address: evmAddress, connected: connected && !!evmAddress, connect: () => setConnected(true), disconnect: () => setConnected(false) };
}

function WalletSelector({
  address,
  connected,
  onConnect,
  onDisconnect,
}: {
  address?: string;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!address) return <InfoBox>No wallets available.</InfoBox>;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  if (connected) {
    return (
      <View style={styles.walletRow}>
        <View style={styles.walletIcon}>
          <Logo size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.walletName}>Bluvfi Wallet</Text>
          <Text style={styles.walletAddress}>{short}</Text>
        </View>
        <Pressable onPress={onDisconnect} hitSlop={8}>
          <Text style={styles.copy}>Disconnect</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable onPress={onConnect} style={styles.walletRow}>
      <View style={styles.walletIcon}>
        <Logo size={24} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.walletName}>Bluvfi Wallet</Text>
        <Text style={styles.walletAddress}>Your Bluvfi wallet</Text>
      </View>
      <Text style={styles.use}>Use →</Text>
    </Pressable>
  );
}

function AmountField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>Amount (USDC)</Text>
      <View style={styles.amountField}>
        <BottomSheetTextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={Colors.tx2}
          style={styles.amountInput}
        />
      </View>
    </View>
  );
}

/** Pulls a hash / explorer link out of an App Kit result, which has no single documented shape. */
function resultDetails(result: unknown) {
  const r = result as { hash?: string; transactionHash?: string; explorerUrl?: string; state?: string };
  return { hash: r.hash ?? r.transactionHash ?? null, explorerUrl: r.explorerUrl, success: r.state === 'success' };
}

function errorMessage(err: unknown, cancelled: string, fallback: string) {
  const msg = (err as Error)?.message ?? '';
  return msg.includes('rejected') || msg.includes('denied') ? cancelled : fallback;
}

// ─── Balances (Circle unified balance) ────────────────────────────────────────

export function UnifiedBalanceTab({ onBridge }: { onBridge: () => void }) {
  const { state, refresh } = useUnifiedBalance({ includePending: true, autoRefreshMs: 30_000 });

  if (state.status === 'idle' || state.status === 'loading') {
    return <Text style={styles.muted}>Loading balances…</Text>;
  }
  if (state.status === 'error') {
    return (
      <View style={styles.errorCard}>
        <Text style={styles.error}>{state.message}</Text>
        <Pressable onPress={refresh}>
          <Text style={styles.link}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { totalUsdc, chains, fundedCount, emptyCount, lastFetched } = state;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.fieldLabel}>Total USDC · All networks</Text>
          <Text style={styles.total}>${totalUsdc}</Text>
        </View>
        <Pressable onPress={refresh} hitSlop={10} style={{ alignItems: 'flex-end' }}>
          <Text style={styles.refresh}>↻</Text>
          <Text style={styles.tiny}>{lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </Pressable>
      </View>

      <View style={styles.pills}>
        <View style={[styles.pill, { backgroundColor: 'rgba(143,174,130,0.15)' }]}>
          <Text style={[styles.pillText, { color: Colors.sage }]}>
            {fundedCount} network{fundedCount !== 1 ? 's' : ''} with funds
          </Text>
        </View>
        {emptyCount > 0 && (
          <View style={[styles.pill, { backgroundColor: 'rgba(242,240,232,0.06)' }]}>
            <Text style={[styles.pillText, { color: Colors.tx1 }]}>{emptyCount} empty</Text>
          </View>
        )}
      </View>

      {chains.map((c) => (
        <View key={c.chain} style={[styles.chainRow, !c.hasFunds && { opacity: 0.45 }]}>
          <View style={[styles.chainIcon, { backgroundColor: `${c.color}33` }]}>
            <Text style={{ fontSize: 14 }}>{c.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chainName}>{c.label}</Text>
            {c.pendingBalance && <Text style={styles.tiny}>+${c.pendingBalance} pending</Text>}
          </View>
          {c.hasFunds ? (
            <Text style={styles.chainBalance}>${c.confirmedBalance}</Text>
          ) : (
            <View style={styles.emptyRight}>
              <Text style={styles.tiny}>No funds</Text>
              <Pressable onPress={onBridge} style={styles.bridgeChip}>
                <Text style={styles.bridgeChipText}>Bridge →</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {emptyCount > 0 && (
        <Text style={[styles.tiny, { marginTop: Spacing.md }]}>
          Dimmed networks have no USDC. Bridge funds in to use them.
        </Text>
      )}
    </View>
  );
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export function SendTab({ agentAddress }: { agentAddress: string }) {
  const call = useApiClient();
  const { getEvmProvider } = useAuth();
  const wallet = useFundingWallet();
  const [amount, setAmount] = useState('');
  const [tx, setTx] = useState<TxState>({ status: 'idle' });

  // On the phone the signing wallet IS the destination wallet, so there is nothing to send to.
  const isSelf = wallet.address?.toLowerCase() === agentAddress.toLowerCase();

  const handleSend = async () => {
    if (!wallet.connected || !amount || Number(amount) <= 0 || tx.status === 'pending' || isSelf) return;
    setTx({ status: 'pending', label: 'Preparing transfer…' });
    try {
      const [arcKit, adapter] = await Promise.all([getArcKit(), getEvmProvider().then(createEvmAdapter)]);

      setTx({ status: 'pending', label: 'Confirming transfer…' });
      const result = await arcKit.send({
        from: { adapter, chain: AGENT_CHAIN as never },
        to: agentAddress,
        amount,
        token: 'USDC',
      });

      const { hash, explorerUrl, success } = resultDetails(result);
      if (!success) {
        setTx({ status: 'error', message: 'Transfer could not be completed.' });
        return;
      }
      setTx({ status: 'success', message: 'Transfer complete!', explorerUrl });
      // Persist the send to the payments ledger, as the web does.
      call('/api/payments', {
        method: 'POST',
        body: {
          type: 'transfer',
          referenceId: hash,
          description: `Arc send: ${amount} USDC → agent wallet`,
          amountUsdc: amount,
          status: 'completed',
          txHash: hash,
          chain: 'evm',
        },
      }).catch(() => {});
    } catch (err) {
      console.warn('[send]', err);
      setTx({
        status: 'error',
        message: errorMessage(err, 'Transfer cancelled.', 'Transfer could not be completed. Please check your balance and try again.'),
      });
    }
  };

  return (
    <View style={styles.stack}>
      <View>
        <AddressCard label="Your wallet address" address={agentAddress} />
        <Text style={styles.hint}>Share this address to receive funds from any wallet on Base.</Text>
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.tiny}>or send directly</Text>
        <View style={styles.dividerLine} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Choose a wallet (Base)</Text>
        <WalletSelector
          address={wallet.address}
          connected={wallet.connected}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
        />
      </View>

      {wallet.connected && isSelf && (
        <InfoBox>
          Your Bluvfi wallet is already the destination on Base, so there is nothing to send here. To move USDC from
          another network into it, use Bridge. To receive from someone else, share your address above.
        </InfoBox>
      )}

      {wallet.connected && !isSelf && (
        <>
          <AmountField value={amount} onChange={setAmount} placeholder="10.00" />
          <TxResult state={tx} onReset={() => setTx({ status: 'idle' })} />
          {tx.status !== 'success' && (
            <Button
              onPress={handleSend}
              loading={tx.status === 'pending'}
              disabled={!amount || Number(amount) <= 0}
              fullWidth
            >
              {`Send $${amount || '0.00'}`}
            </Button>
          )}
        </>
      )}
    </View>
  );
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

export function BridgeTab({ agentAddress }: { agentAddress: string }) {
  const call = useApiClient();
  const { getEvmProvider } = useAuth();
  const wallet = useFundingWallet();
  const [sourceChain, setSourceChain] = useState<BridgeSourceChain>('Ethereum');
  const [amount, setAmount] = useState('');
  const [tx, setTx] = useState<TxState>({ status: 'idle' });

  const selectedSource = BRIDGE_SOURCE_OPTIONS.find((o) => o.value === sourceChain)!;
  const sameChain = sourceChain === AGENT_CHAIN;
  // Bridging out of Solana needs Circle's Solana adapter, which the app doesn't wire up yet.
  const unsupportedSource = sourceChain === 'Solana';
  const blocked = sameChain || unsupportedSource;

  const handleBridge = async () => {
    if (!wallet.connected || !amount || Number(amount) <= 0 || tx.status === 'pending' || blocked) return;
    setTx({ status: 'pending', label: 'Preparing bridge…' });
    try {
      const [arcKit, adapter] = await Promise.all([getArcKit(), getEvmProvider().then(createEvmAdapter)]);

      setTx({ status: 'pending', label: 'Bridging… this can take a few minutes' });
      const result = await arcKit.bridge({
        from: { adapter, chain: sourceChain as never },
        to: { adapter, chain: AGENT_CHAIN as never, recipientAddress: agentAddress },
        amount,
        token: 'USDC',
      });

      const { hash, explorerUrl, success } = resultDetails(result);
      if (!success) {
        setTx({ status: 'error', message: 'Bridge could not be completed.' });
        return;
      }
      setTx({ status: 'success', message: 'Bridge complete!', explorerUrl });
      call('/api/payments', {
        method: 'POST',
        body: {
          type: 'bridge',
          referenceId: hash,
          description: `Arc bridge: ${amount} USDC from ${selectedSource.label} → Base`,
          amountUsdc: amount,
          status: 'completed',
          txHash: hash,
          chain: 'evm',
        },
      }).catch(() => {});
    } catch (err) {
      console.warn('[bridge]', err);
      setTx({
        status: 'error',
        message: errorMessage(
          err,
          'Bridge cancelled.',
          'Bridge could not be completed. Check that you have sufficient balance on the source network.',
        ),
      });
    }
  };

  return (
    <View style={styles.stack}>
      <InfoBox>Bridge moves funds from another network into your wallet on Base automatically. No manual steps needed.</InfoBox>

      <View>
        <Text style={styles.fieldLabel}>From network</Text>
        <View style={styles.chips}>
          {BRIDGE_SOURCE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setSourceChain(opt.value)}
              style={[styles.chip, sourceChain === opt.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, sourceChain === opt.value && styles.chipTextActive]}>
                {opt.icon} {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.destination}>
        <View>
          <Text style={styles.tiny}>To network</Text>
          <Text style={styles.walletName}>🔷 Base</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.tiny}>Recipient</Text>
          <Text style={styles.walletName}>Your wallet</Text>
        </View>
      </View>

      <View>
        <Text style={styles.fieldLabel}>Choose a wallet on {selectedSource.label}</Text>
        <WalletSelector
          address={wallet.address}
          connected={wallet.connected}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
        />
      </View>

      {wallet.connected && (
        <>
          <AmountField value={amount} onChange={setAmount} placeholder="50.00" />
          {sameChain && <Text style={styles.error}>Pick a source network other than Base.</Text>}
          {unsupportedSource && (
            <Text style={styles.error}>Bridging from Solana isn't available in the app yet. Pick an EVM network.</Text>
          )}
          <TxResult state={tx} onReset={() => setTx({ status: 'idle' })} />
          {tx.status !== 'success' && (
            <Button
              onPress={handleBridge}
              loading={tx.status === 'pending'}
              disabled={!amount || Number(amount) <= 0 || blocked}
              fullWidth
            >
              {`Bridge $${amount || '0.00'} → Base`}
            </Button>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  fieldLabel: { ...Type.small, color: Colors.tx1, marginBottom: 6 },
  copyPill: {
    backgroundColor: 'rgba(143,174,130,0.2)',
    borderRadius: Radii.md,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  copyPillText: { ...Type.small, color: Colors.sage },
  walletIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg2, alignItems: 'center', justifyContent: 'center' },
  muted: { ...Type.body, color: Colors.tx1, textAlign: 'center', paddingVertical: Spacing.xxxl },
  tiny: { ...Type.small, color: Colors.tx1 },
  hint: { ...Type.small, color: Colors.tx1, marginTop: 6 },
  link: { ...Type.body, color: Colors.sage },
  success: { ...Type.body, color: Colors.sage },
  error: { ...Type.body, color: Colors.redAlert },
  pending: { ...Type.body, color: Colors.tx0 },
  infoBox: {
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  infoText: { ...Type.body, color: Colors.tx1 },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  address: { ...Type.body, fontFamily: Type.label.fontFamily, color: Colors.tx0, flex: 1 },
  copy: { ...Type.small, color: Colors.tx1 },
  use: { ...Type.small, color: Colors.sage },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  walletName: { ...Type.h3, color: Colors.tx0 },
  walletAddress: { ...Type.small, color: Colors.tx1, marginTop: 2 },
  amountField: {
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
  },
  amountInput: { ...Type.body, color: Colors.tx0, paddingVertical: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: 999, backgroundColor: Colors.bg2, paddingVertical: 6, paddingHorizontal: Spacing.md },
  chipActive: { backgroundColor: Colors.blue },
  chipText: { ...Type.small, color: Colors.tx1 },
  chipTextActive: { color: '#FFFFFF' },
  destination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  // Unified balance card
  card: {
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.borderSage,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  errorCard: {
    backgroundColor: 'rgba(224,82,82,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(224,82,82,0.25)',
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  total: { ...Type.amount, color: Colors.tx0 },
  refresh: { ...Type.h2, color: Colors.tx1 },
  pills: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.md },
  pill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: Spacing.md },
  pillText: { ...Type.small },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  chainIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chainName: { ...Type.body, color: Colors.tx0 },
  chainBalance: { ...Type.body, fontFamily: Type.amount.fontFamily, color: Colors.tx0 },
  emptyRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bridgeChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingVertical: 3,
    paddingHorizontal: Spacing.sm,
  },
  bridgeChipText: { ...Type.small, color: Colors.sage },
});
