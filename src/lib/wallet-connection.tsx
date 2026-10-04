import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  connectWallet,
  friendlyWalletError,
  mwaAvailable,
  signAndSend,
  waitForConfirmation,
  type ConnectedWallet,
  type WalletErrorKind,
} from '@/lib/mwa';

/**
 * The user's connected external Solana wallet (via Mobile Wallet Adapter), shared by the wallet sheet, payment
 * cards and the profile. The connection is remembered in secure storage, so reopening the app keeps it and the
 * next approval can skip the wallet's connect screen.
 */

const STORAGE_KEY = 'bluvfi.connected-wallet';

interface WalletConnectionValue {
  /** MWA exists in this build (Android, and the native module is installed). */
  available: boolean;
  wallet: ConnectedWallet | null;
  connecting: boolean;
  error: { message: string; kind: WalletErrorKind } | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
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
        if (parsed?.address && parsed?.authToken) setWallet(parsed);
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
    void persist(null);
  }, [persist]);

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
    () => ({ available: mwaAvailable, wallet, connecting, error, connect, disconnect, clearError: () => setError(null), send }),
    [wallet, connecting, error, connect, disconnect, send],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
