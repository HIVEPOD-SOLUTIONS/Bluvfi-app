import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { rpc } from '@/lib/seeker';

/**
 * Seeker ID: every Seeker phone comes with a `.skr` name, an AllDomains name on Solana mainnet owned by the wallet.
 * Looking up the names a wallet owns lets the app show "alice.skr" instead of "ArFp…v5Qy".
 *
 * Ported from Solana Mobile's reference resolver (solana-mobile-skills, seeker-domains), with plain RPC calls and
 * @solana/web3.js instead of @solana/kit. Always mainnet, whatever cluster the rest of the app uses.
 *
 * Display only. A name is never used to decide who gets paid: names can move between wallets, and a looked-up name
 * that was cached and then used to build a transfer would pay whoever owned it earlier.
 */

const ANS_PROGRAM = new PublicKey('ALTNSZ46uaAUU7XUV6awvdorLGqAsPwa9shm7h4uP2FK');
const TLD_HOUSE_PROGRAM = new PublicKey('TLDHkysf5pCnKsVA4gXpNvmy7psXLPEu4LAdDJthT9S');
const ROOT_ANS = new PublicKey('3mX9b4AZaQehNoQGfckVcmgmA6bkBoFcbLj9RMmMyNcU');
const HASH_PREFIX = 'ALT Name Service';
const TLD = '.skr';

const HEADER_SIZE = 200;
const OWNER_OFFSET = 40;
const EXPIRES_AT_OFFSET = 104;
const REVERSE_BATCH_SIZE = 100;
const ZERO_32 = new Uint8Array(32);

const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * Finding a wallet's names is a getProgramAccounts call on a large program, which the app's usual RPC plan rate-limits (it was
 * refused on Alchemy's free tier when tested) while the public mainnet endpoint serves it. Try the usual one, then that one.
 */
const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
async function call<T>(method: string, params: unknown[]): Promise<T> {
  try {
    return await rpc<T>(method, params);
  } catch {
    return rpc<T>(method, params, PUBLIC_RPC);
  }
}

/** Every hashed input here is a string (a name or a base58 address), so expo-crypto's string digest is all that's needed. */
async function hashName(name: string): Promise<Uint8Array> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, HASH_PREFIX + name);
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

async function nameAccountFor(name: string, parent?: PublicKey): Promise<PublicKey> {
  const [key] = PublicKey.findProgramAddressSync(
    [await hashName(name), ZERO_32, parent ? parent.toBytes() : ZERO_32],
    ANS_PROGRAM,
  );
  return key;
}

const tldHouse = () => PublicKey.findProgramAddressSync([utf8('tld_house'), utf8(TLD)], TLD_HOUSE_PROGRAM)[0];

async function reverseAccountFor(nameAccount: PublicKey, house: PublicKey): Promise<PublicKey> {
  const [key] = PublicKey.findProgramAddressSync(
    [await hashName(nameAccount.toBase58()), house.toBytes(), ZERO_32],
    ANS_PROGRAM,
  );
  return key;
}

/** The on-chain account for `label.skr` (exported for tests). */
export async function skrNameAccount(label: string): Promise<PublicKey> {
  return nameAccountFor(label, await nameAccountFor(TLD, ROOT_ANS));
}

/** The names (like "alice.skr") this wallet owns right now, sorted. Empty if it has none or the address isn't valid. */
export async function resolveSkrNames(owner: string): Promise<string[]> {
  let ownerKey: PublicKey;
  try {
    ownerKey = new PublicKey(owner);
  } catch {
    return [];
  }
  const parent = await nameAccountFor(TLD, ROOT_ANS);
  const house = tldHouse();

  // Name accounts under the .skr parent whose owner is this wallet; only the expiry field is fetched.
  const accounts = await call<{ pubkey: string; account: { data: [string, string] } }[]>('getProgramAccounts', [
    ANS_PROGRAM.toBase58(),
    {
      encoding: 'base64',
      dataSlice: { offset: EXPIRES_AT_OFFSET, length: 8 },
      filters: [
        { memcmp: { offset: 8, bytes: parent.toBase58(), encoding: 'base58' } },
        { memcmp: { offset: OWNER_OFFSET, bytes: ownerKey.toBase58(), encoding: 'base58' } },
      ],
    },
  ]);

  const now = Date.now();
  const live = accounts.filter(({ account }) => {
    const expiry = Buffer.from(account.data[0], 'base64');
    if (expiry.length < 8) return false;
    const expiresAt = Number(expiry.readBigUInt64LE(0));
    return expiresAt === 0 || expiresAt * 1000 >= now;
  });

  const reverseKeys = await Promise.all(live.map(({ pubkey }) => reverseAccountFor(new PublicKey(pubkey), house)));

  const names: string[] = [];
  for (let i = 0; i < reverseKeys.length; i += REVERSE_BATCH_SIZE) {
    const batch = await call<{ value: ({ data: [string, string] } | null)[] }>('getMultipleAccounts', [
      reverseKeys.slice(i, i + REVERSE_BATCH_SIZE).map((k) => k.toBase58()),
      { encoding: 'base64' },
    ]);
    for (const entry of batch.value) {
      if (!entry) continue;
      const data = Buffer.from(entry.data[0], 'base64');
      if (data.length <= HEADER_SIZE) continue;
      const label = data.toString('utf8', HEADER_SIZE).replace(/\0[\s\S]*$/, '');
      if (/^[a-z0-9-]{1,63}$/.test(label)) names.push(`${label}${TLD}`);
    }
  }
  return names.sort();
}

/**
 * The wallet's `.skr` name, for showing in the UI. A wallet can own several; the reference gives no ranking, so the
 * alphabetically first is shown. Checked rarely: names change slowly, and a failed lookup just shows the address.
 */
export function useSkrName(address: string | undefined) {
  const q = useQuery({
    queryKey: ['skr-names', address],
    queryFn: () => resolveSkrNames(address!),
    enabled: !!address,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  return { name: q.data?.[0] ?? null, names: q.data ?? [] };
}
