import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { sendUsdcEvm } from '@/lib/payments/evm';
import { sendUsdcSolana } from '@/lib/payments/solana';
import type { OfframpBankAccount, OfframpOrder, OfframpPair } from '@/lib/banking-types';

/** The only offramp provider bluvfi has configured today — UPI (India) fiat rails. */
const PROVIDER = 'credible';

type Step = 'bank-account' | 'pair' | 'order' | 'deposit' | 'done';

interface OfframpSheetProps {
  open: boolean;
  onClose: () => void;
}

export function OfframpSheet({ open, onClose }: OfframpSheetProps) {
  const apiCall = useApiClient();
  const { userId, evmAddress, solanaAddress } = useAuth();
  const ethereum = useEmbeddedEthereumWallet();
  const solana = useEmbeddedSolanaWallet();

  const [step, setStep] = useState<Step>('bank-account');
  const [accounts, setAccounts] = useState<OfframpBankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [pairs, setPairs] = useState<OfframpPair[]>([]);
  const [pair, setPair] = useState<OfframpPair | null>(null);
  const [amount, setAmount] = useState('');

  const [order, setOrder] = useState<OfframpOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    apiCall<{ data: OfframpBankAccount[] }>(`/api/banking/${PROVIDER}/offramp/bank-accounts`, {
      query: { customer_id: userId },
    })
      .then((res) => setAccounts(res.data ?? []))
      .catch(() => {});
  }, [open, userId, apiCall]);

  const reset = () => {
    setStep('bank-account');
    setBankAccountId(null);
    setAccountNumber('');
    setIfsc('');
    setPair(null);
    setAmount('');
    setOrder(null);
    setError(null);
    setTxHash(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAddBankAccount = useCallback(async () => {
    if (!accountNumber || !ifsc || !firstName || !lastName) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiCall<{ data: OfframpBankAccount }>(`/api/banking/${PROVIDER}/offramp/bank-accounts`, {
        method: 'POST',
        body: { first_name: firstName, last_name: lastName, account_number: accountNumber, ifsc },
      });
      setBankAccountId(res.data.bank_account_id);
      setStep('pair');
      apiCall<{ data: OfframpPair[] }>(`/api/banking/${PROVIDER}/offramp/pairs`)
        .then((r) => setPairs(r.data ?? []))
        .catch(() => {});
    } catch {
      setError('Could not add that bank account. Check the details and try again.');
    } finally {
      setBusy(false);
    }
  }, [accountNumber, ifsc, firstName, lastName, apiCall]);

  const selectExistingAccount = (acc: OfframpBankAccount) => {
    setBankAccountId(acc.bank_account_id);
    setStep('pair');
    apiCall<{ data: OfframpPair[] }>(`/api/banking/${PROVIDER}/offramp/pairs`)
      .then((r) => setPairs(r.data ?? []))
      .catch(() => {});
  };

  const handleCreateOrder = useCallback(async () => {
    if (!pair || !amount || !bankAccountId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiCall<{ data: OfframpOrder }>(`/api/banking/${PROVIDER}/offramp/order`, {
        method: 'POST',
        body: { pair_id: pair.pair_id, amount: Number(amount), first_name: firstName, last_name: lastName, bank_account_id: bankAccountId },
      });
      setOrder(res.data);
      setStep('deposit');
    } catch {
      setError('Could not create the order. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [pair, amount, bankAccountId, firstName, lastName, apiCall]);

  const handleSendDeposit = useCallback(async () => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const isSolana = order.blockchain.toLowerCase().includes('sol');
      let hash: string;
      if (isSolana) {
        const wallet = solana.wallets?.[0];
        if (!wallet || !solanaAddress) throw new Error('No Solana wallet connected');
        const provider = await wallet.getProvider();
        hash = await sendUsdcSolana(provider, solanaAddress, order.deposit_address, order.input_amount);
      } else {
        const wallet = ethereum.wallets[0];
        if (!wallet || !evmAddress) throw new Error('No EVM wallet connected');
        const provider = await wallet.getProvider();
        hash = await sendUsdcEvm(provider, evmAddress, order.deposit_address, order.input_amount);
      }
      setTxHash(hash);
      setStep('done');
    } catch (err) {
      setError((err as Error)?.message ?? 'Deposit failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [order, solana, ethereum, solanaAddress, evmAddress]);

  return (
    <BottomSheet open={open} onClose={handleClose} title="Withdraw to bank" snapPoints={['85%']}>
      {step === 'bank-account' && (
        <View>
          {accounts.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Use a saved account</Text>
              {accounts.map((acc) => (
                <Pressable key={acc.bank_account_id} onPress={() => selectExistingAccount(acc)} style={styles.accountRow}>
                  <Text style={styles.accountText}>{acc.bank_name}</Text>
                  <Text style={styles.accountSub}>•••• {acc.account_number.slice(-4)}</Text>
                </Pressable>
              ))}
              <View style={{ height: Spacing.lg }} />
              <Text style={styles.sectionLabel}>Or add a new one</Text>
            </>
          )}
          <TextInput style={styles.input} placeholder="First name" placeholderTextColor={Colors.tx2} value={firstName} onChangeText={setFirstName} />
          <View style={{ height: Spacing.sm }} />
          <TextInput style={styles.input} placeholder="Last name" placeholderTextColor={Colors.tx2} value={lastName} onChangeText={setLastName} />
          <View style={{ height: Spacing.sm }} />
          <TextInput style={styles.input} placeholder="Account number" placeholderTextColor={Colors.tx2} value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" />
          <View style={{ height: Spacing.sm }} />
          <TextInput style={styles.input} placeholder="IFSC code" placeholderTextColor={Colors.tx2} value={ifsc} onChangeText={setIfsc} autoCapitalize="characters" />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={{ height: Spacing.lg }} />
          <Button
            variant="secondary"
            fullWidth
            loading={busy}
            disabled={!accountNumber || !ifsc || !firstName || !lastName}
            onPress={handleAddBankAccount}
          >
            Continue
          </Button>
        </View>
      )}

      {step === 'pair' && (
        <View>
          <Text style={styles.sectionLabel}>Choose a currency pair</Text>
          {pairs.map((p) => (
            <Pressable key={p.pair_id} onPress={() => { setPair(p); setStep('order'); }} style={styles.accountRow}>
              <Text style={styles.accountText}>{p.input_currency} → {p.output_currency}</Text>
              <Text style={styles.accountSub}>{p.blockchain}</Text>
            </Pressable>
          ))}
          {pairs.length === 0 && <Text style={styles.hint}>No pairs available right now.</Text>}
        </View>
      )}

      {step === 'order' && pair && (
        <View>
          <Pressable onPress={() => setStep('pair')} style={{ marginBottom: Spacing.md }}>
            <Text style={styles.backLink}>← Choose a different pair</Text>
          </Pressable>
          <Text style={styles.sectionLabel}>{pair.input_currency} → {pair.output_currency}</Text>
          <TextInput
            style={styles.input}
            placeholder={`Amount (${pair.input_currency})`}
            placeholderTextColor={Colors.tx2}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={{ height: Spacing.lg }} />
          <Button variant="secondary" fullWidth loading={busy} disabled={!amount} onPress={handleCreateOrder}>
            Continue
          </Button>
        </View>
      )}

      {step === 'deposit' && order && (
        <View>
          <Text style={styles.sectionLabel}>Send crypto to complete withdrawal</Text>
          <View style={styles.orderCard}>
            <Text style={styles.orderAmount}>{order.input_amount} {order.input_currency}</Text>
            <Text style={styles.orderSub}>on {order.blockchain}</Text>
            <Text style={styles.depositAddress}>{order.deposit_address}</Text>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button variant="secondary" fullWidth loading={busy} onPress={handleSendDeposit}>
            Send from my wallet
          </Button>
        </View>
      )}

      {step === 'done' && (
        <View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
          <Text style={styles.sectionLabel}>Deposit sent ✓</Text>
          <Text style={styles.hint}>
            {txHash ? `Tx: ${txHash.slice(0, 10)}…` : ''} Your bank payout will arrive once the deposit confirms.
          </Text>
          <View style={{ height: Spacing.lg }} />
          <Button variant="ghost" fullWidth onPress={handleClose}>
            Done
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
    textAlign: 'center',
  },
  accountRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  accountText: {
    ...Type.h3,
    color: Colors.tx0,
  },
  accountSub: {
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
    gap: 4,
  },
  orderAmount: {
    ...Type.amount,
    color: Colors.tx0,
  },
  orderSub: {
    ...Type.small,
    color: Colors.tx1,
  },
  depositAddress: {
    ...Type.small,
    fontFamily: Type.amount.fontFamily,
    color: Colors.sage,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
