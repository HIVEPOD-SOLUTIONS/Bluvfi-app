import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardLabel } from '@/components/ui/Card';
import { PaywallSheet } from '@/components/paywall/PaywallSheet';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useBalances } from '@/hooks/use-balances';
import { hasEntitlement } from '@/lib/revenuecat';

function AddressRow({ label, address }: { label: string; address: string | undefined }) {
  if (!address) return null;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <Pressable onPress={() => Clipboard.setStringAsync(address)} style={styles.addressRow}>
      <Text style={styles.addressLabel}>{label}</Text>
      <Text style={styles.addressValue}>{short}</Text>
    </Pressable>
  );
}

function BalanceRow({ label, amount, loading }: { label: string; amount: number; loading: boolean }) {
  return (
    <View style={styles.balanceRow}>
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={styles.balanceValue}>{loading ? '…' : `$${amount.toFixed(2)}`}</Text>
    </View>
  );
}

const LINKS = [
  { label: '𝕏 @bluvfi', url: 'https://x.com/bluvfi' },
  { label: 'Telegram', url: 'https://t.me/+KXpDSUAnfg44MTg0' },
];

const LEGAL_LINKS = [
  { label: 'Terms', url: 'https://waitlist.bluvfi.xyz/terms' },
  { label: 'Privacy Policy', url: 'https://waitlist.bluvfi.xyz/privacy' },
  { label: 'bluvfi.xyz', url: 'https://waitlist.bluvfi.xyz' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { email, evmAddress, solanaAddress, logout } = useAuth();
  const { data: balances, isLoading: balancesLoading } = useBalances(evmAddress, solanaAddress);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    hasEntitlement('premium').then(setIsPremium).catch(() => {});
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      // AuthGate's reactive Stack.Screen swap (tabs <-> onboarding/login)
      // isn't reliably triggering the visual transition on its own — force
      // it explicitly rather than depend on that alone.
      router.replace('/onboarding');
    } catch (err) {
      // usePrivy().logout() is documented to always resolve, never reject —
      // if this fires, it's an unexpected SDK-level failure, not the normal
      // "remote session cleanup failed but local logout still happened" case.
      setLogoutError((err as Error)?.message ?? 'Logout failed. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{email?.[0]?.toUpperCase() ?? '?'}</Text>
      </View>
      <Text style={styles.email}>{email ?? 'Signed in'}</Text>

      <View style={{ height: Spacing.xl }} />

      <AddressRow label="EVM Wallet" address={evmAddress} />
      <AddressRow label="Solana Wallet" address={solanaAddress} />

      {(evmAddress || solanaAddress) && (
        <Card style={{ marginTop: Spacing.sm }}>
          <CardLabel>Balances</CardLabel>
          <View style={{ height: Spacing.sm }} />
          {evmAddress && (
            <>
              <BalanceRow label="EVM USDC" amount={balances?.evmUsdc ?? 0} loading={balancesLoading} />
              <BalanceRow label="EVM USDT" amount={balances?.evmUsdt ?? 0} loading={balancesLoading} />
            </>
          )}
          {solanaAddress && (
            <>
              <BalanceRow label="SOL USDC" amount={balances?.solUsdc ?? 0} loading={balancesLoading} />
              <BalanceRow label="SOL USDT" amount={balances?.solUsdt ?? 0} loading={balancesLoading} />
            </>
          )}
        </Card>
      )}

      <View style={{ height: Spacing.xl }} />

      {isPremium ? (
        <View style={styles.premiumBadge}>
          <Badge variant="premium">Bluvfi Premium</Badge>
        </View>
      ) : (
        <Button variant="premium" fullWidth onPress={() => setPaywallOpen(true)}>
          Upgrade to Premium
        </Button>
      )}

      <View style={{ height: Spacing.md }} />

      <Button variant="destructive" fullWidth loading={loggingOut} onPress={handleLogout}>
        Log out
      </Button>
      {logoutError && <Text style={styles.logoutError}>{logoutError}</Text>}

      <View style={{ height: Spacing.xxxl }} />

      <View style={styles.linksRow}>
        {LINKS.map((l) => (
          <Pressable key={l.url} onPress={() => Linking.openURL(l.url)} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.bluvfi.xyz')}
        style={[styles.linkButton, { marginTop: Spacing.sm }]}
      >
        <Text style={styles.linkButtonText}>Get it on Google Play</Text>
      </Pressable>

      <View style={styles.legalRow}>
        {LEGAL_LINKS.map((l, i) => (
          <View key={l.url} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {i > 0 && <Text style={styles.legalDot}>·</Text>}
            <Pressable onPress={() => Linking.openURL(l.url)}>
              <Text style={styles.legalLink}>{l.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <PaywallSheet
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => setIsPremium(true)}
        featureName="Bluvfi Premium"
      />
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.bg2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  avatarInitial: {
    ...Type.h1,
    color: Colors.tx0,
  },
  email: {
    ...Type.body,
    color: Colors.tx1,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg1,
    borderRadius: 14,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  addressLabel: {
    ...Type.label,
    color: Colors.tx2,
  },
  addressValue: {
    ...Type.small,
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx0,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  balanceLabel: {
    ...Type.small,
    color: Colors.tx1,
  },
  balanceValue: {
    ...Type.small,
    fontFamily: Type.amount.fontFamily,
    color: Colors.tx0,
  },
  premiumBadge: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    backgroundColor: 'rgba(201,168,76,0.08)',
  },
  logoutError: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  linksRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  linkButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  linkButtonText: {
    ...Type.small,
    color: Colors.tx1,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
    flexWrap: 'wrap',
  },
  legalLink: {
    ...Type.label,
    color: Colors.tx2,
  },
  legalDot: {
    ...Type.label,
    color: Colors.tx2,
    marginHorizontal: Spacing.xs,
  },
});
