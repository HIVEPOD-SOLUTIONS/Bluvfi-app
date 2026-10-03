// Privy's libraries read the `crypto` global when they load. Expo Router loads every route file up front, in
// path order, and can reach this file before the root layout's polyfills import runs, so load them here first.
import '@/lib/polyfills';

import { createContext, useCallback, useContext, useEffect, ReactNode } from 'react';
import {
  PrivyProvider as PrivySDKProvider,
  usePrivy,
  useLoginWithEmail,
  useEmbeddedEthereumWallet,
  useEmbeddedSolanaWallet,
  useLoginWithOAuth,
} from '@privy-io/expo';
import { useLoginWithPasskey, useSignupWithPasskey } from '@privy-io/expo/passkey';
import { PrivyElements } from '@privy-io/expo/ui';
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains';
import type { Chain } from 'viem';
import { domaChain } from '@/lib/doma-chain';

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

/**
 * Every EVM chain the wallet pays on (same list as bluvfi web's Privy config), so wallet_switchEthereumChain
 * succeeds when a payment is on Polygon, Arbitrum, Optimism, Ethereum or the Doma chain (domain orders).
 */
const SUPPORTED_CHAINS: [Chain, ...Chain[]] = [base, polygon, arbitrum, optimism, mainnet, domaChain];

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
  loginWithGoogle: () => Promise<void>;
  googleState: ReturnType<typeof useLoginWithOAuth>['state'];
  loginWithPasskey: () => Promise<void>;
  signupWithPasskey: () => Promise<void>;
  passkeyState: ReturnType<typeof useLoginWithPasskey>['state'];
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  /** EIP-1193 provider of the user's embedded EVM wallet (signs silently; no external wallet needed). */
  getEvmProvider: () => Promise<{ request(args: { method: string; params?: unknown[] }): Promise<unknown> }>;
  /** The embedded EVM wallet (address + provider) for payments; throws if it isn't ready yet. */
  getEvmWallet: () => {
    address: string;
    getProvider: () => Promise<{ request(args: { method: string; params?: unknown[] }): Promise<unknown> }>;
    getAccessToken: () => Promise<string | null>;
  };
  /** Provider of the user's embedded Solana wallet (signTransaction / signAndSendTransaction). */
  getSolanaProvider: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function AuthBridge({ children }: { children: ReactNode }) {
  const { user, isReady, logout, getAccessToken } = usePrivy();
  const { sendCode: sdkSendCode, loginWithCode: sdkLoginWithCode, state: otpState } = useLoginWithEmail();
  const { login: sdkLoginWithOAuth, state: googleState } = useLoginWithOAuth();
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

  const getEvmProvider = useCallback(async () => {
    const wallet = ethereum.wallets[0];
    if (!wallet) throw new Error('Your wallet is still being set up. Try again in a moment.');
    return wallet.getProvider();
  }, [ethereum.wallets]);

  const getEvmWallet = useCallback(() => {
    const wallet = ethereum.wallets[0];
    if (!wallet) throw new Error('Your wallet is still being set up. Try again in a moment.');
    return { address: wallet.address, getProvider: () => wallet.getProvider(), getAccessToken };
  }, [ethereum.wallets, getAccessToken]);

  const getSolanaProvider = useCallback(async () => {
    const wallet = solana.wallets?.[0];
    if (!wallet) throw new Error('Your Solana wallet is still being set up. Try again in a moment.');
    return wallet.getProvider();
  }, [solana.wallets]);

  const loginWithGoogle = useCallback(async () => {
    // The browser returns to bluvfi:///oauth-callback, a real route (app/oauth-callback.tsx) that exists
    // whether or not the user is signed in yet, so the redirect never lands on an unmatched route.
    await sdkLoginWithOAuth({ provider: 'google', redirectUri: '/oauth-callback' });
  }, [sdkLoginWithOAuth]);

  const loginWithPasskey = useCallback(async () => {
    await sdkLoginWithPasskey({ relyingParty: PASSKEY_RELYING_PARTY });
  }, [sdkLoginWithPasskey]);

  const signupWithPasskey = useCallback(async () => {
    await sdkSignupWithPasskey({ relyingParty: PASSKEY_RELYING_PARTY });
  }, [sdkSignupWithPasskey]);

  const emailAccount = user?.linked_accounts?.find(
    (a): a is Extract<typeof a, { type: 'email' }> => a.type === 'email',
  );
  const googleAccount = user?.linked_accounts?.find(
    (a): a is Extract<typeof a, { type: 'google_oauth' }> => a.type === 'google_oauth',
  );

  // Same order as bluvfi web's getUserFirstName(): Google profile name, then the local part of the
  // email, so every login method resolves to something displayable.
  const email = emailAccount?.address ?? googleAccount?.email;
  const firstName = googleAccount?.name?.split(' ')[0] || email?.split('@')[0];

  const value: AuthContextType = {
    isReady,
    isAuthenticated,
    userId: user?.id,
    firstName,
    email,
    evmAddress: ethereum.wallets[0]?.address,
    solanaAddress: solana.wallets?.[0]?.address,
    sendCode,
    loginWithCode,
    otpState,
    loginWithGoogle,
    googleState,
    loginWithPasskey,
    signupWithPasskey,
    passkeyState,
    logout,
    getAccessToken,
    getEvmProvider,
    getEvmWallet,
    getSolanaProvider,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.EXPO_PUBLIC_PRIVY_APP_ID!;
  const clientId = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID!;

  return (
    <PrivySDKProvider appId={appId} clientId={clientId} supportedChains={SUPPORTED_CHAINS}>
      <AuthBridge>{children}</AuthBridge>
      {/* Hosts Privy's own modal UIs, which the card-funding flow (useFundWallet) opens. */}
      <PrivyElements />
    </PrivySDKProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
