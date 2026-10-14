// Privy's libraries read the `crypto` global when they load. Expo Router loads every route file up front, in
// path order, and can reach this file before the root layout's polyfills import runs, so load them here first.
import '@/lib/polyfills';

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  PrivyProvider as PrivySDKProvider,
  usePrivy,
  useLoginWithEmail,
  useEmbeddedEthereumWallet,
  useEmbeddedSolanaWallet,
  useLoginWithOAuth,
  useLoginWithSiws,
  useLinkWithSiws,
  useLinkEmail,
  useLinkWithOAuth,
} from '@privy-io/expo';
import { useLoginWithPasskey, useSignupWithPasskey } from '@privy-io/expo/passkey';
import { PrivyElements } from '@privy-io/expo/ui';
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains';
import type { Chain } from 'viem';
import { arcChain } from '@/lib/arc-chain';
import { robinhoodChain, tempoChain } from '@/lib/swap-chains';
import { domaChain } from '@/lib/doma-chain';
import { mwaAvailable, signInWithWallet } from '@/lib/mwa';
import { useSkrName } from '@/lib/skr';
import { setSolanaRpcAuth } from '@/lib/seeker';
import { clearConnectedWallet, saveConnectedWallet } from '@/lib/wallet-connection';

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
const SUPPORTED_CHAINS: [Chain, ...Chain[]] = [base, polygon, arbitrum, optimism, mainnet, domaChain, arcChain, robinhoodChain, tempoChain];

/**
 * "Sign in with Solana" tells Privy which website is asking for the signature. Privy only accepts a domain that is one
 * of the app's allowed origins (checked against its API: www.bluvfi.xyz and bluvfi.xyz pass, the Android app id
 * com.bluvfi.xyz is rejected as "Invalid SIWS message and/or nonce"). Overridable without a rebuild.
 */
const SIWS_DOMAIN = process.env.EXPO_PUBLIC_SIWS_DOMAIN ?? 'www.bluvfi.xyz';
const SIWS_URI = process.env.EXPO_PUBLIC_SIWS_URI ?? 'https://www.bluvfi.xyz';

interface AuthContextType {
  isReady: boolean;
  isAuthenticated: boolean;
  userId: string | undefined;
  firstName: string | undefined;
  /** What to call the person on screen: Google name, else the email's local part, else (wallet-only) a short wallet address. */
  displayName: string | undefined;
  /** The name the person chose for themselves (kept on this phone). It wins over the Google name, email and address. */
  customName: string | undefined;
  setCustomName: (name: string) => Promise<void>;
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
  /** Sign in with a Solana wallet app (Seeker's Seed Vault, Phantom…) through Mobile Wallet Adapter. Android only. */
  walletLoginAvailable: boolean;
  loginWithSolanaWallet: () => Promise<void>;
  /** Link the wallet app to the signed-in account, so it can be used to sign in next time. */
  linkSolanaWallet: () => Promise<void>;
  /** Addresses of Solana wallets already linked to this account for sign-in. */
  linkedWalletAddresses: string[];
  /** Signed in with a wallet and nothing else: no email or Google to recover the account with. */
  isWalletOnly: boolean;
  /** Add an email (code sent to it) / Google as a second way in. */
  sendLinkEmailCode: (email: string) => Promise<void>;
  linkEmailWithCode: (email: string, code: string) => Promise<void>;
  linkEmailState: ReturnType<typeof useLinkEmail>['state'];
  linkGoogle: () => Promise<void>;
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
  const { generateMessage: siwsMessage, login: sdkLoginWithSiws } = useLoginWithSiws();
  const { generateMessage: siwsLinkMessage, link: sdkLinkSiws } = useLinkWithSiws();
  const { sendCode: sdkSendLinkCode, linkWithCode: sdkLinkWithCode, state: linkEmailState } = useLinkEmail();
  const { link: sdkLinkOAuth } = useLinkWithOAuth();
  const ethereum = useEmbeddedEthereumWallet();
  const solana = useEmbeddedSolanaWallet();

  const isAuthenticated = !!user;

  // Seeker lookups (SGT badge, .skr names) go through Bluvfi's RPC endpoint with this token.
  const accessTokenRef = useRef(getAccessToken);
  accessTokenRef.current = getAccessToken;
  useEffect(() => {
    setSolanaRpcAuth(isAuthenticated ? () => accessTokenRef.current() : null);
    return () => setSolanaRpcAuth(null);
  }, [isAuthenticated]);

  // A name the person typed in Profile, kept on the phone per account (SecureStore keys can't hold the colons in Privy ids).
  const nameKey = user?.id ? `bluvfi.display-name.${user.id.replace(/[^A-Za-z0-9._-]/g, '_')}` : null;
  const [customName, setCustomNameState] = useState<string | undefined>();
  useEffect(() => {
    setCustomNameState(undefined);
    if (!nameKey) return;
    let cancelled = false;
    SecureStore.getItemAsync(nameKey)
      .then((v) => {
        if (!cancelled && v) setCustomNameState(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nameKey]);
  const setCustomName = useCallback(
    async (name: string) => {
      const clean = name.trim().replace(/s+/g, ' ').slice(0, 30);
      if (!nameKey) return;
      if (clean) await SecureStore.setItemAsync(nameKey, clean);
      else await SecureStore.deleteItemAsync(nameKey);
      setCustomNameState(clean || undefined);
    },
    [nameKey],
  );

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

  /**
   * Sign in with a Solana wallet app: one trip to the wallet (authorise + sign the message Privy generated), then Privy
   * logs the user in. The wallet is remembered as connected, and preferred for payments.
   */
  const loginWithSolanaWallet = useCallback(async () => {
    const signIn = await signInWithWallet(async (address) => {
      const { message } = await siwsMessage({ wallet: { address }, from: { domain: SIWS_DOMAIN, uri: SIWS_URI } });
      return message;
    });
    // Saved first: logging in switches screens straight away, and the wallet must already be on disk when the
    // connected-wallet state starts up. If Privy then refuses the login, it is forgotten again.
    await saveConnectedWallet(signIn.wallet);
    try {
      await sdkLoginWithSiws({
        signature: signIn.signature,
        message: signIn.message,
        wallet: { walletClientType: signIn.walletClientType, connectorType: 'mobile_wallet_protocol' },
      });
    } catch (err) {
      await clearConnectedWallet();
      throw err;
    }
  }, [siwsMessage, sdkLoginWithSiws]);

  const linkSolanaWallet = useCallback(async () => {
    const signIn = await signInWithWallet(async (address) => {
      const { message } = await siwsLinkMessage({ wallet: { address }, from: { domain: SIWS_DOMAIN, uri: SIWS_URI } });
      return message;
    });
    await sdkLinkSiws({
      signature: signIn.signature,
      message: signIn.message,
      wallet: { walletClientType: signIn.walletClientType, connectorType: 'mobile_wallet_protocol' },
    });
  }, [siwsLinkMessage, sdkLinkSiws]);

  const sendLinkEmailCode = useCallback(async (email: string) => {
    await sdkSendLinkCode({ email });
  }, [sdkSendLinkCode]);

  const linkEmailWithCode = useCallback(async (email: string, code: string) => {
    await sdkLinkWithCode({ email, code });
  }, [sdkLinkWithCode]);

  const linkGoogle = useCallback(async () => {
    await sdkLinkOAuth({ provider: 'google', redirectUri: '/oauth-callback' });
  }, [sdkLinkOAuth]);

  // Logging out also forgets the connected wallet, so the next person to sign in on this phone doesn't inherit it.
  const logoutAndForget = useCallback(async () => {
    await clearConnectedWallet();
    await logout();
  }, [logout]);

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
  // External Solana wallets linked for sign-in (the embedded wallets are listed separately and don't count).
  const linkedWalletAddresses = (user?.linked_accounts ?? [])
    .filter((a) => a.type === 'wallet' && (a as { chain_type?: string }).chain_type === 'solana' && (a as { wallet_client_type?: string }).wallet_client_type !== 'privy')
    .map((a) => (a as { address: string }).address);
  const isWalletOnly = isAuthenticated && !email && linkedWalletAddresses.length > 0;
  const walletAddr = linkedWalletAddresses[0];
  // A Seeker's .skr name (Seeker ID) is the next-best name for someone who signed in with a wallet alone.
  const skrName = useSkrName(walletAddr).name;
  const firstName =
    customName?.split(' ')[0] || googleAccount?.name?.split(' ')[0] || email?.split('@')[0] || skrName?.replace(/\.skr$/, '');
  const displayName =
    customName ||
    googleAccount?.name ||
    email?.split('@')[0] ||
    skrName ||
    (walletAddr ? `${walletAddr.slice(0, 4)}…${walletAddr.slice(-4)}` : undefined);

  const value: AuthContextType = {
    isReady,
    isAuthenticated,
    userId: user?.id,
    firstName,
    displayName,
    customName,
    setCustomName,
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
    walletLoginAvailable: mwaAvailable,
    loginWithSolanaWallet,
    linkSolanaWallet,
    linkedWalletAddresses,
    isWalletOnly,
    sendLinkEmailCode,
    linkEmailWithCode,
    linkEmailState,
    linkGoogle,
    logout: logoutAndForget,
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
