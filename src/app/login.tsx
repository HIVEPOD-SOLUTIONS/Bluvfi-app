import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

/** Friendly message for users; the underlying error is always logged and, in dev builds, shown too. */
function describeError(friendly: string, err: unknown): string {
  console.warn('[login]', friendly, err);
  if (!__DEV__) return friendly;
  const detail = err instanceof Error ? err.message : String(err);
  return `${friendly}\n(${detail})`;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isLogin = mode === 'login';
  const { sendCode, loginWithCode, otpState, loginWithPasskey, signupWithPasskey, passkeyState } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sending = otpState.status === 'sending-code';
  const submitting = otpState.status === 'submitting-code';
  const passkeyBusy = passkeyState.status === 'awaiting-passkey' || passkeyState.status === 'submitting-response';

  const handlePasskeyLogin = async () => {
    setError(null);
    try {
      await loginWithPasskey();
    } catch (err) {
      setError(describeError("No account found for that passkey — try 'Create a passkey' below, or sign in with email.", err));
    }
  };

  const handlePasskeySignup = async () => {
    setError(null);
    try {
      await signupWithPasskey();
    } catch (err) {
      setError(describeError("Couldn't create a passkey. Try again or use email.", err));
    }
  };

  const handleSendCode = async () => {
    setError(null);
    try {
      await sendCode(email.trim());
      setStep('code');
    } catch (err) {
      setError(describeError("Couldn't send code — check the email address and try again.", err));
    }
  };

  const handleSubmitCode = async () => {
    setError(null);
    try {
      await loginWithCode(email.trim(), code.trim());
    } catch (err) {
      setError(describeError('Invalid code — try again.', err));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.back, { top: insets.top + Spacing.md }]}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.content}>
        <Logo size={56} />
        <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.subtitle}>
          {isLogin ? 'Log in to your Bluvfi account.' : 'Your AI finance assistant is one step away.'}
        </Text>

        <View style={styles.form}>
          {step === 'email' ? (
            <>
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
              <Button onPress={handleSendCode} disabled={!email.trim() || sending} loading={sending} fullWidth>
                Continue with email
              </Button>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Button variant="outline" onPress={handlePasskeyLogin} loading={passkeyBusy} fullWidth>
                Sign in with passkey
              </Button>
              <Button variant="ghost" size="sm" onPress={handlePasskeySignup} disabled={passkeyBusy}>
                Create a passkey instead
              </Button>
            </>
          ) : (
            <>
              <Text style={styles.codeHint}>Enter the code sent to {email}</Text>
              <TextInput
                style={styles.input}
                placeholder="123456"
                placeholderTextColor={Colors.tx2}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoFocus
              />
              <Button onPress={handleSubmitCode} disabled={!code.trim() || submitting} loading={submitting} fullWidth>
                Verify
              </Button>
              <Button variant="ghost" size="sm" onPress={() => setStep('email')}>
                Use a different email
              </Button>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg0,
  },
  back: {
    position: 'absolute',
    left: Spacing.xl,
    zIndex: 10,
  },
  backText: {
    ...Type.body,
    fontSize: 14,
    color: Colors.tx1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
  },
  title: {
    ...Type.h1,
    color: Colors.tx0,
    marginTop: Spacing.md,
  },
  subtitle: {
    ...Type.body,
    color: Colors.tx1,
    marginBottom: Spacing.xxxl,
  },
  form: {
    width: '100%',
    gap: Spacing.md,
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
  codeHint: {
    ...Type.body,
    color: Colors.tx1,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    ...Type.small,
    color: Colors.tx2,
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
  },
});
