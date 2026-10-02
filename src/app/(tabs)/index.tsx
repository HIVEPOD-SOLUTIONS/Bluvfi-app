import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Svg, { Path } from 'react-native-svg';
import { PaywallSheet } from '@/components/paywall/PaywallSheet';
import { PaymentConfirmSheet } from '@/components/payment/PaymentConfirmSheet';
import { BuyAssetSheet } from '@/components/invest/BuyAssetSheet';
import { OnrampSheet } from '@/components/banking/OnrampSheet';
import { OfframpSheet } from '@/components/banking/OfframpSheet';
import { Avatar, usePremium } from '@/components/profile/ProfileContent';
import { ProfileDrawer } from '@/components/profile/ProfileDrawer';
import { FundWalletSheet } from '@/components/dashboard/FundWalletSheet';
import {
  BankingSection,
  BillsSection,
  HistorySection,
  InvestSection,
} from '@/components/dashboard/DashboardSections';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useBalances } from '@/hooks/use-balances';
import { useXrpBalance, useXrplWallet } from '@/hooks/use-xrpl';
import { useApiQuery } from '@/hooks/use-api';
import type { Bill, InvestmentPosition } from '@/lib/api-types';

/** Same thresholds as bluvfi web: under $10 in stablecoins and under 5 XRP counts as a low balance. */
const LOW_BALANCE_THRESHOLD_USD = 10;
const LOW_XRP_THRESHOLD = 5;

type DashboardTab = 'bills' | 'invest' | 'banking' | 'history';

const TABS: { key: DashboardTab; label: string; icon: string }[] = [
  { key: 'bills', label: 'Bills', icon: '🧾' },
  { key: 'invest', label: 'Invest', icon: '📈' },
  { key: 'banking', label: 'Banking', icon: '🏦' },
  { key: 'history', label: 'History', icon: '💳' },
];

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const usd = (n: number) => `$${n.toFixed(2)}`;

function ChatIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M18 10c0 4.418-3.582 8-8 8a7.96 7.96 0 01-4-.107L2 19l1.107-4A7.96 7.96 0 012 10C2 5.582 5.582 2 10 2s8 3.582 8 8z"
        stroke={Colors.tx1}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { email, evmAddress, solanaAddress } = useAuth();
  const { isPremium, setIsPremium } = usePremium();
  const { data: balances, isLoading: balancesLoading } = useBalances(evmAddress, solanaAddress);
  const xrpl = useXrplWallet();
  const xrp = useXrpBalance(!!xrpl.address);

  const [tab, setTab] = useState<DashboardTab>('bills');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [onrampOpen, setOnrampOpen] = useState(false);
  const [offrampOpen, setOfframpOpen] = useState(false);

  const { data: billsData } = useApiQuery<{ bills: Bill[] }>(['bills'], '/api/bills');
  const { data: investData } = useApiQuery<{ portfolio: InvestmentPosition[]; totalValueUsd: number }>(
    ['investments'],
    '/api/investments',
  );

  const purchasedCount = billsData?.bills.filter((b) => b.status === 'completed' || b.status === 'paid').length ?? 0;
  const portfolioValue = investData?.totalValueUsd ?? 0;
  const positionCount = investData?.portfolio.length ?? 0;
  const greeting = getTimeBasedGreeting();
  const firstName = email?.split('@')[0];

  const evmTotal = (balances?.evmUsdc ?? 0) + (balances?.evmUsdt ?? 0);
  const solTotal = (balances?.solUsdc ?? 0) + (balances?.solUsdt ?? 0);
  const totalBalance = evmTotal + solTotal;
  // Either $10+ in stablecoins or 5+ XRP hides the warning. Wait for every balance source to settle
  // first so it can't flash while loading.
  const balanceIsLow =
    !!evmAddress &&
    !balancesLoading &&
    !xrpl.isLoading &&
    !xrp.isLoading &&
    totalBalance < LOW_BALANCE_THRESHOLD_USD &&
    (xrp.balance ?? 0) < LOW_XRP_THRESHOLD;

  const openChat = () => router.navigate('/chat');

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => setDrawerOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile menu"
          >
            <Avatar email={email} size={36} />
          </Pressable>

          <View style={styles.brand}>
            <Text style={styles.brandText}>Bluvfi</Text>
            <View style={styles.betaChip}>
              <Text style={styles.betaText}>Beta</Text>
            </View>
          </View>

          <Pressable onPress={openChat} hitSlop={10} accessibilityRole="button" accessibilityLabel="Open chat">
            <ChatIcon />
          </Pressable>
        </View>

        {balanceIsLow && (
          <View style={styles.banner}>
            <View style={styles.bannerTextRow}>
              <Text style={styles.bannerIcon}>⚠</Text>
              <Text style={styles.bannerText}>Low balance ({usd(totalBalance)}) — payments may fail</Text>
            </View>
            <Pressable onPress={() => setFundOpen(true)} style={styles.bannerButton}>
              <Text style={styles.bannerButtonText}>Add Funds</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.greeting}>
          {greeting}
          {firstName ? `, ${firstName}` : ''} 👋
        </Text>

        <View style={styles.cardsRow}>
          <View style={[styles.statCard, styles.flexCard]}>
            <Text style={styles.statLabel}>Digital Products</Text>
            <Text style={styles.statValue}>{purchasedCount}</Text>
            <Text style={[styles.statSub, { color: Colors.sage }]}>purchased</Text>
          </View>

          <View style={[styles.statCard, styles.flexCard]}>
            <Text style={styles.statLabel}>Portfolio</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {usd(portfolioValue)}
            </Text>
            <Text style={[styles.statSub, { color: Colors.sage }]}>
              {positionCount} position{positionCount !== 1 ? 's' : ''}
            </Text>
          </View>

          {evmAddress && (
            <Pressable
              onPress={() => setFundOpen(true)}
              style={[styles.statCard, styles.walletCard, balanceIsLow && styles.walletCardLow]}
            >
              <Text style={styles.statLabel}>Wallets</Text>
              <View style={styles.walletLine}>
                <Text style={styles.walletChain}>EVM</Text>
                <Text style={[styles.walletAmount, balanceIsLow && { color: Colors.amber }]}>
                  {balancesLoading ? '…' : usd(evmTotal)}
                </Text>
              </View>
              {solanaAddress && (
                <View style={styles.walletLine}>
                  <Text style={styles.walletChain}>Solana</Text>
                  <Text style={styles.walletAmount}>{balancesLoading ? '…' : usd(solTotal)}</Text>
                </View>
              )}
              <Text style={[styles.statSub, { color: Colors.sage }]}>+ Add</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabButton, tab === t.key && styles.tabButtonActive]}
            >
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          {tab === 'bills' && <BillsSection onPay={setPayingBill} />}
          {tab === 'invest' && <InvestSection onBuy={() => setBuyOpen(true)} />}
          {tab === 'banking' && (
            <BankingSection onAddFunds={() => setOnrampOpen(true)} onWithdraw={() => setOfframpOpen(true)} />
          )}
          {tab === 'history' && <HistorySection />}
        </View>
      </ScrollView>

      {/* Ask bar: opens the AI chat, like the web dashboard's "Ask Bluvfi anything…" input. */}
      <Pressable onPress={openChat} style={styles.askBar} accessibilityRole="button" accessibilityLabel="Ask Bluvfi">
        <Text style={styles.askText}>Ask Bluvfi anything…</Text>
      </Pressable>

      <ProfileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isPremium={isPremium}
        onUpgrade={() => {
          setDrawerOpen(false);
          // Let the sidebar's Modal finish dismissing before the paywall sheet opens.
          setTimeout(() => setPaywallOpen(true), 250);
        }}
      />
      <PaywallSheet
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => setIsPremium(true)}
        featureName="Bluvfi Premium"
      />
      <FundWalletSheet
        open={fundOpen}
        onClose={() => setFundOpen(false)}
        evmAddress={evmAddress}
        solanaAddress={solanaAddress}
      />
      <BuyAssetSheet open={buyOpen} onClose={() => setBuyOpen(false)} />
      <OnrampSheet open={onrampOpen} onClose={() => setOnrampOpen(false)} />
      <OfframpSheet open={offrampOpen} onClose={() => setOfframpOpen(false)} />
      {payingBill && (
        <PaymentConfirmSheet
          open
          onClose={() => setPayingBill(null)}
          title={payingBill.name}
          subtitle={payingBill.category}
          icon="🧾"
          amount={Number(payingBill.amount)}
          paymentType="bill"
          referenceId={payingBill.id}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['bills'] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            setPayingBill(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg0,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    // Room for the floating ask bar.
    paddingBottom: 96,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandText: {
    ...Type.label,
    color: Colors.tx1,
  },
  betaChip: {
    backgroundColor: Colors.bg2,
    borderRadius: Radii.sm,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
  },
  betaText: {
    ...Type.label,
    color: Colors.tx1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    backgroundColor: 'rgba(232,168,56,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,56,0.35)',
    borderRadius: Radii.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  bannerTextRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bannerIcon: {
    ...Type.body,
    color: Colors.amber,
  },
  bannerText: {
    ...Type.body,
    color: Colors.amber,
    flex: 1,
  },
  bannerButton: {
    backgroundColor: Colors.amber,
    borderRadius: Radii.md,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  bannerButtonText: {
    ...Type.small,
    fontFamily: Type.h3.fontFamily,
    color: Colors.bg0,
  },
  greeting: {
    ...Type.h1,
    color: Colors.tx0,
    marginBottom: Spacing.lg,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xxl,
    padding: Spacing.md,
    gap: 4,
  },
  flexCard: {
    flex: 1,
  },
  walletCard: {
    width: 118,
  },
  walletCardLow: {
    borderColor: 'rgba(232,168,56,0.45)',
  },
  statLabel: {
    ...Type.small,
    color: Colors.tx1,
  },
  statValue: {
    ...Type.amount,
    fontSize: 20,
    color: Colors.tx0,
  },
  statSub: {
    ...Type.small,
    color: Colors.tx1,
  },
  walletLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 4,
  },
  walletChain: {
    ...Type.small,
    color: Colors.tx1,
  },
  walletAmount: {
    ...Type.small,
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx0,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xl,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.lg,
  },
  tabButtonActive: {
    backgroundColor: Colors.blue,
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    ...Type.small,
    color: Colors.tx1,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  section: {
    marginTop: Spacing.lg,
  },
  askBar: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  askText: {
    ...Type.body,
    color: Colors.tx2,
  },
});
