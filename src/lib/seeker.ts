import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api';

/**
 * Solana Seeker recognition, two ways:
 *
 *  • The phone: best effort from the model, manufacturer and brand Android reports. Solana Mobile doesn't document
 *    what a Seeker reports, so this matches the obvious names; it only changes wording and ordering (the Seed Vault
 *    sign-in button comes first), never what the app can do.
 *  • The owner: the on-chain Seeker Genesis Token (SGT), which is what Solana Mobile documents for proving someone owns
 *    a Seeker. It follows the wallet, not the phone, and can't be faked by a device name.
 */

export function isSeekerDevice(): boolean {
  if (Platform.OS !== 'android') return false;
  // Preview switch for development builds only (set EXPO_PUBLIC_FORCE_SEEKER=1 in .env): acts as a Seeker on an
  // emulator so the Seed Vault wording and ordering can be seen. Release builds ignore it.
  if (__DEV__ && process.env.EXPO_PUBLIC_FORCE_SEEKER === '1') return true;
  const c = Platform.constants as unknown as Record<string, unknown>;
  const text = [c.Model, c.Manufacturer, c.Brand, c.Fingerprint]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
  return /seeker|solana\s*mobile|solanamobile/i.test(text);
}

// ── Seeker Genesis Token ─────────────────────────────────────────────────────

/** Solana Mobile's SGT collection: every genuine SGT is a Token-2022 mint that is a member of this group. */
const SGT_GROUP = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const ALCHEMY_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '';
const SOLANA_RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? '';
// A dedicated endpoint (Helius) when configured: .skr lookups use getProgramAccounts, which the Alchemy free tier refuses.
const RPC = SOLANA_RPC_URL || (ALCHEMY_KEY ? `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : 'https://api.mainnet-beta.solana.com');

/**
 * Reads go through Bluvfi's own endpoint first (POST /api/solana/rpc), which holds the RPC key on the server so none has to
 * ship inside the APK. The auth provider hands over the signed-in user's token; the endpoint is limited to the few calls
 * these Seeker features make. If it isn't deployed or configured yet (404/501/502/503) or can't be reached, the call
 * falls back to a direct endpoint for a few minutes, so the features keep working while the backend catches up.
 */
let tokenProvider: (() => Promise<string | null>) | null = null;
export function setSolanaRpcAuth(provider: (() => Promise<string | null>) | null) {
  tokenProvider = provider;
}
let proxyDownUntil = 0;
const PROXY_RETRY_MS = 5 * 60_000;

/** The proxy's answer, or undefined when it can't be used and the caller should go direct. Real refusals throw. */
async function viaProxy<T>(method: string, params: unknown[]): Promise<{ value: T } | undefined> {
  if (!tokenProvider || Date.now() < proxyDownUntil) return undefined;
  let res: Response;
  try {
    const token = await tokenProvider();
    if (!token) return undefined;
    res = await fetch(`${API_BASE_URL}/api/solana/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  } catch {
    proxyDownUntil = Date.now() + PROXY_RETRY_MS;
    return undefined;
  }
  if ([404, 501, 502, 503].includes(res.status)) {
    proxyDownUntil = Date.now() + PROXY_RETRY_MS;
    return undefined;
  }
  const json = (await res.json().catch(() => null)) as { result?: T; error?: unknown } | null;
  if (!res.ok || !json) {
    const reason = typeof (json as { error?: unknown } | null)?.error === 'string' ? ((json as { error: string }).error) : `RPC proxy failed (${res.status})`;
    throw new Error(reason);
  }
  if (json.error) throw new Error(typeof json.error === 'object' && json.error && 'message' in json.error ? String((json.error as { message: unknown }).message) : 'RPC error');
  return { value: json.result as T };
}

export async function rpc<T>(method: string, params: unknown[], url?: string): Promise<T> {
  if (url === undefined) {
    const proxied = await viaProxy<T>(method, params);
    if (proxied) return proxied.value;
  }
  const res = await fetch(url ?? RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? 'RPC error');
  return json.result as T;
}

type Extension = { extension: string; state?: Record<string, unknown> };

/**
 * Whether a parsed Token-2022 mint is a Seeker Genesis Token. Membership of the SGT group is the proof (only the
 * group's authority can add members); the metadata pointer must also agree, as Solana Mobile's own check requires.
 */
export function isSgtMint(extensions: Extension[] | undefined): boolean {
  if (!extensions) return false;
  const member = extensions.find((e) => e.extension === 'tokenGroupMember');
  const pointer = extensions.find((e) => e.extension === 'metadataPointer');
  return member?.state?.group === SGT_GROUP && pointer?.state?.metadataAddress === SGT_GROUP;
}

/**
 * The mint of the Seeker Genesis Token this wallet holds right now, or null. Empty token accounts are skipped: moving an
 * SGT away leaves the old account open with a zero balance, which must not count as ownership.
 */
export async function findSeekerGenesisToken(owner: string): Promise<string | null> {
  const accounts = await rpc<{
    value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null; decimals: number } } } } } }[];
  }>('getTokenAccountsByOwner', [owner, { programId: TOKEN_2022 }, { encoding: 'jsonParsed' }]);

  // An SGT is a one-of-one with 0 decimals; check only those, and cap the work for wallets full of Token-2022 tokens.
  const candidates = accounts.value
    .map((a) => a.account.data.parsed.info)
    .filter((i) => i.tokenAmount.decimals === 0 && (i.tokenAmount.uiAmount ?? 0) > 0)
    .map((i) => i.mint)
    .slice(0, 25);

  for (const mint of candidates) {
    const info = await rpc<{ value: { data: { parsed?: { info?: { extensions?: Extension[] } } } } | null }>('getAccountInfo', [
      mint,
      { encoding: 'jsonParsed' },
    ]);
    if (isSgtMint(info.value?.data?.parsed?.info?.extensions)) return mint;
  }
  return null;
}

/** Whether the connected wallet holds a Seeker Genesis Token. Checked rarely: ownership changes slowly. */
export function useSeekerOwner(address: string | undefined) {
  const q = useQuery({
    queryKey: ['seeker-owner', address],
    queryFn: () => findSeekerGenesisToken(address!),
    enabled: !!address,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  return { isOwner: !!q.data, mint: q.data ?? null };
}
