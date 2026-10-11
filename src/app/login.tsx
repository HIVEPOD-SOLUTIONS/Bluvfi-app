import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { WalletRiskModal } from '@/components/wallet/WalletRiskModal';
import { useAuth } from '@/lib/auth-context';
import { isSeekerDevice } from '@/lib/seeker';
import { acceptWalletRisk, hasAcceptedWalletRisk } from '@/lib/wallet-risk';

const RESEND_COOLDOWN_S = 30;

/** Privy reports a dismissed OAuth browser as `login_with_oauth_was_cancelled_by_user`. */
function isOAuthCancelled(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === 'string' && code.endsWith('was_cancelled_by_user');
}

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

/** Solana's mark: three slanted bars. */
function SolanaIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M5 16.5h14.2a.6.6 0 01.42 1.02l-2.7 2.7a.9.9 0 01-.63.26H2.1a.4.4 0 01-.28-.68l2.7-2.7A.9.9 0 015 16.5z" fill="#14F195" />
      <Path d="M5 3.5a.9.9 0 01.63-.26H19.9a.4.4 0 01.28.68l-2.7 2.7a.9.9 0 01-.63.26H2.3a.6.6 0 01-.42-1.02l2.7-2.7z" fill="#9945FF" />
      <Path d="M19.5 9.9l-2.7-2.7a.9.9 0 00-.63-.26H2.1a.4.4 0 00-.28.68l2.7 2.7a.9.9 0 00.63.26h14.2a.6.6 0 00.42-1.02l.06-.06z" fill="#00C2FF" />
    </Svg>
  );
}

/** Friendly message for users; the underlying error is always logged and, in dev builds, shown too. */
function describeError(friendly: string, err: unknown): string {
  console.warn('[login]', friendly, err);
  if (!__DEV__) return friendly;
  const detail = err instanceof Error ? err.message : String(err);
  return `${friendly}\n(${detail})`;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { mode, next } = useLocalSearchParams<{ mode?: string; next?: string }>();
  const isLogin = mode === 'login';
  const {
    isAuthenticated,
    sendCode,
    loginWithCode,
    otpState,
    loginWithGoogle,
    googleState,
    loginWithPasskey,
    signupWithPasskey,
    passkeyState,
    walletLoginAvailable,
    loginWithSolanaWallet,
  } = useAuth();

  // AuthGate swaps (tabs) in when the user signs in, but that swap doesn't always move the visible
  // screen off this one (same quirk as on logout). If Privy has a session, go to the app explicitly —
  // otherwise the user is left here, and re-submitting the code errors with "Already logged in".
  useEffect(() => {
    if (!isAuthenticated) return;
    router.replace(next === 'creator' ? '/creator' : '/(tabs)');
  }, [isAuthenticated, next]);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const sending = otpState.status === 'sending-code';
  const submitting = otpState.status === 'submitting-code';
  const passkeyBusy = passkeyState.status === 'awaiting-passkey' || passkeyState.status === 'submitting-response';

  const googleBusy = googleState.status === 'loading';

  // Sign in with a Solana wallet app (Android, Mobile Wallet Adapter). On a Seeker it leads, since Seed Vault is built in.
  const [walletBusy, setWalletBusy] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const onSeeker = isSeekerDevice();

  const runWalletLogin = async () => {
    setError(null);
    setWalletBusy(true);
    try {
      await loginWithSolanaWallet();
      // Success: auth state flips and the isAuthenticated effect above moves the user into the app.
    } catch (err) {
      const e = err as { name?: string; kind?: string; message?: string };
      if (e?.kind === 'declined') return; // backing out of the wallet app is a choice, not a failure
      // The adapter's own errors ("No compatible wallet found…") already say what to do.
      setError(e?.name === 'WalletError' ? (e.message ?? null) : describeError("Couldn't sign in with your wallet. Try again or use email.", err));
    } finally {
      setWalletBusy(false);
    }
  };

  const handleWallet = async () => {
    // First wallet-only sign-in on this device: explain what it means for getting the account back.
    if (await hasAcceptedWalletRisk()) await runWalletLogin();
    else setRiskOpen(true);
  };

  const walletButton = walletLoginAvailable ? (
    <Button
      variant={onSeeker ? 'primary' : 'outline'}
      onPress={handleWallet}
      loading={walletBusy}
      disabled={sending || passkeyBusy || googleBusy}
      iconLeft={<SolanaIcon />}
      fullWidth
    >
      {onSeeker ? 'Continue with Seed Vault' : 'Continue with Solana wallet'}
    </Button>
  ) : null;

  const handleGoogle = async () => {
    setError(null);
    try {
      await loginWithGoogle();
      // Success: auth state flips and the isAuthenticated effect above moves the user into the app.
    } catch (err) {
      // Closing the Google sheet is a choice, not a failure — say nothing.
      if (isOAuthCancelled(err)) return;
      setError(describeError("Couldn't sign in with Google. Try again or use email.", err));
    }
  };

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
    setNotice(null);
    try {
      await sendCode(email.trim());
      setStep('code');
      setResendIn(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(describeError("Couldn't send code — check the email address and try again.", err));
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    try {
      await sendCode(email.trim());
      setCode('');
      setResendIn(RESEND_COOLDOWN_S);
      setNotice('A new code is on its way.');
    } catch (err) {
      setError(describeError("Couldn't resend the code. Try again in a moment.", err));
    }
  };

  // Count the resend cooldown down once a second.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

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
              {onSeeker && walletButton}
              <Button
                variant="outline"
                onPress={handleGoogle}
                loading={googleBusy}
                disabled={sending || passkeyBusy || walletBusy}
                iconLeft={<GoogleIcon />}
                fullWidth
              >
                Continue with Google
              </Button>
              {!onSeeker && walletButton}

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

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
              <Button
                onPress={handleSendCode}
                disabled={!email.trim() || sending || googleBusy}
                loading={sending}
                fullWidth
              >
                Continue with email
              </Button>

              <Button variant="outline" onPress={handlePasskeyLogin} loading={passkeyBusy} disabled={googleBusy} fullWidth>
                Sign in with passkey
              </Button>
              <Button variant="ghost" size="sm" onPress={handlePasskeySignup} disabled={passkeyBusy || googleBusy}>
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
              <Button variant="ghost" size="sm" onPress={handleResend} disabled={resendIn > 0 || sending} loading={sending}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                  setNotice(null);
                }}
              >
                Use a different email
              </Button>
              {notice && <Text style={styles.notice}>{notice}</Text>}
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </View>

      <WalletRiskModal
        open={riskOpen}
        onCancel={() => setRiskOpen(false)}
        onContinue={async () => {
          setRiskOpen(false);
          await acceptWalletRisk();
          await runWalletLogin();
        }}
      />
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
  notice: {
    ...Type.body,
    color: Colors.sage,
    textAlign: 'center',
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
  },
});
