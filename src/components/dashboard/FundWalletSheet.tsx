import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';

interface FundWalletSheetProps {
  open: boolean;
  onClose: () => void;
  evmAddress?: string;
  solanaAddress?: string;
}

function AddressRow({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Pressable onPress={copy} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.address} numberOfLines={1} ellipsizeMode="middle">
          {address}
        </Text>
      </View>
      <Text style={[styles.copy, copied && { color: Colors.sage }]}>{copied ? 'Copied' : 'Copy'}</Text>
    </Pressable>
  );
}

/** Where to send funds: the user's EVM (6 chains) and Solana wallet addresses, tap to copy. */
export function FundWalletSheet({ open, onClose, evmAddress, solanaAddress }: FundWalletSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Fund your wallet" snapPoints={['45%']}>
      <Text style={styles.subtitle}>Send USDC or USDT to either address. Tap an address to copy it.</Text>
      <View style={styles.list}>
        {evmAddress && <AddressRow label="EVM (Base, Ethereum, Arbitrum…)" address={evmAddress} />}
        {solanaAddress && <AddressRow label="Solana" address={solanaAddress} />}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...Type.body,
    color: Colors.tx1,
    marginBottom: Spacing.lg,
  },
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg0,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
  },
  label: {
    ...Type.label,
    color: Colors.tx2,
    marginBottom: 4,
  },
  address: {
    ...Type.body,
    fontFamily: Type.label.fontFamily,
    color: Colors.tx0,
  },
  copy: {
    ...Type.small,
    color: Colors.tx1,
  },
});
