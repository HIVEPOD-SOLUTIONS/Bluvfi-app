import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useBalances } from '@/hooks/use-balances';
import { useAuth } from '@/lib/auth-context';
import { fetchWalletBalances } from '@/lib/mwa';
import { useConnectedWallet } from '@/lib/wallet-connection';

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * "Pay from" choice for Solana payments: the Bluvfi wallet or the wallet the user connected through Mobile Wallet
 * Adapter, each with its USDC balance. Renders nothing until a wallet is connected, so people who never connect one
 * never see it. The choice is shared by every payment card (it lives in the wallet connection).
 */
export function PayFromPicker({ needed }: { /** USDC the payment needs, to flag a wallet that can't cover it. */ needed?: number }) {
  const { wallet, source, setSource } = useConnectedWallet();
  const { solanaAddress } = useAuth();
  const bluvfi = useBalances(undefined, solanaAddress);
  const external = useQuery({
    queryKey: ['mwa-balances', wallet?.address],
    queryFn: () => fetchWalletBalances(wallet!.address),
    enabled: !!wallet,
    refetchInterval: 20_000,
  });
  if (!wallet) return null;

  const options = [
    { key: 'bluvfi' as const, name: 'Bluvfi wallet', balance: bluvfi.data?.solUsdc },
    { key: 'wallet' as const, name: wallet.name, balance: external.data?.usdc },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Pay from</Text>
      <View style={styles.row}>
        {options.map((o) => {
          const active = source === o.key;
          const short = needed != null && o.balance != null && o.balance + 1e-9 < needed;
          return (
            <Pressable key={o.key} onPress={() => setSource(o.key)} style={[styles.option, active && styles.optionActive]} accessibilityRole="radio" accessibilityState={{ selected: active }}>
              <View style={styles.optionTop}>
                <View style={[styles.radio, active && styles.radioOn]}>{active ? <View style={styles.radioDot} /> : null}</View>
                <Text style={styles.name} numberOfLines={1}>
                  {o.name}
                </Text>
              </View>
              <Text style={[styles.balance, short && { color: Colors.amber }]}>{o.balance != null ? usd(o.balance) : '—'} USDC{short ? ' · low' : ''}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...Type.small, color: Colors.tx1 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  option: {
    flex: 1,
    gap: 4,
    backgroundColor: Colors.bg0,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
  },
  optionActive: { borderColor: Colors.sage, backgroundColor: 'rgba(143,174,130,0.08)' },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.tx2, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.sage },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.sage },
  name: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx0, flex: 1 },
  balance: { ...Type.small, fontSize: 11, color: Colors.tx1 },
});
