// Privy's libraries read the `crypto` global when they load. Expo Router loads every route file up front, in
// path order, and can reach this file before the root layout's polyfills import runs, so load them here first.
import '@/lib/polyfills';

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useFundSolanaWallet, useFundWallet } from '@privy-io/expo/ui';
import { arbitrum, avalanche, base, mainnet, optimism, polygon } from 'viem/chains';
import type { Chain } from 'viem';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConnectedWalletCard } from '@/components/wallet/ConnectedWalletCard';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useBalances } from '@/hooks/use-balances';
import { BridgeTab, InfoBox, SendTab, UnifiedBalanceTab, useCopy } from './WalletTabs';

type Tab = 'buy' | 'balances' | 'send' | 'bridge' | 'solana';

interface FundWalletSheetProps {
  open: boolean;
  onClose: () => void;
  evmAddress?: string;
  solanaAddress?: string;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Same networks and minimum as the web's Buy tab (every chain the dashboard balance tracks, plus Solana). */
const BUY_NETWORKS: { key: string; label: string; icon: string; chain?: Chain }[] = [
  { key: 'base', label: 'Base', icon: '🔷', chain: base },
  { key: 'ethereum', label: 'Ethereum', icon: '⟠', chain: mainnet },
  { key: 'arbitrum', label: 'Arbitrum', icon: '🔵', chain: arbitrum },
  { key: 'optimism', label: 'Optimism', icon: '🔴', chain: optimism },
  { key: 'polygon', label: 'Polygon', icon: '🟣', chain: polygon },
  { key: 'avalanche', label: 'Avalanche', icon: '🔺', chain: avalanche },
  { key: 'solana', label: 'Solana', icon: '◎' },
];

const MIN_FUND_AMOUNT = 11;

type BuyState = { status: 'idle' } | { status: 'pending' } | { status: 'success'; message: string } | { status: 'error'; message: string };

function BuyTab({ evmAddress, solanaAddress }: { evmAddress?: string; solanaAddress?: string }) {
  const call = useApiClient();
  const { fundWallet: fundEvmWallet } = useFundWallet();
  const { fundWallet: fundSolanaWallet } = useFundSolanaWallet();
  const [network, setNetwork] = useState('base');
  const [amount, setAmount] = useState(String(MIN_FUND_AMOUNT));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [state, setState] = useState<BuyState>({ status: 'idle' });

  const networks = BUY_NETWORKS.filter((n) => (n.key === 'solana' ? !!solanaAddress : !!evmAddress));
  const selected = networks.find((n) => n.key === network) ?? networks[0];

  const handleBuy = async () => {
    if (state.status === 'pending' || !selected) return;
    const raw = Number(amount);
    if (!amount || Number.isNaN(raw) || raw <= 0) {
      setAmountError('Please enter a valid amount');
      return;
    }
    // Card providers reject sub-minimum orders, so clamp up silently (as the web does).
    const value = Math.max(raw, MIN_FUND_AMOUNT);
    if (value !== raw) setAmount(String(value));
    setAmountError(null);
    setState({ status: 'pending' });

    try {
      if (selected.key === 'solana') {
        // Solana's fundWallet resolves with no result, so the only honest claim is "the flow finished".
        await fundSolanaWallet({ address: solanaAddress!, asset: 'USDC', amount: String(value), defaultPaymentMethod: 'card' });
        setState({ status: 'success', message: 'Funding flow finished. Check your Solana balance in a moment.' });
        return;
      }
      await fundEvmWallet({
        address: evmAddress!,
        chain: selected.chain,
        asset: 'USDC',
        amount: String(value),
        defaultPaymentMethod: 'card',
      });
      setState({
        status: 'success',
        message: `Funded ${selected.label}: ${value} USDC. Funds may take a few minutes to arrive.`,
      });
      // Same record the web writes, so it shows up in History.
      call('/api/payments', {
        method: 'POST',
        body: {
          type: 'deposit',
          referenceId: null,
          description: `Card funding: ${value} USDC → ${selected.label} wallet`,
          amountUsdc: String(value),
          status: 'submitted',
          txHash: null,
          chain: 'evm',
        },
      }).catch(() => {});
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      console.warn('[fund]', err);
      setState({
        status: 'error',
        message: code === 'funding_flow_cancelled' ? 'Funding cancelled.' : "Couldn't start the funding flow. Please try again.",
      });
    }
  };

  return (
    <View style={styles.stack}>
      <InfoBox>Buy USDC directly into your Bluvfi wallet with a card, Apple Pay, or Google Pay. No external wallet needed.</InfoBox>

      <View>
        <Text style={styles.fieldLabel}>Amount (USD)</Text>
        <View style={styles.amountField}>
          <Text style={styles.amountPrefix}>$</Text>
          <BottomSheetTextInput
            value={amount}
            onChangeText={(v) => {
              setAmount(v.replace(/[^0-9.]/g, ''));
              setAmountError(null);
            }}
            keyboardType="decimal-pad"
            placeholder={String(MIN_FUND_AMOUNT)}
            placeholderTextColor={Colors.tx2}
            style={styles.amountInput}
          />
        </View>
        <Text style={[styles.hint, amountError ? { color: Colors.redAlert } : null]}>
          {amountError ?? `Minimum $${MIN_FUND_AMOUNT} — lower amounts are rounded up automatically`}
        </Text>
      </View>

      <View>
        <Text style={styles.fieldLabel}>Network</Text>
        <View style={styles.chips}>
          {networks.map((n) => (
            <Pressable
              key={n.key}
              onPress={() => setNetwork(n.key)}
              style={[styles.chip, selected?.key === n.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected?.key === n.key && styles.chipTextActive]}>
                {n.icon} {n.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {state.status === 'success' && <Text style={styles.success}>✓ {state.message}</Text>}
      {state.status === 'error' && <Text style={styles.error}>{state.message}</Text>}

      <Button onPress={handleBuy} loading={state.status === 'pending'} disabled={!selected} fullWidth>
        {selected ? `Buy USDC on ${selected.label}` : 'Buy USDC'}
      </Button>

    </View>
  );
}

const SOLANA_PURPLE = '#9945FF';

/** Receive USDC on Solana: balance, address and instructions (laid out like the web's Solana tab). */
function SolanaTab({ solanaAddress }: { solanaAddress?: string }) {
  const { data, isLoading } = useBalances(undefined, solanaAddress);
  const { copied, copy } = useCopy(solanaAddress ?? '');
  if (!solanaAddress) return <InfoBox>Your Solana wallet is still being set up. Try again in a moment.</InfoBox>;

  return (
    <View style={styles.stack}>
      <ConnectedWalletCard bluvfiSolanaAddress={solanaAddress} />

      <View style={styles.solBalanceCard}>
        <Text style={styles.solLabel}>Solana USDC Balance</Text>
        <Text style={styles.solBalance}>{isLoading ? 'Loading…' : usd(data?.solUsdc ?? 0)}</Text>
        <Text style={styles.solSub}>Mainnet USDC (◎ Solana)</Text>
      </View>

      <View>
        <Text style={styles.solLabel}>Your Solana wallet address</Text>
        <View style={styles.solAddressRow}>
          <Text style={styles.solAddress} numberOfLines={1} ellipsizeMode="tail">
            {solanaAddress}
          </Text>
          <Pressable onPress={copy} style={styles.solCopy}>
            <Text style={styles.solCopyText}>{copied ? 'Copied!' : 'Copy'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.solInstructions}>
        <Text style={styles.solInstructionsTitle}>◎ Or send to your Solana wallet manually</Text>
        {[
          ['Send ', 'USDC on Solana mainnet', ' to the address above'],
          ['From Phantom, Backpack, Coinbase Wallet, or any Solana wallet'],
          ["Only send USDC — other tokens won't be used for payments"],
          ['Balance updates automatically every 30 seconds'],
        ].map((parts, i) => (
          <View key={i} style={styles.solBulletRow}>
            <Text style={styles.solBullet}>•</Text>
            <Text style={styles.solBulletText}>
              {parts.length === 3 ? (
                <>
                  {parts[0]}
                  <Text style={styles.solBold}>{parts[1]}</Text>
                  {parts[2]}
                </>
              ) : (
                parts[0]
              )}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.solFooter}>
        Sent funds? Wait 10–30 seconds for confirmation, then balance updates automatically.
      </Text>
    </View>
  );
}

/** The wallet sheet opened from the Wallets card / low-balance banner: ways to fund and see balances. */
export function FundWalletSheet({ open, onClose, evmAddress, solanaAddress }: FundWalletSheetProps) {
  const [tab, setTab] = useState<Tab>('buy');

  // Same five tabs as the web's wallet sheet (Solana only when the user has a Solana wallet).
  const tabs: { key: Tab; label: string }[] = [
    { key: 'buy', label: '💳 Buy' },
    { key: 'balances', label: '⊞ Balances' },
    { key: 'send', label: '↗ Send' },
    { key: 'bridge', label: '⇌ Bridge' },
    ...(solanaAddress ? [{ key: 'solana' as Tab, label: '◎ Solana' }] : []),
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="Wallet" snapPoints={['85%']} scrollable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabs}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && (t.key === 'solana' ? styles.tabActiveSolana : styles.tabActive)]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {tab === 'buy' && <BuyTab evmAddress={evmAddress} solanaAddress={solanaAddress} />}
      {tab === 'balances' && <UnifiedBalanceTab onBridge={() => setTab('bridge')} />}
      {tab === 'send' &&
        (evmAddress ? <SendTab agentAddress={evmAddress} /> : <InfoBox>Your wallet is still being set up. Try again in a moment.</InfoBox>)}
      {tab === 'bridge' &&
        (evmAddress ? <BridgeTab agentAddress={evmAddress} /> : <InfoBox>Your wallet is still being set up. Try again in a moment.</InfoBox>)}
      {tab === 'solana' && <SolanaTab solanaAddress={solanaAddress} />}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  tabScroll: {
    flexGrow: 0,
    marginBottom: Spacing.lg,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tab: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 999,
    backgroundColor: Colors.bg2,
  },
  tabActive: {
    backgroundColor: Colors.blue,
  },
  // The Solana tab takes the network's own purple, as on the web.
  tabActiveSolana: {
    backgroundColor: SOLANA_PURPLE,
  },
  tabText: {
    ...Type.small,
    color: Colors.tx1,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  stack: {
    gap: Spacing.md,
  },
  // Solana tab
  solBalanceCard: {
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xxl,
    padding: Spacing.xl,
  },
  solLabel: {
    ...Type.small,
    color: Colors.tx1,
    marginBottom: 6,
  },
  solBalance: {
    ...Type.h1,
    color: Colors.tx0,
  },
  solSub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 4,
  },
  solAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  solAddress: {
    ...Type.small,
    fontFamily: Type.label.fontFamily,
    color: Colors.tx0,
    flex: 1,
  },
  solCopy: {
    backgroundColor: 'rgba(153,69,255,0.2)',
    borderRadius: Radii.md,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  solCopyText: {
    ...Type.small,
    color: SOLANA_PURPLE,
  },
  solInstructions: {
    backgroundColor: 'rgba(153,69,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(153,69,255,0.2)',
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  solInstructionsTitle: {
    ...Type.small,
    fontFamily: Type.h3.fontFamily,
    color: SOLANA_PURPLE,
  },
  solBulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  solBullet: {
    ...Type.small,
    color: Colors.tx1,
  },
  solBulletText: {
    ...Type.small,
    color: Colors.tx1,
    flex: 1,
  },
  solBold: {
    fontFamily: Type.h3.fontFamily,
    color: Colors.tx0,
  },
  solFooter: {
    ...Type.small,
    color: Colors.tx1,
    textAlign: 'center',
  },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
  },
  amountPrefix: {
    ...Type.body,
    color: Colors.tx1,
    marginRight: 4,
  },
  amountInput: {
    ...Type.body,
    flex: 1,
    color: Colors.tx0,
    paddingVertical: 14,
  },
  hint: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: Colors.bg2,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  chipActive: {
    backgroundColor: Colors.blue,
  },
  chipText: {
    ...Type.small,
    color: Colors.tx1,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  success: {
    ...Type.body,
    color: Colors.sage,
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
  },
  infoBox: {
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  infoText: {
    ...Type.body,
    color: Colors.tx1,
  },
  optionCard: {
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  optionTitle: {
    ...Type.h3,
    color: Colors.tx0,
  },
  optionSub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 4,
  },
  totalCard: {
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.borderSage,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  total: {
    ...Type.amount,
    color: Colors.tx0,
    marginTop: 4,
  },
  fieldLabel: {
    ...Type.label,
    fontSize: 12,
    color: Colors.tx1,
    marginBottom: 6,
  },
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
  address: {
    ...Type.body,
    fontFamily: Type.label.fontFamily,
    color: Colors.tx0,
    flex: 1,
  },
  copy: {
    ...Type.small,
    color: Colors.tx1,
  },
  table: {
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  chain: {
    ...Type.body,
    color: Colors.tx0,
    width: 76,
  },
  cell: {
    ...Type.small,
    flex: 1,
    textAlign: 'right',
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx1,
  },
});
