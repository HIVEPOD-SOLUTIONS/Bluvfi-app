import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { getCurrentOffering, purchasePackage, restorePurchases } from '@/lib/revenuecat';

interface PaywallSheetProps {
  open: boolean;
  onClose: () => void;
  onPurchased?: () => void;
  featureName?: string;
}

export function PaywallSheet({ open, onClose, onPurchased, featureName = 'Premium' }: PaywallSheetProps) {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getCurrentOffering()
      .then((offering) => setPackages(offering?.availablePackages ?? []))
      .catch(() => setError("Couldn't load plans. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [open]);

  const handlePurchase = useCallback(
    async (pkg: PurchasesPackage) => {
      setPurchasing(true);
      setError(null);
      try {
        const ok = await purchasePackage(pkg);
        if (ok) {
          onPurchased?.();
          onClose();
        } else {
          setError('Purchase cancelled.');
        }
      } catch {
        setError('Purchase failed. Please try again.');
      } finally {
        setPurchasing(false);
      }
    },
    [onPurchased, onClose],
  );

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    setError(null);
    try {
      await restorePurchases();
      onPurchased?.();
      onClose();
    } catch {
      setError('No previous purchases found.');
    } finally {
      setRestoring(false);
    }
  }, [onPurchased, onClose]);

  return (
    <BottomSheet open={open} onClose={onClose} title={featureName}>
      <Text style={styles.subtitle}>Subscribe to unlock all features.</Text>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.sage} />
        </View>
      )}

      {!loading && packages.length === 0 && !error && (
        <Text style={styles.empty}>No plans available right now.</Text>
      )}

      {!loading &&
        packages.map((pkg) => (
          <Pressable
            key={pkg.identifier}
            onPress={() => handlePurchase(pkg)}
            disabled={purchasing || restoring}
            style={({ pressed }) => [styles.planCard, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.planTitle}>{pkg.product.title}</Text>
            <Text style={styles.planDescription}>{pkg.product.description}</Text>
            <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
          </Pressable>
        ))}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ marginTop: 4 }}>
        <Button variant="ghost" size="sm" fullWidth onPress={handleRestore} disabled={purchasing || restoring}>
          {restoring ? 'Restoring…' : 'Restore purchases'}
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...Type.body,
    color: Colors.tx1,
    marginBottom: Spacing.xxl,
  },
  loading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  empty: {
    ...Type.body,
    color: Colors.tx1,
    textAlign: 'center',
    paddingVertical: 24,
  },
  planCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.borderSage,
    backgroundColor: Colors.bg2,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  planTitle: {
    ...Type.h2,
    color: Colors.tx0,
  },
  planDescription: {
    ...Type.body,
    color: Colors.tx1,
    marginTop: 4,
  },
  planPrice: {
    ...Type.amount,
    color: Colors.sage,
    textAlign: 'right',
    marginTop: 12,
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});
