/**
 * Must be imported first, before any viem / @solana/web3.js / Privy code
 * runs — those libraries assume Node-like globals (crypto.getRandomValues,
 * TextEncoder/Decoder, Buffer) that React Native doesn't provide natively.
 */
import 'react-native-get-random-values';
import '@ethersproject/shims';
import 'fast-text-encoding';
import { Buffer } from 'buffer';

if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}
