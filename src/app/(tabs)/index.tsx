import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/ui/Logo';
import { Badge } from '@/components/ui/Badge';
import { Card, CardLabel, CardAmount } from '@/components/ui/Card';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useBalances } from '@/hooks/use-balances';
import { useApiQuery } from '@/hooks/use-api';
import type { Bill, InvestmentPosition } from '@/lib/api-types';

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { email, evmAddress, solanaAddress } = useAuth();
  const { data: balances, isLoading: balancesLoading } = useBalances(evmAddress, solanaAddress);

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
    >
      <View style={styles.header}>
        <Logo size={24} />
        <Badge variant="premium">BETA</Badge>
      </View>

      <Text style={styles.greeting}>
        {greeting}{firstName ? `, ${firstName}` : ''} 👋
      </Text>

      <View style={styles.cardsRow}>
        <Card style={styles.flexCard}>
          <CardLabel>Digital Products</CardLabel>
          <CardAmount style={{ marginTop: 4 }}>{purchasedCount}</CardAmount>
          <Text style={styles.cardSub}>purchased</Text>
        </Card>

        <Card style={styles.flexCard}>
          <CardLabel>Portfolio</CardLabel>
          <CardAmount style={{ marginTop: 4 }}>${portfolioValue.toFixed(2)}</CardAmount>
          <Text style={styles.cardSubMuted}>
            {positionCount} position{positionCount !== 1 ? 's' : ''}
          </Text>
        </Card>
      </View>

      <Card style={{ marginTop: Spacing.md }}>
        <CardLabel>Wallet Balance</CardLabel>
        <CardAmount style={{ marginTop: 4 }}>
          {balancesLoading ? '…' : `$${(balances?.total ?? 0).toFixed(2)}`}
        </CardAmount>
        <View style={styles.walletRows}>
          <View style={styles.walletRow}>
            <Text style={styles.walletLabel}>EVM (6 chains)</Text>
            <Text style={styles.walletValue}>
              ${((balances?.evmUsdc ?? 0) + (balances?.evmUsdt ?? 0)).toFixed(2)}
            </Text>
          </View>
          {solanaAddress && (
            <View style={styles.walletRow}>
              <Text style={styles.walletLabel}>Solana</Text>
              <Text style={styles.walletValue}>
                ${((balances?.solUsdc ?? 0) + (balances?.solUsdt ?? 0)).toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg0,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  greeting: {
    ...Type.h1,
    color: Colors.tx0,
    marginBottom: Spacing.lg,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  flexCard: {
    flex: 1,
  },
  cardSub: {
    ...Type.body,
    color: Colors.sage,
    marginTop: 4,
  },
  cardSubMuted: {
    ...Type.body,
    color: Colors.tx1,
    marginTop: 4,
  },
  walletRows: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  walletLabel: {
    ...Type.small,
    color: Colors.tx1,
  },
  walletValue: {
    ...Type.small,
    color: Colors.tx0,
    fontFamily: Type.amount.fontFamily,
  },
});
