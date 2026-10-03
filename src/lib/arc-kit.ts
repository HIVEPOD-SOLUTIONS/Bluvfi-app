/**
 * Circle App Kit (Arc) — the same SDK, chains and constants bluvfi web's wallet sheet uses for the
 * unified USDC balance, Send and Bridge. Mirrors bluvfi/src/lib/arc-kit.ts.
 *
 * The SDK is loaded lazily (first use) instead of at import time: it is a large Node/browser-first
 * package, and a failure while loading it must only affect the wallet tabs that need it, never take
 * the whole app down at startup. This uses require() rather than import(): Metro's dev server can't serve
 * async import() chunks on Windows (the bundle URL contains backslashes), but require() inside a function is
 * just as lazy and works everywhere.
 */

// Chain names are the SDK's own string enum values (Blockchain.Base === 'Base', etc.), so these
// constants don't need the package loaded just to render the chain pickers.

/** Base mainnet: where the user's EVM wallet holds USDC for payments, and the default destination. */
export const AGENT_CHAIN = 'Base';

// Arc AppKit supports Solana on mainnet only.
export const SOLANA_ARC_BALANCE_CHAIN = 'Solana' as const;

// Mainnet bridge sources. Solana is listed as on the web, but bridging out of it needs the Solana adapter,
// which this app doesn't wire up yet (the Bridge tab says so when it is picked).
export const BRIDGE_SOURCE_OPTIONS = [
  { value: 'Ethereum', label: 'Ethereum', icon: '⟠', disabled: false },
  { value: 'Arbitrum', label: 'Arbitrum', icon: '🔵', disabled: false },
  { value: 'Optimism', label: 'Optimism', icon: '🔴', disabled: false },
  { value: 'Avalanche', label: 'Avalanche', icon: '🔺', disabled: false },
  { value: 'Polygon', label: 'Polygon', icon: '🟣', disabled: false },
  { value: 'Linea', label: 'Linea', icon: '⬜', disabled: false },
  { value: 'Base', label: 'Base', icon: '🔷', disabled: false },
  { value: 'Solana', label: 'Solana', icon: '◎', disabled: false },
] as const;

export type BridgeSourceChain = (typeof BRIDGE_SOURCE_OPTIONS)[number]['value'];

let kitPromise: Promise<import('@circle-fin/app-kit').AppKit> | null = null;

/** The shared AppKit instance, created on first use. */
export function getArcKit() {
  if (!kitPromise) {
    kitPromise = Promise.resolve().then(() => {
      const { AppKit } = require('@circle-fin/app-kit') as typeof import('@circle-fin/app-kit');
      return new AppKit();
    });
    // Let a later attempt retry if loading failed.
    kitPromise.catch(() => {
      kitPromise = null;
    });
  }
  return kitPromise;
}

/** Wraps an EIP-1193 provider (e.g. the Privy embedded wallet) as an App Kit adapter. */
export async function createEvmAdapter(provider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> }) {
  const { createViemAdapterFromProvider } = require('@circle-fin/adapter-viem-v2') as typeof import('@circle-fin/adapter-viem-v2');
  return createViemAdapterFromProvider({
    provider: provider as Parameters<typeof createViemAdapterFromProvider>[0]['provider'],
  });
}
