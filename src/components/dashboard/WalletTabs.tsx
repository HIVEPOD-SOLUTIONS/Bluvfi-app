import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useBalances } from '@/hooks/use-balances';
import { useUnifiedBalance } from '@/hooks/use-unified-balance';
import { mergeWalletBalances } from '@/lib/balance-merge';
import { useArcUsdcBalance } from '@/hooks/use-arc-balance';
import { AGENT_CHAIN, BRIDGE_DESTINATIONS, BRIDGE_SOURCE_OPTIONS, createEvmAdapter, getArcKit, type BridgeDestinationChain, type BridgeSourceChain } from '@/lib/arc-kit';
import { ARC_USDC, arcAddressUrl, arcChain, arcTxUrl } from '@/lib/arc-chain';
import { useAuth } from '@/lib/auth-context';
import { chainLogoByName } from '@/lib/payment-logos';
import { friendlyEvmError, payEvmTransfer, waitForEvmTx } from '@/lib/payments/evm-pay';
import { ChainLabel, RoundLogo } from './PaymentMethodPicker';

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

// ─── Balances (the wallet's USDC on every network, plus anything deposited in Circle Gateway) ─────────

export function UnifiedBalanceTab({ onBridge }: { onBridge: () => void }) {
  const { evmAddress, solanaAddress } = useAuth();
  const { state, refresh: refreshGateway } = useUnifiedBalance({ includePending: true, autoRefreshMs: 30_000 });
  // The wallet's own USDC, read on-chain: it is what pays at checkout and what Home shows. Circle's unified balance is only what was
  // deposited into Gateway, so on its own it showed $0.00 for a wallet that holds USDC.
  const onChain = useBalances(evmAddress ?? undefined, solanaAddress ?? undefined);
  const { arcUsdc, refresh: refreshArc } = useArcUsdcBalance(30_000);
  const refresh = () => {
    refreshGateway();
    refreshArc();
    void onChain.refetch();
  };

  if (state.status === 'idle' || state.status === 'loading' || (onChain.isLoading && !onChain.data)) {
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

  const { lastFetched } = state;
  const { rows: chains, totalUsdc, fundedCount, emptyCount } = mergeWalletBalances(state.chains, { byChain: onChain.data?.byChain, solUsdc: onChain.data?.solUsdc, arcUsdc });
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
          {chainLogoByName(c.label) ? (
            <RoundLogo spec={chainLogoByName(c.label)!} size={32} />
          ) : (
            <View style={[styles.chainIcon, { backgroundColor: `${c.color}33` }]}>
              <Text style={{ fontSize: 14 }}>{c.icon}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.chainName}>{c.label}</Text>
            {c.wallet > 0 && c.gateway > 0 ? <Text style={styles.tiny}>${c.wallet.toFixed(2)} in wallet · ${c.gateway.toFixed(2)} in Gateway</Text> : null}
            {c.wallet <= 0 && c.gateway > 0 ? <Text style={styles.tiny}>In Circle Gateway</Text> : null}
            {c.pendingBalance && <Text style={styles.tiny}>+${c.pendingBalance} pending</Text>}
          </View>
          {c.hasFunds ? (
            <Text style={styles.chainBalance}>${c.total.toFixed(2)}</Text>
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

export function BridgeTab({ agentAddress, initialDestination }: { agentAddress: string; initialDestination?: BridgeDestinationChain }) {
  const call = useApiClient();
  const { getEvmProvider } = useAuth();
  const wallet = useFundingWallet();
  const [destination, setDestination] = useState<BridgeDestinationChain>(initialDestination ?? BRIDGE_DESTINATIONS[0].value);
  const [sourceChain, setSourceChain] = useState<BridgeSourceChain>('Ethereum');
  const [amount, setAmount] = useState('');
  const [tx, setTx] = useState<TxState>({ status: 'idle' });

  const selectedSource = BRIDGE_SOURCE_OPTIONS.find((o) => o.value === sourceChain)!;
  const selectedDest = BRIDGE_DESTINATIONS.find((d) => d.value === destination)!;
  // A chain can't be bridged to itself: choosing a destination takes it off the list of sources.
  const sourceOptions = BRIDGE_SOURCE_OPTIONS.filter((o) => o.value !== destination);
  const sameChain = sourceChain === destination;
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
        // Arc: Circle's Forwarding Service mints on Arc, so no Arc gas is needed to receive.
        to: selectedDest.useForwarder ? ({ chain: destination, recipientAddress: agentAddress, useForwarder: true } as never) : { adapter, chain: AGENT_CHAIN as never, recipientAddress: agentAddress },
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
          description: `Bridge: ${amount} USDC from ${selectedSource.label} → ${selectedDest.label}`,
          amountUsdc: amount,
          status: 'completed',
          txHash: hash,
          chain: selectedDest.label === 'Arc' || selectedSource.label === 'Arc' ? 'arc' : 'evm',
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
      <InfoBox>{`Bridge moves USDC from another network into your wallet on ${selectedDest.label} automatically. No manual steps needed.${destination === 'Arc' ? ' On Arc, USDC is also the gas token, so you only ever need USDC there.' : ''}`}</InfoBox>

      <View>
        <Text style={styles.fieldLabel}>From network</Text>
        <View style={styles.chips}>
          {sourceOptions.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setSourceChain(opt.value)}
              style={[styles.chip, sourceChain === opt.value && styles.chipActive]}
            >
              <ChainLabel name={opt.label} icon={opt.icon} textStyle={[styles.chipText, sourceChain === opt.value && styles.chipTextActive]} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.destination}>
        <View>
          <Text style={styles.tiny}>To network</Text>
          <View style={[styles.chips, { marginTop: 4 }]}>
            {BRIDGE_DESTINATIONS.map((d) => (
              <Pressable
                key={d.value}
                onPress={() => {
                  setDestination(d.value);
                  if (sourceChain === d.value) setSourceChain(BRIDGE_SOURCE_OPTIONS.find((o) => o.value !== d.value)!.value);
                }}
                style={[styles.chip, destination === d.value && styles.chipActive]}
              >
                <ChainLabel name={d.label} icon={d.icon} textStyle={[styles.chipText, destination === d.value && styles.chipTextActive]} />
              </Pressable>
            ))}
          </View>
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
          {sameChain && <Text style={styles.error}>{`Pick a source network other than ${selectedDest.label}.`}</Text>}
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
              {`Bridge $${amount || '0.00'} → ${selectedDest.label}`}
            </Button>
          )}
        </>
      )}
    </View>
  );
}

// ─── Arc ──────────────────────────────────────────────────────────────

/**
 * Arc mainnet in one place: the USDC on Arc, sending it from the Bluvfi wallet (USDC is also Arc's gas token, so nothing else is needed), and a
 * shortcut to bridge USDC in. Sends use the shared payment layers. Mirrors the website's Arc tab.
 */
export function ArcTab({ onBridgeToArc }: { onBridgeToArc: () => void }) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const { arcUsdc, address, refresh } = useArcUsdcBalance(15_000);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [tx, setTx] = useState<TxState>({ status: 'idle' });
  const amountNum = Number(amount);
  const validRecipient = /^0x[0-9a-fA-F]{40}$/.test(recipient);
  const tooMuch = arcUsdc !== null && amountNum > arcUsdc;
  const canSend = validRecipient && amountNum > 0 && !tooMuch && tx.status !== 'pending';

  const send = async () => {
    if (!canSend) return;
    setTx({ status: 'pending', label: 'Confirm in your wallet…' });
    try {
      const { hash } = await payEvmTransfer({
        chainId: arcChain.id,
        token: ARC_USDC,
        symbol: 'USDC',
        decimals: 6,
        recipient: recipient as `0x${string}`,
        amount,
        wallet: getEvmWallet(),
        label: 'arc-tab',
      });
      setTx({ status: 'pending', label: 'Confirming on Arc…' });
      await waitForEvmTx(arcChain.id, hash);
      setTx({ status: 'success', message: 'Sent!', explorerUrl: arcTxUrl(hash) });
      void refresh();
      call('/api/payments', {
        method: 'POST',
        body: {
          type: 'transfer',
          referenceId: hash,
          description: `Sent ${amount} USDC on Arc to ${recipient.slice(0, 6)}…${recipient.slice(-4)}`,
          amountUsdc: amount,
          status: 'completed',
          txHash: hash,
          chain: 'arc',
        },
      }).catch(() => {});
    } catch (err) {
      setTx({ status: 'error', message: friendlyEvmError(err, 'Arc') });
    }
  };

  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Your USDC on Arc</Text>
        <Text style={styles.total}>{arcUsdc === null ? '…' : arcUsdc.toFixed(2)}</Text>
        <Text style={styles.hint}>Arc is Circle’s stablecoin network. USDC pays for both the payment and the network cost, so USDC is all you need here.</Text>
        {address ? (
          <Pressable onPress={() => Linking.openURL(arcAddressUrl(address)).catch(() => {})} hitSlop={8}>
            <Text style={styles.link}>View wallet on Arc explorer ↗</Text>
          </Pressable>
        ) : null}
      </View>

      <Button variant="outline" fullWidth onPress={onBridgeToArc}>
        ⇌ Bring USDC to Arc (bridge)
      </Button>

      <View style={styles.stack}>
        <Text style={styles.fieldLabel}>Send USDC on Arc</Text>
        <View style={styles.amountField}>
          <BottomSheetTextInput
            value={recipient}
            onChangeText={(v) => setRecipient(v.trim())}
            placeholder="Recipient address (0x…)"
            placeholderTextColor={Colors.tx2}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.amountInput}
          />
        </View>
        <AmountField value={amount} onChange={setAmount} placeholder="Amount (USDC)" />
        <Pressable onPress={() => arcUsdc !== null && setAmount((Math.floor(arcUsdc * 100) / 100).toFixed(2))} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
          <Text style={styles.link}>Max</Text>
        </Pressable>
        {recipient.length > 0 && !validRecipient ? <Text style={styles.error}>That isn’t a valid address.</Text> : null}
        {tooMuch ? <Text style={styles.error}>More than your Arc balance.</Text> : null}
        <TxResult state={tx} onReset={() => setTx({ status: 'idle' })} />
        {tx.status !== 'success' && (
          <Button onPress={send} loading={tx.status === 'pending'} disabled={!canSend} fullWidth>
            {`Send ${amount || '0.00'} USDC on Arc`}
          </Button>
        )}
      </View>
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
