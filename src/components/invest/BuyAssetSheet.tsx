import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { DEMO_ASSETS, DemoAsset } from '@/lib/demo-assets';
import { useApiClient } from '@/hooks/use-api';

interface BuyAssetSheetProps {
  open: boolean;
  onClose: () => void;
}

export function BuyAssetSheet({ open, onClose }: BuyAssetSheetProps) {
  const apiCall = useApiClient();
  const queryClient = useQueryClient();
  const [asset, setAsset] = useState<DemoAsset | null>(null);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const shares = useMemo(() => {
    const amt = Number(amount);
    if (!asset || !amt || amt <= 0) return 0;
    return amt / asset.priceUsd;
  }, [asset, amount]);

  const handleBuy = useCallback(async () => {
    if (!asset || shares <= 0) return;
    setStatus('pending');
    setError(null);
    try {
      await apiCall('/api/investments', {
        method: 'POST',
        body: { symbol: asset.symbol, shares: shares.toFixed(6), avgPriceUsd: asset.priceUsd.toFixed(2) },
      });
      await queryClient.invalidateQueries({ queryKey: ['investments'] });
      setAsset(null);
      setAmount('');
      setStatus('idle');
      onClose();
    } catch {
      setError('Purchase failed. Please try again.');
      setStatus('error');
    }
  }, [asset, shares, apiCall, queryClient, onClose]);

  return (
    <BottomSheet open={open} onClose={onClose} title={asset ? `Buy ${asset.symbol}` : 'Buy an asset'} snapPoints={['75%']}>
      {!asset ? (
        <ScrollView style={{ maxHeight: 420 }}>
          {DEMO_ASSETS.map((a) => (
            <Pressable key={a.symbol} onPress={() => setAsset(a)} style={styles.assetRow}>
              <Text style={styles.assetIcon}>{a.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.assetName}>{a.name}</Text>
                <Text style={styles.assetSub}>{a.symbol} · {a.description}</Text>
              </View>
              <Text style={styles.assetPrice}>${a.priceUsd.toFixed(2)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View>
          <Pressable onPress={() => setAsset(null)} style={{ marginBottom: Spacing.md }}>
            <Text style={styles.backLink}>← Choose a different asset</Text>
          </Pressable>

          <View style={styles.priceCard}>
            <Text style={styles.assetIcon}>{asset.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.assetName}>{asset.name}</Text>
              <Text style={styles.assetSub}>${asset.priceUsd.toFixed(2)} / share</Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>Amount (USD)</Text>
          <TextInput
            style={styles.input}
            placeholder="100"
            placeholderTextColor={Colors.tx2}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            autoFocus
          />
          {shares > 0 && <Text style={styles.sharesPreview}>≈ {shares.toFixed(4)} shares</Text>}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ height: Spacing.lg }} />
          <Button variant="secondary" fullWidth loading={status === 'pending'} disabled={shares <= 0} onPress={handleBuy}>
            Buy ${amount || '0'} of {asset.symbol}
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  assetIcon: {
    fontSize: 24,
  },
  assetName: {
    ...Type.h3,
    color: Colors.tx0,
  },
  assetSub: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: 2,
  },
  assetPrice: {
    ...Type.small,
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx0,
  },
  backLink: {
    ...Type.body,
    color: Colors.sage,
  },
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg0,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    ...Type.label,
    color: Colors.tx2,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.bg2,
    borderRadius: Radii.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    color: Colors.tx0,
    fontFamily: Type.amount.fontFamily,
    fontSize: 18,
  },
  sharesPreview: {
    ...Type.small,
    color: Colors.tx1,
    marginTop: Spacing.sm,
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
