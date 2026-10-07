import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import * as Application from 'expo-application';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useApiQuery } from '@/hooks/use-api';
import { useBalances } from '@/hooks/use-balances';
import { useXrpBalance, useXrplWallet } from '@/hooks/use-xrpl';
import { API_BASE_URL } from '@/lib/api';
import type { Payment } from '@/lib/api-types';
import { useStocksPortfolio } from '@/hooks/use-stocks';
import { useAuth } from '@/lib/auth-context';
import { isSeekerDevice } from '@/lib/seeker';
import { useConnectedWallet } from '@/lib/wallet-connection';

type ChatApi = ReturnType<typeof useChat>;

interface ChatContextValue {
  /** The AI chat sheet is showing. */
  open: boolean;
  /** Opens the sheet; with a prompt, the assistant starts on it straight away. */
  openChat: (prompt?: string) => void;
  closeChat: () => void;
  messages: ChatApi['messages'];
  status: ChatApi['status'];
  isBusy: boolean;
  send: (text: string) => void;
  /**
   * A payment card reports its outcome for a tool call (paid, failed or cancelled). The chat then resubmits
   * so the assistant carries on — e.g. polls the order and shows the redemption code.
   */
  reportToolResult: (args: { tool: string; toolCallId: string; output: unknown; continueChat?: boolean }) => Promise<void>;
  /** The 429 "daily message limit" response was hit. */
  dailyLimitHit: boolean;
  /** Lift the daily-limit notice (after a rewarded ad grants more messages). */
  clearDailyLimit: () => void;
  /** Any other limit the server enforced (too many messages a minute, daily AI capacity…), in its own words. */
  limitNotice: string | null;
  /** Messages left today, from the server's quota headers (null until the first reply). */
  remainingToday: number | null;
  /** The Wallet (fund) sheet on the dashboard — also opened by the assistant's open_fund_wallet tool. */
  walletOpen: boolean;
  openWallet: () => void;
  closeWallet: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatSheet() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatSheet must be used within a ChatProvider');
  return ctx;
}

/**
 * Owns the one AI conversation for the app (so it persists while the sheet is closed and re-opened,
 * like bluvfi web's chat sheet) and the dashboard context the assistant is told about each turn:
 * name, wallet addresses, balances, portfolio value and purchase count.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { getAccessToken, evmAddress, solanaAddress, firstName, isWalletOnly } = useAuth();
  const { wallet: connectedWallet } = useConnectedWallet();
  const { data: balances } = useBalances(evmAddress, solanaAddress);
  const xrpl = useXrplWallet();
  const xrp = useXrpBalance(!!xrpl.address);
  // The agent is told the same portfolio the dashboard shows: the user's real stock holdings.
  const { data: stocksPortfolio } = useStocksPortfolio();
  const { data: billPayments } = useApiQuery<{ payments: Payment[] }>(['payments', 'bill'], '/api/payments', {
    type: 'bill',
    limit: 100,
  });

  const [open, setOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [dailyLimitHit, setDailyLimitHit] = useState(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);

  // The transport is created once; it reads the freshest values through this ref on every request.
  const bodyRef = useRef<Record<string, unknown>>({});
  bodyRef.current = {
    walletAddress: evmAddress,
    solanaAddress,
    userName: firstName,
    evmUsdc: balances?.evmUsdc,
    evmUsdt: balances?.evmUsdt,
    solUsdc: balances?.solUsdc,
    solUsdt: balances?.solUsdt,
    xrpBalanceClient: xrp.balance ?? undefined,
    totalBillsDueUsd: 0,
    portfolioValueUsd: stocksPortfolio?.totalUsd,
    billCount: billPayments?.payments.filter((p) => p.status === 'completed').length,
    // Lets the server describe this app (screens, Banking coming soon, connected wallet) instead of the website or the older
    // WebView app. The wallet is only a name and an address: nothing the agent could sign with.
    client: 'expo-android',
    connectedWallet: connectedWallet ? { name: connectedWallet.name, address: connectedWallet.address } : undefined,
    walletOnly: isWalletOnly,
    seeker: isSeekerDevice(),
    appVersion: Application.nativeApplicationVersion
      ? `${Application.nativeApplicationVersion} (${Application.nativeBuildVersion})`
      : undefined,
  };

  const tokenRef = useRef(getAccessToken);
  tokenRef.current = getAccessToken;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE_URL}/api/chat`,
        body: () => ({ ...bodyRef.current }),
        headers: async (): Promise<Record<string, string>> => {
          const token = await tokenRef.current();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // expo/fetch streams response bodies (React Native's built-in fetch doesn't), which the AI SDK's
        // incremental text needs. A 429 mentioning "daily" is the message quota, handled in the UI.
        fetch: (async (url: string, init?: RequestInit) => {
          const res = await (expoFetch as unknown as typeof globalThis.fetch)(url, init);
          // The server reports the quota on every reply, so the chat can warn before the limit is hit.
          const remaining = res.headers.get('X-RateLimit-Remaining-Daily');
          if (remaining !== null && Number.isFinite(Number(remaining))) setRemainingToday(Number(remaining));
          if (res.ok) setLimitNotice(null);
          if (res.status === 429) {
            res
              .clone()
              .json()
              .then((data: { error?: string }) => {
                const message = data?.error ?? '';
                // The message quota has the ad-for-more-messages card; every other limit is shown as the server worded it.
                if (message.includes('daily message limit')) setDailyLimitHit(true);
                else setLimitNotice(message || 'Too many requests. Please wait a moment and try again.');
              })
              .catch(() => setLimitNotice('Too many requests. Please wait a moment and try again.'));
          }
          return res;
        }) as unknown as typeof globalThis.fetch,
      }),
    [],
  );

  const { messages, sendMessage, status, addToolResult } = useChat({ transport });
  const isBusy = status === 'submitted' || status === 'streaming';

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) return;
      sendMessage({ text: trimmed });
    },
    [isBusy, sendMessage],
  );

  const reportToolResult = useCallback<ChatContextValue['reportToolResult']>(
    async ({ tool, toolCallId, output, continueChat = true }) => {
      await addToolResult({ tool, toolCallId, output } as never);
      if (continueChat) await sendMessage();
    },
    [addToolResult, sendMessage],
  );

  const openChat = useCallback(
    (prompt?: string) => {
      setOpen(true);
      if (prompt) send(prompt);
    },
    [send],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      open,
      openChat,
      closeChat: () => setOpen(false),
      messages,
      status,
      isBusy,
      send,
      reportToolResult,
      dailyLimitHit,
      clearDailyLimit: () => {
        setDailyLimitHit(false);
        setRemainingToday(null);
      },
      limitNotice,
      remainingToday,
      walletOpen,
      openWallet: () => setWalletOpen(true),
      closeWallet: () => setWalletOpen(false),
    }),
    [open, openChat, messages, status, isBusy, send, reportToolResult, dailyLimitHit, limitNotice, remainingToday, walletOpen],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
