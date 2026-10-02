import * as Clipboard from 'expo-clipboard';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function FundWalletCard() {
  const { evmAddress, solanaAddress } = useAuth();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Fund your wallet</Text>
      <Text style={styles.subtitle}>Send USDC to either address below, or visit Profile to manage wallets.</Text>

      {evmAddress && (
        <Pressable onPress={() => Clipboard.setStringAsync(evmAddress)} style={styles.row}>
          <Text style={styles.chainLabel}>Base (EVM)</Text>
          <Text style={styles.address}>{short(evmAddress)}</Text>
        </Pressable>
      )}
      {solanaAddress && (
        <Pressable onPress={() => Clipboard.setStringAsync(solanaAddress)} style={styles.row}>
          <Text style={styles.chainLabel}>Solana</Text>
          <Text style={styles.address}>{short(solanaAddress)}</Text>
        </Pressable>
      )}
      <Text style={styles.hint}>Tap an address to copy</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg1,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    maxWidth: '90%',
    alignSelf: 'flex-start',
    gap: Spacing.sm,
  },
  title: {
    ...Type.h3,
    color: Colors.tx0,
  },
  subtitle: {
    ...Type.small,
    color: Colors.tx1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg0,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  chainLabel: {
    ...Type.small,
    color: Colors.tx1,
  },
  address: {
    ...Type.small,
    fontFamily: Type.amount.fontFamily,
    color: Colors.sage,
  },
  hint: {
    ...Type.label,
    color: Colors.tx2,
  },
});
