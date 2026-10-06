import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path, Rect } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useConnectedWallet } from '@/lib/wallet-connection';
import { RecoveryCard } from '@/components/wallet/RecoveryCard';
import { useBalances } from '@/hooks/use-balances';
import { useXrpBalance, useXrplWallet } from '@/hooks/use-xrpl';
import { hasEntitlement } from '@/lib/revenuecat';

/** Round initial-letter avatar shown in the Home header and at the top of the profile sidebar. */
export function Avatar({ email, size = 36 }: { email?: string | null; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.42 }]}>{email?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

/** Whether the signed-in user holds the "premium" entitlement. Resolves to false when RevenueCat is unavailable. */
export function usePremium() {
  const [isPremium, setIsPremium] = useState(false);
  useEffect(() => {
    hasEntitlement('premium').then(setIsPremium).catch(() => {});
  }, []);
  return { isPremium, setIsPremium };
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M3 8.5l3 3 7-7" stroke={Colors.sage} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ) : (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Rect x={5.5} y={5.5} width={8} height={8} rx={1.5} stroke={Colors.tx2} strokeWidth={1.3} />
      <Path d="M10.5 3.5v-.5a1.5 1.5 0 00-1.5-1.5H4A1.5 1.5 0 002.5 3v5A1.5 1.5 0 004 9.5h.5" stroke={Colors.tx2} strokeWidth={1.3} />
    </Svg>
  );
}

function AddressRow({ label, address }: { label: string; address: string | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={styles.addressBlock}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Pressable onPress={copy} hitSlop={8} style={styles.addressRow}>
        <Text style={styles.addressValue}>{short}</Text>
        <CopyIcon copied={copied} />
      </Pressable>
    </View>
  );
}

function BalanceRow({ label, amount, loading }: { label: string; amount: number; loading: boolean }) {
  return (
    <View style={styles.balanceRow}>
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={styles.balanceValue}>{loading ? '…' : formatUsd(amount)}</Text>
    </View>
  );
}

function XIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        fill={Colors.tx0}
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </Svg>
  );
}
function TelegramIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        fill={Colors.tx0}
        d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"
      />
    </Svg>
  );
}
function PlayIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M5 3.5v17l15-8.5z" stroke={Colors.tx0} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

const LINKS = [
  { label: '@bluvfi', url: 'https://x.com/bluvfi', icon: <XIcon /> },
  { label: 'Telegram', url: 'https://t.me/+KXpDSUAnfg44MTg0', icon: <TelegramIcon /> },
];

/** "$0", "$0.85", "$12.5" — whole numbers without trailing zeros, like the web sidebar. */
const formatUsd = (n: number) => `$${Number(n.toFixed(2))}`;

const LEGAL_LINKS = [
  { label: 'Terms', url: 'https://waitlist.bluvfi.xyz/terms' },
  { label: 'Privacy Policy', url: 'https://waitlist.bluvfi.xyz/privacy' },
  { label: 'bluvfi.xyz', url: 'https://waitlist.bluvfi.xyz' },
];

interface ProfileContentProps {
  isPremium: boolean;
  onUpgrade: () => void;
  /** Called right before navigating away on logout (e.g. to dismiss the sidebar). */
  onBeforeLogout?: () => void;
}

/** Account details (email, wallets, balances), premium status, social/legal links and log out. */
export function ProfileContent({ isPremium, onUpgrade, onBeforeLogout }: ProfileContentProps) {
  const { email, displayName, evmAddress, solanaAddress, logout } = useAuth();
  const { data: balances, isLoading: balancesLoading } = useBalances(evmAddress, solanaAddress);
  const { wallet: connectedWallet } = useConnectedWallet();
  const xrpl = useXrplWallet();
  const xrplBalance = useXrpBalance(!!xrpl.address);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      onBeforeLogout?.();
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
    <View style={styles.root}>
      <View>
      <View style={styles.header}>
        <Avatar email={displayName ?? email ?? connectedWallet?.address} size={52} />
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName ?? 'Signed in'}
          </Text>
          {email ? (
            <Text style={styles.email} numberOfLines={1}>
              {email}
            </Text>
          ) : connectedWallet ? (
            <Text style={styles.email} numberOfLines={1}>
              Signed in with {connectedWallet.name}
            </Text>
          ) : null}
        </View>
      </View>

      <RecoveryCard />

      <AddressRow label="EVM WALLET" address={evmAddress} />
      <AddressRow label="SOLANA WALLET" address={solanaAddress} />
      {connectedWallet ? <AddressRow label={`CONNECTED · ${connectedWallet.name.toUpperCase()}`} address={connectedWallet.address} /> : null}
      {!xrpl.unavailable && (
        xrpl.address ? (
          <AddressRow label="XRPL WALLET" address={xrpl.address} />
        ) : (
          <View style={styles.addressBlock}>
            <Text style={styles.sectionLabel}>XRPL WALLET</Text>
            {xrpl.error ? (
              <Pressable onPress={() => xrpl.refetch()} hitSlop={8}>
                <Text style={styles.xrplError}>Couldn't load · Retry</Text>
              </Pressable>
            ) : (
              <Text style={styles.addressValue}>…</Text>
            )}
          </View>
        )
      )}

      {(evmAddress || solanaAddress || xrpl.address) && (
        <View style={styles.balances}>
          <Text style={styles.sectionLabel}>BALANCES</Text>
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
          {xrpl.address && !xrplBalance.orphaned && (
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>XRP</Text>
              <Text style={styles.balanceValue}>
                {xrplBalance.balance === null ? '…' : `${xrplBalance.balance.toFixed(4)} XRP`}
              </Text>
            </View>
          )}
        </View>
      )}

      </View>

      {/* Footer: pinned to the bottom, so any spare height sits between the balances and Premium. */}
      <View style={styles.footer}>
      {isPremium ? (
        <View style={styles.premiumBadge}>
          <Badge variant="premium">Bluvfi Premium</Badge>
        </View>
      ) : (
        <Button variant="premium" fullWidth onPress={onUpgrade}>
          Upgrade to Premium
        </Button>
      )}

      <View style={{ height: Spacing.lg }} />

      <View style={styles.linksRow}>
        {LINKS.map((l) => (
          <Pressable key={l.url} onPress={() => Linking.openURL(l.url)} style={styles.linkButton}>
            {l.icon}
            <Text style={styles.linkButtonText}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.bluvfi.xyz')}
        style={[styles.linkButton, { marginTop: Spacing.sm, flex: 0 }]}
      >
        <PlayIcon />
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

      <View style={{ height: Spacing.lg }} />

      <Button variant="destructive" fullWidth loading={loggingOut} onPress={handleLogout}>
        Log out
      </Button>
      {logoutError && <Text style={styles.logoutError}>{logoutError}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: Colors.bg2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...Type.h2,
    color: Colors.tx0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
    marginBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  root: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  footer: {
    marginTop: Spacing.xl,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...Type.h2,
    color: Colors.tx0,
  },
  email: {
    ...Type.small,
    color: Colors.tx1,
  },
  sectionLabel: {
    ...Type.label,
    color: Colors.tx2,
  },
  addressBlock: {
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'flex-start',
  },
  addressValue: {
    ...Type.body,
    fontFamily: Fonts.mono,
    color: Colors.tx0,
  },
  balances: {
    gap: Spacing.xs,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  balanceLabel: {
    ...Type.label,
    color: Colors.tx1,
  },
  balanceValue: {
    ...Type.h3,
    color: Colors.tx0,
  },
  premiumBadge: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    backgroundColor: 'rgba(201,168,76,0.08)',
  },
  xrplError: {
    ...Type.small,
    color: Colors.redAlert,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: 999,
    backgroundColor: Colors.bg2,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
  },
  linkButtonText: {
    ...Type.body,
    color: Colors.tx0,
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
