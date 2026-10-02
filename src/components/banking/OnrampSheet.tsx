import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import type { OnrampOrder, OnrampPair } from '@/lib/banking-types';

/** The only onramp provider bluvfi has configured today — UPI (India) fiat rails. */
const PROVIDER = 'credible';

interface OnrampSheetProps {
  open: boolean;
  onClose: () => void;
}

export function OnrampSheet({ open, onClose }: OnrampSheetProps) {
  const apiCall = useApiClient();
  const { evmAddress, solanaAddress } = useAuth();
  const [pairs, setPairs] = useState<OnrampPair[]>([]);
  const [pair, setPair] = useState<OnrampPair | null>(null);
  const [amount, setAmount] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [order, setOrder] = useState<OnrampOrder | null>(null);
  const [status, setStatus] = useState<'idle' | 'loadingPairs' | 'creating' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus('loadingPairs');
    apiCall<{ data: OnrampPair[] }>(`/api/banking/${PROVIDER}/onramp/pairs`)
      .then((res) => setPairs(res.data ?? []))
      .catch(() => setError("Couldn't load currency pairs."))
      .finally(() => setStatus('idle'));
  }, [open, apiCall]);

  const destinationAddress = evmAddress ?? solanaAddress;

  const handleCreateOrder = useCallback(async () => {
    if (!pair || !amount || !firstName || !lastName || !destinationAddress) return;
    setStatus('creating');
    setError(null);
    try {
      const res = await apiCall<{ data: OnrampOrder }>(`/api/banking/${PROVIDER}/onramp/order`, {
        method: 'POST',
        body: {
          pair_id: pair.pair_id,
          amount: Number(amount),
          first_name: firstName,
          last_name: lastName,
          destination_address: destinationAddress,
        },
      });
      setOrder(res.data);
      setStatus('idle');
    } catch {
      setError('Could not create the order. Please try again.');
      setStatus('idle');
    }
  }, [pair, amount, firstName, lastName, destinationAddress, apiCall]);

  const reset = () => {
    setPair(null);
    setAmount('');
    setOrder(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="Add funds" snapPoints={['80%']}>
      {order ? (
        <View>
          <Text style={styles.sectionLabel}>Complete payment in your UPI app</Text>
          <View style={styles.orderCard}>
            <Text style={styles.orderAmount}>₹{order.input_amount.toFixed(2)}</Text>
            <Text style={styles.orderSub}>Order {order.order_id.slice(0, 12)}…</Text>
          </View>
          <Button variant="secondary" fullWidth onPress={() => Linking.openURL(order.upi_intent)}>
            Open UPI app to pay
          </Button>
          <Text style={styles.qrFallback}>Or scan: {order.upi_qr}</Text>
          <View style={{ height: Spacing.md }} />
          <Button variant="ghost" fullWidth onPress={handleClose}>
            Done
          </Button>
        </View>
      ) : !pair ? (
        <View>
          <Text style={styles.sectionLabel}>Choose a currency pair</Text>
          {status === 'loadingPairs' && <Text style={styles.hint}>Loading…</Text>}
          {pairs.map((p) => (
            <Pressable key={p.pair_id} onPress={() => setPair(p)} style={styles.pairRow}>
              <Text style={styles.pairText}>
                {p.input_currency} → {p.output_currency}
              </Text>
              <Text style={styles.pairSub}>{p.blockchain}</Text>
            </Pressable>
          ))}
          {status === 'idle' && pairs.length === 0 && <Text style={styles.hint}>No pairs available right now.</Text>}
        </View>
      ) : (
        <View>
          <Pressable onPress={() => setPair(null)} style={{ marginBottom: Spacing.md }}>
            <Text style={styles.backLink}>← Choose a different pair</Text>
          </Pressable>
          <Text style={styles.sectionLabel}>
            {pair.input_currency} → {pair.output_currency}
          </Text>

          <TextInput
            style={styles.input}
            placeholder={`Amount (${pair.input_currency})`}
            placeholderTextColor={Colors.tx2}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <View style={{ height: Spacing.sm }} />
          <TextInput
            style={styles.input}
            placeholder="First name"
            placeholderTextColor={Colors.tx2}
            value={firstName}
            onChangeText={setFirstName}
          />
          <View style={{ height: Spacing.sm }} />
          <TextInput
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor={Colors.tx2}
            value={lastName}
            onChangeText={setLastName}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ height: Spacing.lg }} />
          <Button
            variant="secondary"
            fullWidth
            loading={status === 'creating'}
            disabled={!amount || !firstName || !lastName}
            onPress={handleCreateOrder}
          >
            Continue
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...Type.h3,
    color: Colors.tx0,
    marginBottom: Spacing.md,
  },
  hint: {
    ...Type.body,
    color: Colors.tx1,
  },
  pairRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pairText: {
    ...Type.h3,
    color: Colors.tx0,
  },
  pairSub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 2,
  },
  backLink: {
    ...Type.body,
    color: Colors.sage,
  },
  input: {
    backgroundColor: Colors.bg2,
    borderRadius: Radii.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    color: Colors.tx0,
    fontFamily: Type.body.fontFamily,
    fontSize: 14,
  },
  orderCard: {
    backgroundColor: Colors.bg0,
    borderRadius: Radii.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  orderAmount: {
    ...Type.display,
    color: Colors.tx0,
  },
  orderSub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 4,
  },
  qrFallback: {
    ...Type.small,
    color: Colors.tx2,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
