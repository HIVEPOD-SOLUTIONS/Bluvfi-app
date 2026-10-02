import { createContext, useCallback, useContext, useEffect, ReactNode } from 'react';
import {
  PrivyProvider as PrivySDKProvider,
  usePrivy,
  useLoginWithEmail,
  useEmbeddedEthereumWallet,
  useEmbeddedSolanaWallet,
} from '@privy-io/expo';
import { useLoginWithPasskey, useSignupWithPasskey } from '@privy-io/expo/passkey';

/**
 * Relying-party domain for passkeys — matches bluvfi web's domain. Passkey
 * login additionally requires a ONE-TIME Privy dashboard + domain step this
 * code can't perform: registering this app's bundle ID/package under that
 * relying party, and publishing `.well-known/apple-app-site-association`
 * (iOS) and `assetlinks.json` (Android) on bluvfi.xyz with this app's
 * identifiers. Until that's done, loginWithPasskey will fail even though
 * the code path itself is correct.
 */
const PASSKEY_RELYING_PARTY = 'bluvfi.xyz';

interface AuthContextType {
  isReady: boolean;
  isAuthenticated: boolean;
  userId: string | undefined;
  firstName: string | undefined;
  email: string | undefined;
  evmAddress: string | undefined;
  solanaAddress: string | undefined;
  sendCode: (email: string) => Promise<void>;
  loginWithCode: (email: string, code: string) => Promise<void>;
  otpState: ReturnType<typeof useLoginWithEmail>['state'];
  loginWithPasskey: () => Promise<void>;
  signupWithPasskey: () => Promise<void>;
  passkeyState: ReturnType<typeof useLoginWithPasskey>['state'];
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function AuthBridge({ children }: { children: ReactNode }) {
  const { user, isReady, logout, getAccessToken } = usePrivy();
  const { sendCode: sdkSendCode, loginWithCode: sdkLoginWithCode, state: otpState } = useLoginWithEmail();
  const { loginWithPasskey: sdkLoginWithPasskey, state: passkeyState } = useLoginWithPasskey();
  const { signupWithPasskey: sdkSignupWithPasskey } = useSignupWithPasskey();
  const ethereum = useEmbeddedEthereumWallet();
  const solana = useEmbeddedSolanaWallet();

  const isAuthenticated = !!user;

  // Mirrors bluvfi web's embeddedWallets.{ethereum,solana}.createOnLogin: "users-without-wallets".
  useEffect(() => {
    if (!isAuthenticated) return;
    if (ethereum.wallets.length === 0) ethereum.create().catch(() => {});
  }, [isAuthenticated, ethereum]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (solana.wallets && solana.wallets.length === 0 && solana.create) {
      solana.create().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, solana.wallets?.length]);

  const sendCode = useCallback(async (email: string) => {
    await sdkSendCode({ email });
  }, [sdkSendCode]);

  const loginWithCode = useCallback(async (email: string, code: string) => {
    await sdkLoginWithCode({ email, code });
  }, [sdkLoginWithCode]);

  const loginWithPasskey = useCallback(async () => {
    await sdkLoginWithPasskey({ relyingParty: PASSKEY_RELYING_PARTY });
  }, [sdkLoginWithPasskey]);

  const signupWithPasskey = useCallback(async () => {
    await sdkSignupWithPasskey({ relyingParty: PASSKEY_RELYING_PARTY });
  }, [sdkSignupWithPasskey]);

  const emailAccount = user?.linked_accounts?.find(
    (a): a is Extract<typeof a, { type: 'email' }> => a.type === 'email',
  );

  const value: AuthContextType = {
    isReady,
    isAuthenticated,
    userId: user?.id,
    firstName: undefined,
    email: emailAccount?.address,
    evmAddress: ethereum.wallets[0]?.address,
    solanaAddress: solana.wallets?.[0]?.address,
    sendCode,
    loginWithCode,
    otpState,
    loginWithPasskey,
    signupWithPasskey,
    passkeyState,
    logout,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.EXPO_PUBLIC_PRIVY_APP_ID!;
  const clientId = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID!;

  return (
    <PrivySDKProvider appId={appId} clientId={clientId}>
      <AuthBridge>{children}</AuthBridge>
    </PrivySDKProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
