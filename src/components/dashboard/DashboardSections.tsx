import { StyleSheet, Text, View } from 'react-native';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiQuery } from '@/hooks/use-api';
import type { Bill, InvestmentPosition, Payment } from '@/lib/api-types';

/**
 * The four dashboard tabs (Bills / Invest / Banking / History). They render plain lists (no nested
 * FlatList) because Home scrolls them inside its own ScrollView; any bottom sheets they open are
 * owned by Home and triggered through the callbacks here.
 */

function statusToBadge(status: string): BadgeVariant {
  if (status === 'completed' || status === 'paid') return 'live';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function BillsSection({ onPay }: { onPay: (bill: Bill) => void }) {
  const { data, isLoading } = useApiQuery<{ bills: Bill[] }>(['bills'], '/api/bills');

  if (isLoading) return <EmptyState text="Loading bills…" />;
  if (!data?.bills.length) return <EmptyState text="No bills yet." />;

  return (
    <View style={styles.list}>
      {data.bills.map((item) => {
        const isPaid = item.status === 'completed' || item.status === 'paid';
        return (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>{item.category}</Text>
            </View>
            <Text style={styles.rowAmount}>${item.amount}</Text>
            {isPaid ? (
              <Badge variant="live" />
            ) : (
              <Button size="sm" onPress={() => onPay(item)}>
                Pay
              </Button>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function InvestSection({ onBuy }: { onBuy: () => void }) {
  const { data, isLoading } = useApiQuery<{ portfolio: InvestmentPosition[] }>(['investments'], '/api/investments');

  return (
    <View style={styles.list}>
      <Button onPress={onBuy}>+ Buy an asset</Button>

      {isLoading && <EmptyState text="Loading positions…" />}
      {!isLoading && !data?.portfolio.length && <EmptyState text="No positions yet." />}
      {!isLoading &&
        data?.portfolio.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text style={styles.rowIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>
                {item.shares} {item.symbol}
              </Text>
            </View>
            <Text style={styles.rowAmount}>${item.currentValueUsd.toFixed(2)}</Text>
          </View>
        ))}
    </View>
  );
}

export function BankingSection({ onAddFunds, onWithdraw }: { onAddFunds: () => void; onWithdraw: () => void }) {
  return (
    <View style={styles.list}>
      <Text style={styles.emptyText}>Onramp and offramp (India/UPI) are live. Other banking rails are coming soon.</Text>
      <Button onPress={onAddFunds}>Add funds</Button>
      <Button variant="outline" onPress={onWithdraw}>
        Withdraw to bank
      </Button>
    </View>
  );
}

export function HistorySection() {
  const { data, isLoading } = useApiQuery<{ payments: Payment[] }>(['payments'], '/api/payments', { limit: 50 });
  if (isLoading) return <EmptyState text="Loading history…" />;
  if (!data?.payments.length) return <EmptyState text="No activity yet." />;

  return (
    <View style={styles.list}>
      {data.payments.map((item) => (
        <View key={item.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.description ?? item.type}</Text>
            <Text style={styles.rowSub}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          {item.amountUsdc && <Text style={styles.rowAmount}>${item.amountUsdc}</Text>}
          <Badge variant={statusToBadge(item.status)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg1,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  rowIcon: {
    fontSize: 20,
  },
  rowTitle: {
    ...Type.h3,
    color: Colors.tx0,
  },
  rowSub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 2,
  },
  rowAmount: {
    ...Type.body,
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx0,
  },
  empty: {
    alignItems: 'center',
    padding: Spacing.xxxl,
  },
  emptyText: {
    ...Type.body,
    color: Colors.tx1,
    textAlign: 'center',
  },
});
