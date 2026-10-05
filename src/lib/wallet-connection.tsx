import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  connectWallet,
  createMwaSigner,
  friendlyWalletError,
  mwaAvailable,
  signAndSend,
  waitForConfirmation,
  type ConnectedWallet,
  type SolanaSigner,
  type WalletErrorKind,
} from '@/lib/mwa';

/**
 * The user's connected external Solana wallet (via Mobile Wallet Adapter), shared by the wallet sheet, payment
 * cards and the profile. The connection is remembered in secure storage, so reopening the app keeps it and the
 * next approval can skip the wallet's connect screen.
 */

const STORAGE_KEY = 'bluvfi.connected-wallet';

/** Forgets the connected wallet. Called on logout so the next person on this phone doesn't inherit it. */
export async function clearConnectedWallet(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    /* nothing stored */
  }
}

/** Remembers the wallet the user signed in with, so it is already connected (and preferred) when the app opens. */
export async function saveConnectedWallet(wallet: ConnectedWallet): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    /* the sign-in itself already succeeded */
  }
}

export type SolanaSource = 'bluvfi' | 'wallet';

interface WalletConnectionValue {
  /** MWA exists in this build (Android, and the native module is installed). */
  available: boolean;
  wallet: ConnectedWallet | null;
  connecting: boolean;
  error: { message: string; kind: WalletErrorKind } | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
  /** Which wallet pays Solana payments: Bluvfi's own, or the connected one. Falls back to Bluvfi when none is connected. */
  source: SolanaSource;
  setSource: (source: SolanaSource) => void;
  /** The connected wallet as a signer the payment flows can use in place of Bluvfi's. */
  signer: SolanaSigner;
  /** Builds, signs (in the wallet app) and sends a transaction; resolves with its signature once confirmed. */
  send: (build: (payer: PublicKey, connection: Connection) => Promise<Transaction>, onSent?: (signature: string) => void) => Promise<string>;
}

const Ctx = createContext<WalletConnectionValue | null>(null);

export function useConnectedWallet(): WalletConnectionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConnectedWallet must be used within a WalletConnectionProvider');
  return ctx;
}

export function WalletConnectionProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<WalletConnectionValue['error']>(null);
  const [source, setSource] = useState<SolanaSource>('bluvfi');
  const walletRef = useRef<ConnectedWallet | null>(null);
  walletRef.current = wallet;

  const persist = useCallback(async (next: ConnectedWallet | null) => {
    setWallet(next);
    try {
      if (next) await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      else await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      /* the connection still works for this session */
    }
  }, []);

  // Restore the last connection (no wallet prompt: it's only used when the user next approves something).
  useEffect(() => {
    if (!mwaAvailable) return;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as ConnectedWallet;
        if (parsed?.address && parsed?.authToken) {
          setWallet(parsed);
          // Someone who signed in with this wallet usually holds their money there, not in the Bluvfi wallet.
          if (parsed.preferred) setSource('wallet');
        }
      })
      .catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    if (!mwaAvailable || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      await persist(await connectWallet(walletRef.current));
    } catch (err) {
      const e = friendlyWalletError(err);
      // Backing out of the wallet's screen isn't an error worth showing.
      if (e.kind !== 'declined') setError({ message: e.message, kind: e.kind });
    } finally {
      setConnecting(false);
    }
  }, [connecting, persist]);

  const disconnect = useCallback(() => {
    setError(null);
    setSource('bluvfi');
    void persist(null);
  }, [persist]);

  // One signer for the whole app; it always reads the freshest connection.
  const signer = useMemo(() => createMwaSigner(() => walletRef.current, (next) => void persist(next)), [persist]);

  const send = useCallback<WalletConnectionValue['send']>(
    async (build, onSent) => {
      const current = walletRef.current;
      if (!current) throw friendlyWalletError(new Error('No wallet connected'));
      const { signature, wallet: refreshed } = await signAndSend(current, build);
      // Keep the freshest token (and account, if the user switched accounts in their wallet).
      void persist(refreshed);
      onSent?.(signature); // approved and submitted; now wait for the network
      await waitForConfirmation(signature);
      return signature;
    },
    [persist],
  );

  const value = useMemo<WalletConnectionValue>(
    () => ({
      available: mwaAvailable,
      wallet,
      connecting,
      error,
      connect,
      disconnect,
      clearError: () => setError(null),
      source: wallet ? source : 'bluvfi',
      setSource,
      signer,
      send,
    }),
    [wallet, connecting, error, connect, disconnect, source, signer, send],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Who pays a Solana payment right now. Pass Bluvfi's own wallet details; the result is what the payment code should
 * use: the connected wallet's address and signer when the user picked it, otherwise Bluvfi's own. Payment flows call
 * this instead of reading the embedded wallet directly, which is all it takes to let either wallet pay.
 */
export function useSolanaPaySource(bluvfi: { address?: string; getProvider: () => Promise<any> }) {
  const { wallet, source, signer } = useConnectedWallet();
  const usingWallet = !!wallet && source === 'wallet';
  return {
    usingWallet,
    address: usingWallet ? wallet!.address : bluvfi.address,
    getProvider: usingWallet ? async () => signer : bluvfi.getProvider,
    label: usingWallet ? wallet!.name : 'Bluvfi wallet',
  };
}
