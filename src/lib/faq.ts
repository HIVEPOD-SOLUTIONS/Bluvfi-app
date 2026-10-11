import { microToUsd } from '@/lib/money';

/**
 * The FAQ, as data. Every number in an answer comes from `FaqFacts`, which the screen fills from the server's live rules, so an answer
 * can't drift from what the app really does. Pure, so it can be tested.
 */

export interface FaqFacts {
  perUsd: number;
  minPurchaseUsd: number;
  referralBonusPct: number;
  providerUseShar: number;
  skrPerShar: number;
  minClaimShar: number;
  /** The owner's share of each paid call, in percent. */
  ownerPct: number;
  minWithdrawMicro: number;
  minTopupMicro: number;
  maxClaimAccountsPerPhone: number;
}

/** What to say before the live rules have loaded (or if they can't). Mirrors the server's own constants. */
export const DEFAULT_FACTS: FaqFacts = {
  perUsd: 1,
  minPurchaseUsd: 10,
  referralBonusPct: 10,
  providerUseShar: 1,
  skrPerShar: 0.9,
  minClaimShar: 1000,
  ownerPct: 80,
  minWithdrawMicro: 5_000_000,
  minTopupMicro: 1_000_000,
  maxClaimAccountsPerPhone: 3,
};

/** A link under an answer: either a screen in the app, or a question for the assistant. */
export type FaqLink = { label: string; to: '/shar' | '/network' | '/activity' | '/profile' | '/creator' } | { label: string; ask: string };

export interface FaqItem {
  id: string;
  q: string;
  a: string;
  links?: FaqLink[];
}

export interface FaqSection {
  key: 'start' | 'shar' | 'network' | 'safety';
  title: string;
  intro?: string;
  items: FaqItem[];
}

const n = (v: number) => v.toLocaleString('en-US');

export function buildFaq(f: FaqFacts = DEFAULT_FACTS): FaqSection[] {
  const minTopup = microToUsd(f.minTopupMicro);
  const minWithdraw = microToUsd(f.minWithdrawMicro);
  return [
    {
      key: 'start',
      title: 'Getting started',
      intro: 'The basics of Bluvfi: your money, your assistant and where to see what happened.',
      items: [
        {
          id: 'what-is-bluvfi',
          q: 'What is Bluvfi?',
          a: 'Bluvfi is a money assistant on Solana. Tell it what you need in plain words and it does the work: it can pay bills, buy gift cards and eSIMs, check crypto and stock prices, swap crypto, and more. Your wallet stays yours; nothing moves until you approve it.',
          links: [{ label: 'Ask the assistant what it can do', ask: 'What can you do for me?' }],
        },
        {
          id: 'add-money',
          q: 'How do I add money?',
          a: 'Open your profile and use your wallet card to connect a Solana wallet, or fund the wallet Bluvfi created for you. For the open provider network, add credits on the Network screen instead; those are separate and only used for paid providers.',
          links: [{ label: 'Open profile', to: '/profile' }],
        },
        {
          id: 'what-can-i-buy',
          q: 'What can I buy?',
          a: 'Ask for it in chat. Gift cards, top-ups and eSIMs, bills, crypto and stocks are all available through the assistant. If something isn’t available yet, it will tell you rather than guess.',
          links: [{ label: 'Ask the assistant', ask: 'What can I buy here?' }],
        },
        {
          id: 'recovery',
          q: 'What if I lose my phone?',
          a: 'Sign back in on a new phone with the same login you used before. Your account and Shar are tied to your login, not the phone. A wallet you connected yourself is only on your own wallet app, so keep its recovery phrase safe; we never see it and can’t recover it for you.',
        },
        {
          id: 'assistant-limits',
          q: 'What can the assistant do on its own?',
          a: 'It can look things up, prepare a payment and explain what it found. It can’t spend your money by itself: every payment shows you the amount and where it goes, and you confirm it first.',
        },
        {
          id: 'activity-what',
          q: 'What shows up in my Activity?',
          a: 'One list of everything that moved: Shar you earned, claimed or spent, credits you added or used on providers, and commission you earned from your own providers. Money out of your pocket shows with a minus; money in shows with a plus. Anything still waiting is marked Pending, In review or On its way.',
          links: [{ label: 'Open Activity', to: '/activity' }],
        },
      ],
    },
    {
      key: 'shar',
      title: 'Shar and rewards',
      intro: 'Shar is Bluvfi’s reward points. You earn it by using the app, and you can turn it into SKR.',
      items: [
        {
          id: 'shar-what',
          q: 'What is Shar?',
          a: `Shar is the reward you earn for using Bluvfi. It’s also the light in the Seeker’s story that guides you through the app. Your Shar grows your rank, sets your place on the weekly board, and can be claimed as SKR once you have ${n(f.minClaimShar)} or more.`,
          links: [{ label: 'Open Shar', to: '/shar' }],
        },
        {
          id: 'shar-earn',
          q: 'How do I earn Shar?',
          a: `Every purchase of $${f.minPurchaseUsd} or more earns ${f.perUsd} Shar per $1 you spend, once the payment completes. You also earn ${f.referralBonusPct}% of the Shar a friend earns from spending when they use your code, and ${f.providerUseShar} Shar each time someone uses a provider you added to the open network.`,
        },
        {
          id: 'shar-pending',
          q: 'What does Pending mean?',
          a: 'Shar from a purchase is Pending until the payment is complete. Once it is, it moves to Available and you can claim it. Only completed payments earn Shar.',
        },
        {
          id: 'shar-claim',
          q: 'How do I claim SKR?',
          a: `When you have ${n(f.minClaimShar)} Shar or more available, tap Claim on the Shar screen and pick the wallet to receive it. 1 Shar is ${f.skrPerShar} SKR, fixed at the moment you claim. The team reviews each claim and sends the SKR to your wallet, so it can take a little while. You’ll see it as In review, then On its way, then done.`,
          links: [{ label: 'Open Shar', to: '/shar' }],
        },
        {
          id: 'shar-spend-skr',
          q: 'Can I spend the SKR I claim?',
          a: 'Yes. Claimed SKR lands in your wallet. On the Shar screen you can convert it to USDC yourself ("Convert to USDC") and spend that whenever you like, or turn on "Use my SKR when I’m short on USDC" and a payment will convert just the missing amount for you. Conversion happens in your own wallet at the current market price, and you approve it in your wallet like any payment.',
          links: [{ label: 'Open Shar', to: '/shar' }],
        },
        {
          id: 'shar-skr-to-bluvfi',
          q: 'My SKR is in my Seeker wallet. How do I spend it?',
          a: 'Connect your Seeker wallet, pick it as the wallet to use, then open Convert to USDC on the Shar screen. It converts the SKR in that wallet and, with “Then send the USDC to my Bluvfi wallet” ticked (it is by default), sends the USDC on to your Bluvfi wallet in a second approval, because that is where payments are made from. If the second step fails or you decline it, nothing is lost: the USDC stays safe in your Seeker wallet and you can send it again. You need a little SOL in the Seeker wallet for both network fees.',
          links: [{ label: 'Open Shar', to: '/shar' }],
        },
        {
          id: 'shar-skr-safety',
          q: 'Is converting SKR safe? What does it cost?',
          a: 'The conversion is built by Jupiter, checked on your phone before anything is signed (it must only swap, only you can sign it, and it must pay out at least the amount quoted), and approved in your wallet. You see the price and the guaranteed minimum first. It costs a small network fee in SOL (about 0.003 SOL is enough) and the market price, which can move slightly. If anything looks wrong it stops before signing, and nothing moves. Paying with SKR still earns Shar, because the purchase itself is a normal USDC payment.',
        },
        {
          id: 'shar-expire',
          q: 'Does Shar expire?',
          a: 'Not today. What you have already earned stays yours, even if the rules change later to keep Shar fair. The weekly board resets every Monday at 00:00 UTC, but your balance and rank don’t.',
        },
        {
          id: 'shar-ranks',
          q: 'What are the ranks?',
          a: 'You move up as your total Shar grows: Spark, Wisp (100), Guide (500) and Seeker (2,000). Ranks are recognition for now; the SKR you can claim depends only on your Shar.',
        },
        {
          id: 'shar-weekly',
          q: 'What is the weekly trial?',
          a: 'A leaderboard of the Shar people earned this week. It starts fresh every Monday at 00:00 UTC. Only the Shar you earn that week counts towards it.',
        },
        {
          id: 'shar-referral',
          q: 'How do referrals work?',
          a: `Share your code or link from the Shar screen. When a friend enters it, you earn ${f.referralBonusPct}% of the Shar they earn from their own spending. It doesn’t reduce theirs. Only spending after they enter your code counts. A code can be used once per account, and you can’t use your own.`,
          links: [{ label: 'Get my code', to: '/shar' }],
        },
      ],
    },
    {
      key: 'network',
      title: 'Open provider network',
      intro: 'Anyone can use the providers here. Creators, an optional sign-up, can list their own provider or protocol for people and AI agents to use. Here is how it works.',
      items: [
        {
          id: 'network-what',
          q: 'What is the open network?',
          a: 'A shared directory of providers, protocols, data and tools that people and AI agents can use through Bluvfi. You can explore what’s there and try a provider. If you want to list your own, sign up as a creator first (it’s optional). Seeker creators whose providers pass review can be promoted into Bluvfi’s official Bills, Invest or Banking provider lists for the right use case.',
          links: [{ label: 'Open the network', to: '/network' }],
        },
        {
          id: 'network-add',
          q: 'How do I add a provider?',
          a: 'First sign up as a creator (see below), which you only do once. Then on the Network screen tap Add, and give it a name, what it does, its web address and a price per call (or free), and tick that you own the service or may offer it. Pick the category carefully: it tells Bluvfi whether a Seeker creator’s approved provider belongs in Bills, Invest or Banking as an official built-in provider. The team checks each listing before it goes public. You can also list the inputs people fill in, steps they need to do first, and the key Bluvfi should use to call your service (all optional).',
          links: [{ label: 'Add a provider', to: '/network' }],
        },
        {
          id: 'network-creator',
          q: 'Do I have to be a creator?',
          a: 'No. Anyone can use providers. Being a creator is an optional, free sign-up for people who want to list their own. If you’re a Seeker creator, Bluvfi can promote an approved provider into the official built-in provider list for its use case. You say whether you’re an individual or a company or team, give a contact email only the Bluvfi team sees, and agree to the provider terms once. If the terms change you’ll be asked to agree again before adding another provider, and your existing providers keep working. You can change your details any time from your creator profile, and that doesn’t send your providers back for review.',
          links: [{ label: 'Become a creator', to: '/creator' }],
        },
        {
          id: 'network-inputs',
          q: 'What are request inputs?',
          a: 'Inputs are the details someone fills in to use your provider, like a city or a number of days. List them when you add your provider and people get a simple form instead of typing JSON. A request that doesn’t fit (a missing required input, or a word where a number belongs) is refused before anyone is charged. Leave them out and your provider accepts any JSON.',
        },
        {
          id: 'network-setup',
          q: 'Can I require setup before someone uses my provider?',
          a: 'Yes. Add up to five steps, like creating a free account with you, and an optional setup link. People see them on your provider’s page and tick “I’ve done this” before Try it turns on. Changing the steps sends a live provider back for a quick check.',
        },
        {
          id: 'network-own-terms',
          q: 'Can I set my own terms for my provider?',
          a: 'Yes. Under “Your terms for people who use it” on the provider form, add your own terms (up to 2,000 characters) and/or a link to the full terms. People have to agree to them on your provider’s page before they can use it, and Bluvfi records which version each person agreed to. Your terms sit on top of Bluvfi’s Terms of Service, which always apply, and the team can decline or remove a listing whose terms break Bluvfi’s rules. If you change them, everyone is asked to agree again and a live provider goes back for a quick review. Have a lawyer check your terms: Bluvfi doesn’t write or vouch for them.',
        },
        {
          id: 'network-terms-user',
          q: 'A provider has its own terms. Do I have to agree?',
          a: 'Yes, to use that provider. Its page shows the owner’s terms, and Try it stays off until you tick “I agree”. The owner wrote those terms, not Bluvfi, so read them. Your agreement is saved for that exact version; if the owner changes the terms you’ll be asked again. You’re never charged before you agree. Bluvfi’s own Terms of Service apply to everything you do in the app either way.',
        },
        {
          id: 'network-key',
          q: 'Is my API key safe with Bluvfi?',
          a: 'If your API needs a key, you choose how Bluvfi sends it (an API-key header or a bearer token) and paste it once. It’s stored encrypted, only ever sent to your own endpoint, and never shown again, not to you and not to the team, who only see whether one is saved. You can replace it any time from Edit.',
        },
        {
          id: 'network-team-question',
          q: 'What if the team asks me a question?',
          a: 'Sometimes we need something before approving a listing, like which regions you serve. You’ll see the question on your provider’s card. Answer it in “Notes for the Bluvfi team” when you edit it, and save. It stays in the review queue until the team approves it. Use those notes the other way too: tell us anything we should do first, like IP addresses to allow.',
        },
        {
          id: 'network-review',
          q: 'Why was my listing declined or sent back?',
          a: 'The team checks that the address works, that it’s safe and that the description is honest. A declined listing shows the reason, and you can fix it and send it again. If you change the name, description, category, address, docs link, price, inputs, steps or setup link of a live listing, it goes back for a quick review. Your example request, payout wallet, key, notes for the team and contact details can change at any time.',
        },
        {
          id: 'network-credits',
          q: 'What are credits?',
          a: `Credits pay for paid providers. Add at least ${minTopup} in USDC on Solana from the Network screen. Each call is taken from your credits, and a call that fails is refunded in full. Credits aren’t Shar and can’t be swapped for it.`,
          links: [{ label: 'Add credits', to: '/network' }],
        },
        {
          id: 'network-earn',
          q: 'How do I earn from my provider?',
          a: `When someone uses your paid provider, you keep ${f.ownerPct}% of what they paid. It builds up as commission on the Network screen. Once you have at least ${minWithdraw}, you can withdraw it, and it is paid out to you in SKR, priced when the team sends it. You also earn ${f.providerUseShar} Shar per use, with daily limits to keep it fair.`,
          links: [{ label: 'See my earnings', to: '/activity' }],
        },
        {
          id: 'network-pause',
          q: 'Can I pause or remove my provider?',
          a: 'Yes. Open your provider from My providers and choose Pause, Resume or Remove. A paused provider disappears from search and nobody can call it until you resume. Past usage and earnings are kept.',
        },
      ],
    },
    {
      key: 'safety',
      title: 'Safety and account',
      items: [
        {
          id: 'safety-accounts',
          q: 'Can I have more than one account?',
          a: `You can, but rewards are meant for one person. To keep it fair, one phone can claim for up to ${f.maxClaimAccountsPerPhone} accounts and accounts that share a phone or payout wallet are reviewed by hand before a claim is paid. A review can take a little longer; it isn’t a penalty.`,
        },
        {
          id: 'safety-failed',
          q: 'What if a payment fails?',
          a: 'You aren’t charged for a failed provider call, and credits are refunded. For a purchase, the assistant tells you what happened and nothing is taken unless it completes. If something looks wrong, ask the assistant or message us and we’ll check.',
          links: [{ label: 'Ask the assistant', ask: 'A payment of mine looks wrong. Can you check my recent payments?' }],
        },
        {
          id: 'safety-privacy',
          q: 'Who can see my activity?',
          a: 'Only you, and the Bluvfi team when a claim or payout needs reviewing. The leaderboard shows only your handle and your Shar. We never see your wallet’s recovery phrase.',
        },
      ],
    },
  ];
}

/** Every item with its section, in reading order. */
export const allItems = (sections: FaqSection[]): (FaqItem & { section: FaqSection['key'] })[] =>
  sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.key })));

/** The section a `?section=` value names, or null when it isn't one. */
export const sectionByKey = (sections: FaqSection[], key: unknown): FaqSection | null => sections.find((s) => s.key === key) ?? null;

/** The item a `?open=` value names, or null when it isn't one. */
export const itemById = (sections: FaqSection[], id: unknown): (FaqItem & { section: FaqSection['key'] }) | null =>
  allItems(sections).find((i) => i.id === id) ?? null;

/** Facts from whatever the screen has loaded; anything not loaded keeps the default. */
export function factsFrom(parts: {
  rules?: Partial<Pick<FaqFacts, 'perUsd' | 'minPurchaseUsd' | 'referralBonusPct' | 'providerUseShar' | 'skrPerShar' | 'minClaimShar'>>;
  earnings?: { ownerPct?: number; minWithdrawMicro?: number } | null;
  credits?: { minTopupMicro?: number } | null;
}): FaqFacts {
  const out: FaqFacts = { ...DEFAULT_FACTS };
  const take = <K extends keyof FaqFacts>(k: K, v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v as FaqFacts[K];
  };
  for (const k of ['perUsd', 'minPurchaseUsd', 'referralBonusPct', 'providerUseShar', 'skrPerShar', 'minClaimShar'] as const) take(k, parts.rules?.[k]);
  take('ownerPct', parts.earnings?.ownerPct);
  take('minWithdrawMicro', parts.earnings?.minWithdrawMicro);
  take('minTopupMicro', parts.credits?.minTopupMicro);
  return out;
}
