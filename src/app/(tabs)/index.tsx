import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { HistorySection } from '@/components/dashboard/HistorySection';
import { PaywallSheet } from '@/components/paywall/PaywallSheet';
import { StockSheet } from '@/components/invest/StockSheet';
import { StockWithdrawSheet } from '@/components/invest/StockWithdrawSheet';
import { InvestScreen, type ProviderId } from '@/components/invest/InvestScreen';
import { BackpackSheet } from '@/components/invest/InvestSheets';
import { NosanaSheet } from '@/components/invest/NosanaSheet';
import { GetEquitySheet } from '@/components/invest/GetEquitySheet';
import { DomaSheet } from '@/components/invest/DomaSheet';
import { Avatar, usePremium } from '@/components/profile/ProfileContent';
import { ProfileDrawer } from '@/components/profile/ProfileDrawer';
import { FundWalletSheet } from '@/components/dashboard/FundWalletSheet';
import { PriceTicker } from '@/components/dashboard/PriceTicker';
import { CoinSheet } from '@/components/crypto/CoinSheet';
import { MicButton, VoiceBar } from '@/components/chat/VoiceBar';
import { RecoveryCard } from '@/components/wallet/RecoveryCard';
import { useConnectedWallet } from '@/lib/wallet-connection';
import { useVoiceInput } from '@/hooks/use-voice-input';
import type { SupportedCoin } from '@/hooks/use-crypto-prices';
import { BitrefillCatalogSheet } from '@/components/dashboard/BitrefillCatalogSheet';
import { PurchasesSheet } from '@/components/dashboard/PurchasesSheet';
import {
  BankingSection,
  BillsSection,
} from '@/components/dashboard/DashboardSections';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useChatSheet } from '@/lib/chat-context';
import { getTimeBasedGreeting } from '@/lib/greeting';
import { useBalances } from '@/hooks/use-balances';
import { useXrpBalance, useXrplWallet } from '@/hooks/use-xrpl';
import { useApiQuery } from '@/hooks/use-api';
import type { Payment } from '@/lib/api-types';
import { useStocksPortfolio, type StockRow } from '@/hooks/use-stocks';

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
  const { email, firstName, displayName, evmAddress, solanaAddress } = useAuth();
  // A wallet-only account has no email; the avatar then shows the wallet's initial.
  const { wallet: signInWallet } = useConnectedWallet();
  const { isPremium, setIsPremium } = usePremium();
  const { data: balances, isLoading: balancesLoading } = useBalances(evmAddress, solanaAddress);
  const xrpl = useXrplWallet();
  const xrp = useXrpBalance(!!xrpl.address);

  const [tab, setTab] = useState<DashboardTab>('bills');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { openChat, walletOpen, openWallet, closeWallet } = useChatSheet();
  const [askText, setAskText] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<SupportedCoin | null>(null);
  const [backpackKind, setBackpackKind] = useState<'stock' | 'etf' | null>(null);
  const [provider, setProvider] = useState<ProviderId | null>(null);

  // Same source as the web dashboard: completed bill payments in the payments table, which includes
  // purchases the AI made on the user's behalf.
  const { data: billPayments, isLoading: billsLoading } = useApiQuery<{ payments: Payment[] }>(
    ['payments', 'bill'],
    '/api/payments',
    { type: 'bill', limit: 100 },
  );
  // Real holdings: US stocks and ETFs traded through Backpack (the same /api/stocks the Invest tab uses).
  const { data: stocksPortfolio } = useStocksPortfolio();

  const purchasedCount = billPayments?.payments.filter((p) => p.status === 'completed').length ?? 0;
  const portfolioValue = stocksPortfolio?.totalUsd ?? 0;
  const positionCount = stocksPortfolio?.positions.length ?? 0;
  const greeting = getTimeBasedGreeting();

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

  // Voice: what you say is transcribed and sent to the assistant, which opens with it (like typing in the ask bar).
  const voice = useVoiceInput(openChat);

  const submitAsk = () => {
    const text = askText.trim();
    if (!text) return;
    setAskText('');
    openChat(text);
  };

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
            <Avatar email={displayName ?? email ?? signInWallet?.address} size={36} />
          </Pressable>

          <View style={styles.brand}>
            <Text style={styles.brandText}>Bluvfi</Text>
          </View>

          <Pressable onPress={() => openChat()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Open chat">
            <ChatIcon />
          </Pressable>
        </View>

        <RecoveryCard compact onOpenProfile={() => setDrawerOpen(true)} />

        {balanceIsLow && (
          <View style={styles.banner}>
            <View style={styles.bannerTextRow}>
              <Text style={styles.bannerIcon}>⚠</Text>
              <Text style={styles.bannerText}>Low balance ({usd(totalBalance)}) — payments may fail</Text>
            </View>
            <Pressable onPress={() => openWallet()} style={styles.bannerButton}>
              <Text style={styles.bannerButtonText}>Add Funds</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.greeting}>
          {greeting}
          {firstName ?? displayName ? `, ${firstName ?? displayName}` : ''} 👋
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
              onPress={() => openWallet()}
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

        {/* Live crypto prices (CoinMarketCap). Hidden entirely if the server has no key. */}
        <View style={styles.ticker}>
          <PriceTicker onSelectCoin={setSelectedCoin} />
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
          {tab === 'bills' && (
            <BillsSection
              purchasedCount={purchasedCount}
              loading={billsLoading}
              purchases={billPayments?.payments ?? []}
              onViewAll={() => setPurchasesOpen(true)}
              onAskAi={() => openChat('Find me a good gift card for gaming or streaming')}
              onOpenBitrefill={() => setCatalogOpen(true)}
            />
          )}
          {tab === 'invest' && (
            <InvestScreen
              onAskAi={openChat}
              onOpenBackpack={setBackpackKind}
              onOpenProvider={setProvider}
              onSelectStock={setSelectedStock}
            />
          )}
          {tab === 'banking' && (
            <BankingSection />
          )}
          {tab === 'history' && <HistorySection onAsk={openChat} />}
        </View>
      </ScrollView>

      {/* Ask bar: type here and the AI chat sheet opens with your question, like the web dashboard. */}
      <View style={styles.askBar}>
        {voice.state !== 'idle' ? (
          <View style={{ flex: 1 }}>
            <VoiceBar state={voice.state} level={voice.level} onCancel={voice.cancel} onSend={() => void voice.finish()} />
          </View>
        ) : (
          <>
            <TextInput
              style={styles.askInput}
              placeholder={voice.error ?? 'Ask Bluvfi anything…'}
              placeholderTextColor={voice.error ? Colors.redAlert : Colors.tx2}
              value={askText}
              onChangeText={(t) => {
                setAskText(t);
                if (voice.error) voice.clearError();
              }}
              onSubmitEditing={submitAsk}
              returnKeyType="send"
            />
            {askText.trim().length > 0 ? (
              <Pressable onPress={submitAsk} style={styles.askSend} accessibilityRole="button" accessibilityLabel="Send">
                <Text style={styles.askSendText}>↑</Text>
              </Pressable>
            ) : (
              voice.available && <MicButton onPress={voice.permissionDenied ? voice.openSettings : voice.start} />
            )}
          </>
        )}
      </View>

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
      <CoinSheet coin={selectedCoin} onClose={() => setSelectedCoin(null)} onAsk={openChat} />
      <FundWalletSheet
        open={walletOpen}
        onClose={closeWallet}
        evmAddress={evmAddress}
        solanaAddress={solanaAddress}
      />
      <BackpackSheet
        kind={backpackKind}
        onChangeKind={setBackpackKind}
        onClose={() => setBackpackKind(null)}
        onSelectStock={setSelectedStock}
        onWithdraw={() => setWithdrawOpen(true)}
      />
      <NosanaSheet open={provider === 'nosana'} onClose={() => setProvider(null)} onAsk={openChat} />
      <GetEquitySheet open={provider === 'getequity'} onClose={() => setProvider(null)} onAsk={openChat} />
      <DomaSheet open={provider === 'doma'} onClose={() => setProvider(null)} onAsk={openChat} />
      <StockSheet
        stock={selectedStock}
        portfolio={stocksPortfolio}
        enabled={stocksPortfolio?.tradingEnabled ?? true}
        onClose={() => setSelectedStock(null)}
      />
      <StockWithdrawSheet open={withdrawOpen} cashUsd={stocksPortfolio?.cashUsd ?? 0} onClose={() => setWithdrawOpen(false)} />
      <PurchasesSheet
        open={purchasesOpen}
        onClose={() => setPurchasesOpen(false)}
        purchases={billPayments?.payments ?? []}
      />
      <BitrefillCatalogSheet
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onBuy={(product, catalogTab) => {
          setCatalogOpen(false);
          const request =
            catalogTab === 'topup'
              ? `top up with ${product.name}`
              : catalogTab === 'esim'
                ? `get the ${product.name} eSIM plan`
                : `buy a ${product.name} gift card`;
          openChat(`I want to ${request}.`);
        }}
      />
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
  ticker: {
    marginTop: Spacing.md,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.xl,
    paddingRight: Spacing.sm,
  },
  askInput: {
    ...Type.body,
    flex: 1,
    color: Colors.tx0,
    paddingVertical: Spacing.lg,
  },
  askSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askSendText: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 20,
  },
});
