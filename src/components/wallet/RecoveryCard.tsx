import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useConnectedWallet } from '@/lib/wallet-connection';

/**
 * The standing reminder for a wallet-only account: what is at stake, and a one-tap way to add an email or Google as a
 * second way in. Shows nothing once the account has either. `compact` is the slimmer variant for the home screen,
 * which links people to the full card in Profile.
 */
export function RecoveryCard({ compact = false, onOpenProfile }: { compact?: boolean; onOpenProfile?: () => void }) {
  const { isWalletOnly, sendLinkEmailCode, linkEmailWithCode, linkEmailState, linkGoogle } = useAuth();
  const { wallet } = useConnectedWallet();
  const [step, setStep] = useState<'idle' | 'email' | 'code'>('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  if (!isWalletOnly) return null;

  const name = wallet?.name ?? 'your wallet';
  const sending = linkEmailState.status === 'sending-code';
  const submitting = linkEmailState.status === 'submitting-code';

  if (compact) {
    return (
      <View style={styles.compact}>
        <Text style={styles.compactText}>
          Wallet-only account: if you lose access to {name}, you lose your account. <Text style={styles.link} onPress={onOpenProfile}>Add a backup ›</Text>
        </Text>
      </View>
    );
  }

  const sendCode = async () => {
    setError(null);
    try {
      await sendLinkEmailCode(email.trim());
      setStep('code');
    } catch {
      setError("Couldn't send the code. Check the email address and try again.");
    }
  };
  const verify = async () => {
    setError(null);
    try {
      await linkEmailWithCode(email.trim(), code.trim());
      // The account now has an email, so this card disappears on its own.
    } catch {
      setError('That code is not right, or this email already belongs to another Bluvfi account.');
    }
  };
  const google = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await linkGoogle();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (!(typeof code === 'string' && code.endsWith('was_cancelled_by_user'))) {
        setError("Couldn't add Google. It may already belong to another Bluvfi account.");
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>⚠️ Your account is wallet-only</Text>
      <Text style={styles.body}>
        If you lose access to {name} (a lost phone, a deleted app, a forgotten recovery phrase), you can't sign in and the money in your Bluvfi wallet stays locked. Bluvfi
        can't recover it for you.
      </Text>
      <Text style={styles.strong}>Add a second way in so that can't happen:</Text>

      {step === 'idle' && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button fullWidth onPress={() => setStep('email')}>
              Add email
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button fullWidth variant="outline" loading={googleBusy} onPress={google}>
              Add Google
            </Button>
          </View>
        </View>
      )}

      {step === 'email' && (
        <View style={{ gap: Spacing.sm }}>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.tx2}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button fullWidth disabled={!email.trim()} loading={sending} onPress={sendCode}>
                Send code
              </Button>
            </View>
            <Button variant="ghost" onPress={() => setStep('idle')}>
              Cancel
            </Button>
          </View>
        </View>
      )}

      {step === 'code' && (
        <View style={{ gap: Spacing.sm }}>
          <Text style={styles.body}>Enter the code we sent to {email}.</Text>
          <TextInput style={styles.input} placeholder="123456" placeholderTextColor={Colors.tx2} value={code} onChangeText={setCode} keyboardType="number-pad" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button fullWidth disabled={!code.trim()} loading={submitting} onPress={verify}>
                Verify
              </Button>
            </View>
            <Button variant="ghost" onPress={() => setStep('email')}>
              Back
            </Button>
          </View>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(232,168,56,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,56,0.3)',
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  compact: {
    backgroundColor: 'rgba(232,168,56,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,56,0.3)',
    borderRadius: Radii.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  compactText: { ...Type.small, color: Colors.amber },
  link: { fontFamily: Fonts.sansSemiBold, textDecorationLine: 'underline' },
  title: { ...Type.h3, color: Colors.amber },
  body: { ...Type.small, color: Colors.tx1 },
  strong: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    backgroundColor: Colors.bg2,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    color: Colors.tx0,
    fontFamily: Type.body.fontFamily,
    fontSize: 14,
  },
  error: { ...Type.small, color: Colors.redAlert },
});
