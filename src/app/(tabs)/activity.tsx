import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PaymentConfirmSheet } from '@/components/payment/PaymentConfirmSheet';
import { BuyAssetSheet } from '@/components/invest/BuyAssetSheet';
import { OnrampSheet } from '@/components/banking/OnrampSheet';
import { OfframpSheet } from '@/components/banking/OfframpSheet';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useApiQuery } from '@/hooks/use-api';
import type { Bill, InvestmentPosition, Payment } from '@/lib/api-types';

type SubTab = 'bills' | 'invest' | 'banking' | 'history';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'bills', label: 'Bills' },
  { key: 'invest', label: 'Invest' },
  { key: 'banking', label: 'Banking' },
  { key: 'history', label: 'History' },
];

function statusToBadge(status: string): BadgeVariant {
  if (status === 'completed' || status === 'paid') return 'live';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function BillsList() {
  const { data, isLoading } = useApiQuery<{ bills: Bill[] }>(['bills'], '/api/bills');
  const queryClient = useQueryClient();
  const [payingBill, setPayingBill] = useState<Bill | null>(null);

  if (isLoading) return <EmptyState text="Loading bills…" />;
  if (!data?.bills.length) return <EmptyState text="No bills yet." />;

  return (
    <>
      <FlatList
        data={data.bills}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isPaid = item.status === 'completed' || item.status === 'paid';
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>{item.category}</Text>
              </View>
              <Text style={styles.rowAmount}>${item.amount}</Text>
              {isPaid ? (
                <Badge variant="live" />
              ) : (
                <Button size="sm" onPress={() => setPayingBill(item)}>
                  Pay
                </Button>
              )}
            </View>
          );
        }}
      />

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
    </>
  );
}

function InvestmentsList() {
  const { data, isLoading } = useApiQuery<{ portfolio: InvestmentPosition[] }>(['investments'], '/api/investments');
  const [buyOpen, setBuyOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.listContent}>
        <Button onPress={() => setBuyOpen(true)}>+ Buy an asset</Button>
      </View>

      {isLoading && <EmptyState text="Loading positions…" />}
      {!isLoading && !data?.portfolio.length && <EmptyState text="No positions yet." />}
      {!isLoading && !!data?.portfolio.length && (
        <FlatList
          data={data.portfolio}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowIcon}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>
                  {item.shares} {item.symbol}
                </Text>
              </View>
              <Text style={styles.rowAmount}>${item.currentValueUsd.toFixed(2)}</Text>
            </View>
          )}
        />
      )}

      <BuyAssetSheet open={buyOpen} onClose={() => setBuyOpen(false)} />
    </View>
  );
}

function BankingTab() {
  const [onrampOpen, setOnrampOpen] = useState(false);
  const [offrampOpen, setOfframpOpen] = useState(false);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>Onramp and offramp (India/UPI) are live. Other banking rails are coming soon.</Text>
      <View style={{ height: Spacing.lg }} />
      <Button onPress={() => setOnrampOpen(true)}>Add funds</Button>
      <View style={{ height: Spacing.sm }} />
      <Button variant="outline" onPress={() => setOfframpOpen(true)}>
        Withdraw to bank
      </Button>
      <OnrampSheet open={onrampOpen} onClose={() => setOnrampOpen(false)} />
      <OfframpSheet open={offrampOpen} onClose={() => setOfframpOpen(false)} />
    </View>
  );
}

function HistoryList() {
  const { data, isLoading } = useApiQuery<{ payments: Payment[] }>(['payments'], '/api/payments', { limit: 50 });
  if (isLoading) return <EmptyState text="Loading history…" />;
  if (!data?.payments.length) return <EmptyState text="No activity yet." />;
  return (
    <FlatList
      data={data.payments}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.description ?? item.type}</Text>
            <Text style={styles.rowSub}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          {item.amountUsdc && <Text style={styles.rowAmount}>${item.amountUsdc}</Text>}
          <Badge variant={statusToBadge(item.status)} />
        </View>
      )}
    />
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const [subTab, setSubTab] = useState<SubTab>('bills');

  return (
    <View style={styles.screen}>
      <View style={[styles.subTabRow, { paddingTop: insets.top + Spacing.sm }]}>
        {SUB_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setSubTab(tab.key)}
            style={[styles.subTabButton, subTab === tab.key && styles.subTabButtonActive]}
          >
            <Text style={[styles.subTabLabel, subTab === tab.key && styles.subTabLabelActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {subTab === 'bills' && <BillsList />}
      {subTab === 'invest' && <InvestmentsList />}
      {subTab === 'banking' && <BankingTab />}
      {subTab === 'history' && <HistoryList />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg0,
  },
  subTabRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg1,
  },
  subTabButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    alignItems: 'center',
  },
  subTabButtonActive: {
    backgroundColor: Colors.blue,
  },
  subTabLabel: {
    ...Type.small,
    color: Colors.tx1,
  },
  subTabLabelActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg1,
    borderRadius: 14,
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
    ...Type.small,
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx0,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  emptyText: {
    ...Type.body,
    color: Colors.tx1,
    textAlign: 'center',
  },
});
