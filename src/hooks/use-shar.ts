import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { microToUsd, priceUsd } from '@/lib/money';
import { ignoreNextGain } from '@/lib/shar-celebrate';
import type { creatorPayload } from '@/lib/provider-publisher';
import type { AuthType, InputField, authPayload } from '@/lib/provider-config';
import type { ActivityPage, ActivitySource } from '@/lib/activity-format';
import { useApiClient, useApiQuery } from './use-api';

/** Shar rewards and the open provider network, from bluvfi's /api/shar and /api/network endpoints. */

export interface SharActivity {
  id: string;
  kind: 'purchase' | 'claim' | 'referral' | 'provider' | 'spark' | 'prize';
  title: string;
  /** Signed: negative for claims. */
  shar: number;
  state: 'available' | 'pending' | 'requested' | 'sending' | 'paid' | 'rejected';
  at: string;
}

export type BadgeKey = 'first_spark' | 'streak_7' | 'streak_30' | 'first_purchase' | 'first_companion' | 'first_provider' | 'first_claim' | 'squad_member' | 'seeker_holder';

export interface SharBadge {
  key: BadgeKey;
  label: string;
  hint: string;
  earned: boolean;
}

/** The Daily Spark card. The streak and amounts are worked out by the server; the app only shows them. */
export interface SparkState {
  /** False until the server's spark table exists. */
  ready: boolean;
  streak: number;
  collectedToday: boolean;
  /** When the next spark can be collected (00:00 UTC). */
  nextAt: string;
  next: { streak: number; shar: number; daily: number; bonus: number; multiplier: number; seeker: boolean };
  /** A verified Seeker Genesis Token holder (checked by the server). */
  seeker: boolean;
  days: { day: string; collected: boolean; today: boolean }[];
  rules: { baseShar: number; weekBonusShar: number; seekerMultiplier: number; streakTiers: { from: number; multiplier: number }[] };
}

export interface SparkResult {
  day: string;
  streak: number;
  shar: number;
  daily: number;
  bonus: number;
  multiplier: number;
  seeker: boolean;
}

export interface SharSummary {
  /** False until the server's new tables exist; spending Shar still shows. */
  ready: boolean;
  available: number;
  pending: number;
  lifetime: number;
  week: number;
  weekEndsAt: string;
  tier: { tier: 'spark' | 'wisp' | 'guide' | 'seeker'; name: string; next: { name: string; at: number } | null; progress: number };
  skr: { perShar: number; availableSkr: string };
  claim: { minShar: number; open: { id: string; shar: number; skr: string; wallet: string; at: string; sending: boolean } | null };
  referral: { code: string | null; referred: number; bonus: number };
  provider: { owned: number; earned: number };
  spark: SparkState;
  badges: SharBadge[];
  activity: SharActivity[];
  rules: { perUsd: number; minPurchaseUsd: number; referralBonusPct: number; providerUseShar: number; skrPerShar: number; minClaimShar: number };
}

export interface SharLeaderboard {
  weekStartsAt: string;
  weekEndsAt: string;
  top: { rank: number; handle: string; shar: number; you: boolean; seeker: boolean; prizeShar: number | null }[];
  me: { rank: number | null; shar: number };
  /** The weekly prizes by place, paid as Shar (and what that is in SKR); empty while the team has set none. */
  prizes: { place: number; shar: number; skr: string }[];
  /** The least Shar a person must earn in the week to win a prize. */
  prizeMinShar: number;
}

export interface SquadMember {
  handle: string;
  you: boolean;
  owner: boolean;
  shar: number;
}

export interface SquadInfo {
  name: string;
  code: string;
  isOwner: boolean;
  memberCount: number;
  full: boolean;
  members: SquadMember[];
  goal: number;
  shar: number;
  progress: number;
  reached: boolean;
  remaining: number;
}

export interface SquadView {
  /** False until the server's squad tables exist. */
  ready: boolean;
  squad: SquadInfo | null;
  board: { rank: number; name: string; shar: number; members: number; you: boolean; reached: boolean }[];
  myRank?: number | null;
  rules: { maxMembers: number; goalPerMember: number; minGoal: number; nameMin: number; nameMax: number; codeLength: number };
  weekEndsAt: string;
}

export function useShar() {
  return useApiQuery<SharSummary>(['shar'], '/api/shar', undefined, { staleTime: 30_000, retry: 1 });
}

export function useSharLeaderboard() {
  return useApiQuery<SharLeaderboard>(['shar', 'leaderboard'], '/api/shar/leaderboard', undefined, { staleTime: 60_000, retry: 1 });
}

/** Collects today's Daily Spark. The server decides the streak and the amount; a 409 means today's is already taken. */
export function useCollectSpark() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call<{ spark: SparkResult }>('/api/shar/spark', { method: 'POST' }),
    onSuccess: (res) => {
      // The Spark screen celebrates these Shar itself, so the app-wide celebration must not do it a second time when the summary reloads.
      ignoreNextGain(res.spark.shar);
      qc.invalidateQueries({ queryKey: ['shar'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/** The person's squad (members' weeks, the weekly goal) and this week's board of squads. */
export function useSquad() {
  return useApiQuery<SquadView>(['shar', 'squad'], '/api/shar/squad', undefined, { staleTime: 30_000, retry: 1 });
}

/** Start, join or leave a squad. The server's answer is the fresh squad view. */
export function useSquadAction() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: 'create'; name: string } | { action: 'join'; code: string } | { action: 'leave' }) =>
      call<{ code?: string; view: SquadView }>('/api/shar/squad', { method: 'POST', body: input }),
    onSuccess: (res) => {
      qc.setQueryData(['shar', 'squad'], res.view);
      qc.invalidateQueries({ queryKey: ['shar'] });
    },
  });
}

export function useClaimShar() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { shar: number; wallet: string }) => call<{ claim: { id: string; shar: number; skr: string } }>('/api/shar/claim', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shar'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUseReferralCode() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => call<{ ok: true }>('/api/shar/referral', { method: 'POST', body: { code } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shar'] }),
  });
}

// ── Open provider network ─────────────────────────────────────────────────────

export type ProviderCategory = 'data' | 'ai' | 'payments' | 'defi' | 'identity' | 'other';
export const PROVIDER_CATEGORIES: { key: ProviderCategory; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'ai', label: 'AI' },
  { key: 'payments', label: 'Payments' },
  { key: 'defi', label: 'DeFi' },
  { key: 'identity', label: 'Identity' },
  { key: 'other', label: 'Other' },
];

export interface NetworkProvider {
  id: string;
  name: string;
  slug: string;
  summary: string;
  category: ProviderCategory;
  docsUrl: string | null;
  priceUsdc: string;
  host: string | null;
  /** Promoted by the team. */
  featured: boolean;
  /** JSON text showing a good request, or null. */
  exampleRequest: string | null;
  /** The inputs a caller fills in. null means free-form JSON. */
  inputFields: InputField[] | null;
  /** What a person has to do before using it (up to five steps), and where to do it. */
  requirements: string[] | null;
  setupUrl: string | null;
  /** The owner has their own terms for people who use it (the text is on the provider's page, not repeated in lists). */
  hasOwnerTerms?: boolean;
  remixOf: { id: string; name: string } | null;
  uses: number;
  remixes: number;
  owner: string;
  mine: boolean;
  createdAt: string;
}

/** One provider's page. Same as a list entry plus its state (the owner can open their own in any state). */
export interface OwnerTerms {
  text: string | null;
  url: string | null;
  /** The fingerprint of this version. An agreement is to exactly this version. */
  hash: string;
}

export interface ProviderDetail extends NetworkProvider {
  /** The owner's own terms for people who use this provider, on top of Bluvfi's. null when there are none. */
  terms: OwnerTerms | null;
  /** When the signed-in person agreed to THIS version of them, or null. */
  termsAcceptedAt: string | null;
  status: 'submitted' | 'verified' | 'rejected' | 'paused';
  verifiedAt: string | null;
}

export interface MyProvider {
  id: string;
  name: string;
  slug: string;
  summary: string;
  category: ProviderCategory;
  endpointUrl: string;
  docsUrl: string | null;
  priceUsdc: string;
  payoutWallet: string;
  remixOfId: string | null;
  status: 'submitted' | 'verified' | 'rejected' | 'paused';
  reviewNote: string | null;
  exampleRequest: string | null;
  inputFields: InputField[] | null;
  requirements: string[] | null;
  setupUrl: string | null;
  /** Private notes for the Bluvfi team. */
  teamNotes: string | null;
  /** Their own terms for the people who use this provider, if any. */
  terms: OwnerTerms | null;
  /** How Bluvfi connects to their API. The key itself is never sent to the phone, only whether one is saved. */
  auth: { type: AuthType; header: string | null; hasSecret: boolean };
  /** Who is behind it and how to reach them. null for a listing from before these questions. */
  publisher: { operatorType: 'individual' | 'company' | string; companyName: string | null; companyWebsite: string | null; contactEmail: string; rightsConfirmed: boolean; termsVersion: string; termsAcceptedAt: string | null } | null;
  featured: boolean;
  /** Paused by the owner, who can resume it; false when the team paused it. */
  pausedByOwner: boolean;
  uses: number;
  shar: number;
  createdAt: string;
}

export type ProviderSort = 'featured' | 'popular' | 'new';
export interface ProviderBrowse {
  q: string;
  category: ProviderCategory | null;
  sort: ProviderSort;
  free: boolean;
}
export const DEFAULT_BROWSE: ProviderBrowse = { q: '', category: null, sort: 'featured', free: false };

/** Verified providers, searched, filtered and sorted on the server. The previous results stay on screen while a new search loads. */
export function useNetworkProviders(browse: ProviderBrowse = DEFAULT_BROWSE) {
  const params: Record<string, string | number | undefined> = {
    q: browse.q.trim() || undefined,
    category: browse.category ?? undefined,
    sort: browse.sort === 'featured' ? undefined : browse.sort,
    free: browse.free ? 1 : undefined,
  };
  return useApiQuery<{ providers: NetworkProvider[]; ready?: boolean }>(['network', 'providers', browse.q.trim(), browse.category, browse.sort, browse.free], '/api/network/providers', params, {
    staleTime: 30_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });
}

export function useProvider(id: string | undefined) {
  return useApiQuery<{ provider: ProviderDetail }>(['network', 'provider', id], `/api/network/providers/${id}`, undefined, { enabled: !!id, staleTime: 15_000, retry: 1 });
}

export function useMyProviders() {
  return useApiQuery<{ providers: MyProvider[]; ready?: boolean }>(['network', 'mine'], '/api/network/providers', { mine: 1 }, { staleTime: 15_000, retry: 1 });
}

export interface ProviderInput {
  name: string;
  summary: string;
  category: ProviderCategory;
  endpointUrl: string;
  docsUrl?: string;
  priceUsdc?: string;
  payoutWallet: string;
  remixOfId?: string;
  /** A JSON object as text, shown to callers and used as the starting point for "Try it". */
  exampleRequest?: string;
}

/** The setup sent with a provider or an edit: everything is optional. */
export interface ProviderSetupInput {
  /** The owner's own terms for users. null removes them (on an edit). */
  customTerms?: { text?: string; url?: string } | null;
  inputFields?: InputField[];
  requirements?: string[];
  setupUrl?: string | null;
  teamNotes?: string | null;
  auth?: ReturnType<typeof authPayload>;
}

/** A new provider: the listing, its setup, and the per-listing confirmation that they own the service. Who they are lives on the creator profile. */
export type NewProviderInput = ProviderInput & ProviderSetupInput & { rightsConfirmed: true };

/** Changes to one of the person's own providers. Unchanged fields can be left out or sent as they are. */
export type ProviderEdit = Partial<Omit<ProviderInput, 'remixOfId' | 'docsUrl' | 'exampleRequest'>> &
  ProviderSetupInput & {
    docsUrl?: string | null;
    exampleRequest?: string | null;
  };

export function useUpdateProvider() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; changes: ProviderEdit }) =>
      call<{ provider: { id: string; status: string }; sentForReview: boolean; wasLive: boolean }>(`/api/network/providers/${input.id}`, { method: 'PATCH', body: input.changes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['network'] }),
  });
}

export function useProviderAction() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: 'pause' | 'resume' }) =>
      call<{ provider: { id: string; status: string } }>(`/api/network/providers/${input.id}`, { method: 'PATCH', body: { action: input.action } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['network'] }),
  });
}

export function useDeleteProvider() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call<{ ok: true }>(`/api/network/providers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['network'] }),
  });
}

export function useSubmitProvider() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProviderInput) => call<{ provider: { id: string; status: string } }>('/api/network/providers', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['network'] }),
  });
}

/** Someone who signed up to add providers: who they are, how to reach them, and which version of the provider terms they agreed to. */
export interface Creator {
  operatorType: 'individual' | 'company' | string;
  companyName: string | null;
  companyWebsite: string | null;
  contactEmail: string;
  termsVersion: string;
  termsAcceptedAt: string | null;
}

export interface CreatorState {
  creator: Creator | null;
  /** The current provider-terms version. */
  termsVersion: string;
  /** false when they signed up under older terms and must agree again before adding a provider. */
  termsCurrent: boolean;
  /** false while the server is still being set up. */
  ready?: boolean;
}

/** Whether the signed-in person has signed up as a provider creator (an opt-in; not everyone is one). */
export function useCreator() {
  return useApiQuery<CreatorState>(['network', 'creator'], '/api/creator', undefined, { staleTime: 15_000, retry: 1 });
}

/** True only once the server says they are a creator. While loading, or if the call fails, it is false: Shar, Activity and Help stay hidden. */
export function useIsCreator() {
  return useCreator().data?.creator != null;
}

/** Sign up to be a creator, or agree again after the provider terms changed. */
export function useBecomeCreator() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReturnType<typeof creatorPayload>) => call<CreatorState>('/api/creator', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['network'] }),
  });
}

/** Change who they are or their contact email (free; their providers are not sent back for review). */
export function useUpdateCreator() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: { operatorType?: 'individual' | 'company'; companyName?: string | null; companyWebsite?: string | null; contactEmail?: string }) =>
      call<CreatorState>('/api/creator', { method: 'PATCH', body: changes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['network'] }),
  });
}

/** "I agree to the owner's terms": recorded on the server for this exact version, and required before the provider can be used. */
export function useAcceptTerms() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; hash: string }) => call<{ accepted: true; acceptedAt: string }>(`/api/network/providers/${input.id}/terms`, { method: 'POST', body: { hash: input.hash } }),
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: ['network', 'provider', input.id] });
    },
  });
}

/** Calls a verified provider through the gateway with a JSON request (this is what counts as a use and earns its owner Shar). */
export function useTryProvider() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown> }) =>
      call<{ providerStatus: number; data: unknown; chargedMicro: number; balanceMicro: number | null }>(`/api/network/providers/${input.id}/call`, { method: 'POST', body: input.body ?? {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network'] });
      qc.invalidateQueries({ queryKey: ['credits'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ── Activity: one history across Shar, credits and commission ───────────────────

/** The signed-in person's history, newest first, a page at a time (pass `fetchNextPage` as they scroll). */
export function useActivity(source: ActivitySource = 'all') {
  const call = useApiClient();
  return useInfiniteQuery({
    queryKey: ['activity', source],
    queryFn: ({ pageParam }) =>
      call<ActivityPage>('/api/activity/feed', { query: { source: source === 'all' ? undefined : source, limit: 25, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: 1,
  });
}

// ── Credits, commission and admin (paid providers + SKR payouts) ──────────────

export { microToUsd, priceUsd };

export interface CreditsInfo {
  ready: boolean;
  /** False until the server has a deposit address set. */
  enabled: boolean;
  balanceMicro: number;
  depositAddress: string | null;
  minTopupMicro: number;
  activity: { id: string; kind: 'topup' | 'call' | 'refund'; amountMicro: number; listing: string | null; at: string }[];
}

export function useCredits() {
  return useApiQuery<CreditsInfo>(['credits'], '/api/credits', undefined, { staleTime: 15_000, retry: 1 });
}

export function useTopup() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (signature: string) => call<{ credited: boolean; amountMicro: number; balanceMicro: number }>('/api/credits/topup', { method: 'POST', body: { signature } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credits'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export interface EarningsPayout {
  id: string;
  usdMicro: number;
  skrMicro: number | null;
  status: 'requested' | 'sending' | 'paid' | 'rejected';
  wallet: string;
  at: string;
  paidAt: string | null;
  tx: string | null;
}

export interface EarningsInfo {
  ready: boolean;
  availableMicro: number;
  lifetimeMicro: number;
  minWithdrawMicro: number;
  /** The owner's share of each paid call, in percent. */
  ownerPct: number;
  canWithdraw: boolean;
  open: EarningsPayout | null;
  payouts: EarningsPayout[];
}

export function useEarnings() {
  return useApiQuery<EarningsInfo>(['earnings'], '/api/earnings', undefined, { staleTime: 15_000, retry: 1 });
}

export function useWithdraw() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wallet: string) => call<{ payout: { id: string; usdMicro: number; wallet: string } }>('/api/earnings/withdraw', { method: 'POST', body: { wallet } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['earnings'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ── Admin (only ever shown to people on the server's admin list; the server checks again on every call) ──

export function useAdminMe() {
  const call = useApiClient();
  return useQuery<{ admin: boolean }>({
    queryKey: ['admin', 'me'],
    queryFn: async () => {
      const me = await call<{ admin?: unknown }>('/api/admin/me');
      if (me.admin !== true) return { admin: false };
      // Belt and braces: the Admin row only shows when the queue itself agrees (a team member is let in, anyone else is refused).
      try {
        await call('/api/admin/queue');
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return { admin: false };
      }
      return { admin: true };
    },
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export type PayoutKind = 'shar_claim' | 'commission';

export type RiskFlag = 'shared_device' | 'shared_wallet' | 'linked_paid';

/** Whether an account is linked to others by phone or wallet. Any flag must be acknowledged before paying. */
export interface RiskInfo {
  flags: RiskFlag[];
  /** Notes that don't block paying ("no_device": no phone on record for this account). */
  info: 'no_device'[];
  linkedAccounts: number;
  /** False until the server's device table exists, so only the wallet check ran. */
  deviceChecks: boolean;
}

export const RISK_TEXT: Record<RiskFlag | 'no_device', string> = {
  shared_device: 'Another account has used the same phone.',
  shared_wallet: 'Another account asked for a payout to this same wallet.',
  linked_paid: 'A linked account has already been paid out.',
  no_device: 'No phone on record for this account.',
};

export interface QueuePayout {
  kind: PayoutKind;
  id: string;
  userId: string;
  wallet: string;
  status: 'requested' | 'sending' | 'paid';
  shar: number | null;
  skr: string | null;
  usd: string | null;
  tx: string | null;
  note: string | null;
  at: string | null;
  ageMinutes: number;
  /** Links to other accounts; only worked out for payouts still waiting. */
  risk: RiskInfo | null;
}

export interface QueueListing {
  id: string;
  name: string;
  summary: string;
  category: string;
  endpointUrl: string;
  docsUrl: string | null;
  priceUsdc: string;
  payoutWallet: string;
  remixOfId: string | null;
  ownerUserId: string;
  at: string | null;
  /** What the team last asked the owner ("needs more info"), still waiting for an answer. */
  reviewNote: string | null;
  /** Their inputs, requirements, private notes for the team and what kind of key is saved (never the key). */
  config: {
    inputFields: InputField[] | null;
    requirements: string[] | null;
    setupUrl: string | null;
    teamNotes: string | null;
    auth: { type: AuthType; header: string | null; hasSecret: boolean };
  };
  /** Their own terms for the people who use it (the team checks them against Bluvfi's rules), or null. */
  ownerTerms: OwnerTerms | null;
  /** Who is behind it and the terms they agreed to. null for a listing from before these questions were asked. */
  publisher: {
    operatorType: 'individual' | 'company' | string;
    companyName: string | null;
    companyWebsite: string | null;
    contactEmail: string;
    rightsConfirmed: boolean;
    termsVersion: string;
    termsAcceptedAt: string | null;
  } | null;
}

export interface AdminQueue {
  listings: QueueListing[];
  /** Agent (x402) payments whose settlement we never heard back about: check each one on-chain. Empty when all is well. */
  stuckX402?: { id: string; listingId: string; listing: string | null; payer: string | null; amountMicro: number; since: string }[];
  payouts: { waiting: QueuePayout[]; sending: QueuePayout[]; paid: QueuePayout[] };
  treasury: { configured: true; address: string; skr: string; sol: string } | { configured: false };
  limits: { maxPayoutSkr: number; dailyCapSkr: number; paidLast24hSkr: string; maxQuoteDriftPct: number };
  audit: { id: string; admin: string; action: string; targetType: string; targetId: string; detail: string | null; at: string | null }[];
}

export function useAdminQueue(enabled: boolean) {
  return useApiQuery<AdminQueue>(['admin', 'queue'], '/api/admin/queue', undefined, { enabled, staleTime: 5_000, refetchInterval: enabled ? 20_000 : false, retry: 0 });
}

export interface PayoutQuote {
  kind: PayoutKind;
  id: string;
  wallet: string;
  skrMicro: number;
  skr: string;
  usdMicro: number | null;
  usdPerSkr: string | null;
  priceImpactPct: number | null;
  treasury: { address: string; skr: string; sol: string } | null;
  risk: RiskInfo;
}

export function usePayoutQuote(kind: PayoutKind | null, id: string | null) {
  return useApiQuery<{ quote: PayoutQuote }>(['admin', 'quote', kind, id], `/api/admin/payouts/${kind}/${id}`, undefined, { enabled: !!kind && !!id, staleTime: 0, gcTime: 0, retry: 0 });
}

export function usePayoutAction() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: PayoutKind; id: string; action: 'pay' | 'reject' | 'reconcile'; note?: string; expectedSkrMicro?: number; acknowledgeRisk?: boolean }) =>
      call<{ status?: string; signature?: string; skrMicro?: number; outcome?: string; message?: string }>(`/api/admin/payouts/${input.kind}/${input.id}`, {
        method: 'POST',
        body: { action: input.action, note: input.note, expectedSkrMicro: input.expectedSkrMicro, acknowledgeRisk: input.acknowledgeRisk },
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useReviewListing() {
  const call = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: 'verify' | 'reject' | 'request_info' | 'pause' | 'feature' | 'unfeature'; note?: string }) =>
      call<{ id: string; status: string; featured?: boolean }>(`/api/network/providers/${input.id}/review`, { method: 'POST', body: { action: input.action, note: input.note } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['network'] });
    },
  });
}
