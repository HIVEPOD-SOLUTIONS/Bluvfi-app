import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * Real-time prices. CoinMarketCap's REST feed only moves about once a minute, so on top of it the app opens
 * Binance's public all-market mini-ticker stream (one message a second for every USDT pair, no key needed) and
 * overlays those prices onto the CoinMarketCap rows. Coins Binance doesn't list simply keep their CMC price.
 *
 * The stream is shared: one socket for the whole app, opened when the first screen subscribes and closed when
 * the last one leaves or the app goes to the background.
 */

interface LiveQuote {
  price: number;
  /** 24h change in percent, from Binance's rolling window. */
  changePct: number;
}

interface LiveState {
  quotes: ReadonlyMap<string, LiveQuote>;
  connected: boolean;
}

const HOSTS = ['wss://stream.binance.com:9443/ws/!miniTicker@arr', 'wss://data-stream.binance.vision/ws/!miniTicker@arr'];

let state: LiveState = { quotes: new Map(), connected: false };
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let subscribers = 0;
let hostIndex = 0;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;

function publish(next: LiveState) {
  state = next;
  listeners.forEach((l) => l());
}

function handleMessage(data: unknown) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(data));
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  const quotes = new Map(state.quotes);
  for (const t of parsed as { s?: string; c?: string; o?: string }[]) {
    if (!t.s || !t.s.endsWith('USDT')) continue;
    const price = Number(t.c);
    const open = Number(t.o);
    if (!(price > 0)) continue;
    quotes.set(t.s.slice(0, -4), { price, changePct: open > 0 ? ((price - open) / open) * 100 : 0 });
  }
  publish({ quotes, connected: true });
}

function connect() {
  if (socket || subscribers === 0) return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(HOSTS[hostIndex % HOSTS.length]);
  } catch {
    scheduleRetry();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    attempt = 0;
  };
  ws.onmessage = (e) => handleMessage(e.data);
  ws.onerror = () => {
    // onclose follows and handles the retry.
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (state.connected) publish({ ...state, connected: false });
    hostIndex += 1; // try the other host next
    scheduleRetry();
  };
}

function scheduleRetry() {
  if (subscribers === 0 || retryTimer) return;
  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

function disconnect() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const ws = socket;
  socket = null;
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  if (state.connected) publish({ ...state, connected: false });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscribers += 1;
  if (subscribers === 1) {
    connect();
    // Don't hold a socket open (or burn battery) while the app is in the background.
    appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') connect();
      else disconnect();
    });
  }
  return () => {
    listeners.delete(listener);
    subscribers -= 1;
    if (subscribers === 0) {
      appStateSub?.remove();
      appStateSub = null;
      disconnect();
    }
  };
}

const getState = () => state;

/** True while the real-time stream is connected. */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(subscribe, getState).connected;
}

interface Priced {
  symbol: string;
  priceUsd: number;
  change24h: number | null;
}

/** A live price only counts if it's within this fraction of CoinMarketCap's, which screens out look-alike tickers. */
const SANITY = 0.1;

/**
 * Overlays real-time prices onto CoinMarketCap rows. Rows the stream doesn't cover (or disagrees with wildly,
 * as a look-alike coin sharing a ticker would) are returned untouched, with the same object identity.
 */
export function useLiveCoins<T extends Priced>(coins: T[] | null): T[] | null {
  const { quotes } = useSyncExternalStore(subscribe, getState);
  return useMemo(() => {
    if (!coins || quotes.size === 0) return coins;
    return coins.map((c) => {
      const q = quotes.get(c.symbol);
      if (!q || Math.abs(q.price / c.priceUsd - 1) > SANITY) return c;
      if (q.price === c.priceUsd && q.changePct === c.change24h) return c;
      return { ...c, priceUsd: q.price, change24h: q.changePct };
    });
  }, [coins, quotes]);
}

/** 'up' / 'down' for a moment after the value changes, then null. */
export function usePriceFlash(value: number): 'up' | 'down' | null {
  const prev = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (value === prev.current) return;
    setFlash(value > prev.current ? 'up' : 'down');
    prev.current = value;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}
