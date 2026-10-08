import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useChatSheet } from '@/lib/chat-context';
import { useIsCreator } from '@/hooks/use-shar';
import { PayFromWallet } from './PayFromWallet';
import { CoinLogo } from '@/components/crypto/CoinLogo';
import { formatPrice } from '@/components/crypto/CoinSheet';

/**
 * Renders an AI tool's `output-available` result in the chat. The tools bluvfi's assistant most often
 * returns (product details, orders, bills, market prices, payment history, wallet balance) get the same
 * cards as the web chat; any other informational tool falls back to a generic key/value card.
 */
export function ToolResultCard({ toolName, output }: { toolName: string; output: unknown }) {
  let data: any = output;
  if (typeof output === 'string') {
    try {
      data = JSON.parse(output);
    } catch {
      return null;
    }
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorText}>{String(data.error)}</Text>
      </View>
    );
  }

  // buy_bitrefill_product: invoice created, waiting on payment.
  if (toolName === 'buy_bitrefill_product' && data?.pendingBitrefillPayment) {
    return <PendingPaymentCard data={data} />;
  }

  // buy_bitrefill_product after the payment card reported back: a short confirmation (the card itself is gone).
  if (toolName === 'buy_bitrefill_product') {
    if (data?.paid === true) {
      return (
        <View style={[styles.card, styles.successCard]}>
          <Text style={styles.successTitle}>✓ Payment sent — confirming with Bitrefill…</Text>
        </View>
      );
    }
    return null;
  }

  // get_product_details: the denominations the user can pick from.
  if (toolName === 'get_product_details') {
    const packages: { package_value: string; price_usd?: number }[] = data?.packages ?? [];
    const range = data?.range as { min: number; max: number; step: number } | null;
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {data?.name ?? data?.id}
          </Text>
          {data?.recipient_type ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{String(data.recipient_type).replace(/_/g, ' ')}</Text>
            </View>
          ) : null}
        </View>
        {packages.length > 0 ? (
          <View style={styles.chips}>
            {packages.map((p) => (
              <View key={p.package_value} style={styles.chip}>
                <Text style={styles.chipText}>{p.price_usd != null ? `$${p.price_usd}` : p.package_value}</Text>
              </View>
            ))}
          </View>
        ) : range ? (
          <Text style={styles.sub}>
            Custom amount: ${range.min}–${range.max} (step ${range.step})
          </Text>
        ) : null}
      </View>
    );
  }

  // poll_bitrefill_order: code ready, failed, or still in progress.
  if (toolName === 'poll_bitrefill_order') return <OrderStatusCard data={data} />;

  if (toolName === 'get_bills' && Array.isArray(data?.bills)) {
    return (
      <ListCard
        title="Bills & Subscriptions"
        rows={data.bills.map((b: any) => ({
          key: String(b.id),
          title: b.name,
          sub: `${b.category ?? ''}${b.dueDay ? ` · due the ${b.dueDay}${ordinal(b.dueDay)}` : ''}`,
          right: `$${Number(b.amount).toFixed(2)}`,
        }))}
      />
    );
  }

  if ((toolName === 'get_investments' || toolName === 'get_market_prices') && Array.isArray(data?.assets)) {
    return (
      <ListCard
        title="Market Prices"
        rows={data.assets.map((a: any) => {
          const change = Number(a.change24h ?? 0);
          return {
            key: String(a.symbol),
            title: a.symbol,
            sub: a.name,
            right: `$${Number(a.priceUsd).toFixed(2)}`,
            rightSub: a.change24h !== undefined ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : undefined,
            rightSubColor: change >= 0 ? Colors.sage : Colors.redAlert,
          };
        })}
      />
    );
  }

  if (toolName === 'get_payment_history' && Array.isArray(data?.payments)) {
    if (data.payments.length === 0) return <ListCard title="Payment History" rows={[]} emptyText="No payments yet." />;
    return (
      <ListCard
        title="Payment History"
        rows={data.payments.map((p: any) => ({
          key: String(p.id),
          title: p.description,
          sub: `${p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}${p.type ? ` · ${p.type}` : ''}`,
          right: `$${fmtUsdc(Number(p.amountUsdc))}`,
          rightSub: p.status,
        }))}
      />
    );
  }

  if (toolName === 'get_wallet_balance' && Array.isArray(data?.tokens)) {
    return (
      <ListCard
        title="Wallet balance"
        rows={data.tokens.map((t: any, i: number) => ({ key: String(i), title: t.symbol, right: String(t.balance) }))}
      />
    );
  }

  const network = renderNetworkCard(toolName, data);
  if (network) return network;

  const crypto = renderCryptoCard(toolName, data);
  if (crypto) return crypto;

  const invest = renderInvestCard(toolName, data);
  if (invest) return invest;

  // Everything else: a compact key/value summary.
  const rows = summarize(data);
  if (rows.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{formatToolName(toolName)}</Text>
      {rows.map(([key, value]) => (
        <View key={key} style={styles.kvRow}>
          <Text style={styles.key}>{key}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

/** Bitrefill deposit-address methods the Bluvfi wallet itself can pay (the rest need coins it can't hold, so they stay manual). */
const BITREFILL_WALLET_METHODS: Record<string, { coin: string; network: string }> = {
  ethereum: { coin: 'ETH', network: 'ETH Mainnet' },
  eth_base: { coin: 'ETH', network: 'Base' },
  eth_arbitrum: { coin: 'ETH', network: 'Arbitrum' },
  solana: { coin: 'SOL', network: 'Solana' },
};

function PendingPaymentCard({ data }: { data: any }) {
  const isTopup = !!data.isTopup;
  const walletMethod = BITREFILL_WALLET_METHODS[data.paymentMethod ?? ''];
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          {data.paymentAmount != null ? `${data.paymentAmount} ${data.paymentCurrency ?? ''}` : 'Payment pending'}
        </Text>
        {data.expiresInMinutes ? <Text style={styles.tinyText}>Expires in {data.expiresInMinutes}m</Text> : null}
      </View>
      {data.isAddressBased ? (
        <>
          <Text style={styles.warn}>⚠ Send manually — this network isn't paid automatically.</Text>
          <View style={styles.codeBox}>
            <Text style={styles.tinyText}>Deposit address</Text>
            <Text style={styles.mono} selectable>
              {data.paymentAddress}
            </Text>
          </View>
          {walletMethod && data.paymentAmount != null ? (
            <PayFromWallet
              coin={walletMethod.coin}
              network={walletMethod.network}
              address={data.paymentAddress}
              amount={String(data.paymentAmount)}
              orderKey={`br_${data.invoiceId ?? data.paymentAddress}`}
              sentLabel="Sent from your wallet ✓ — ask me to check the order in a minute."
            />
          ) : null}
        </>
      ) : (
        <Text style={styles.sub}>
          Payment confirmation from the app is coming soon. You can finish this purchase on the Bluvfi web app.
        </Text>
      )}
      {data.recipientEmail ? (
        <Text style={styles.sub}>
          {isTopup ? 'Receipt → ' : 'Code → '}
          <Text style={styles.strong}>{data.recipientEmail}</Text>
        </Text>
      ) : null}
      <Text style={styles.tinyMono}>Invoice {data.invoiceId}</Text>
    </View>
  );
}

function OrderStatusCard({ data }: { data: any }) {
  if (data?.status === 'complete' && data?.code) {
    return (
      <View style={[styles.card, styles.successCard]}>
        <Text style={styles.successTitle}>{data.productName ?? 'Digital product'} — Ready ✓</Text>
        <View style={styles.codeBox}>
          <Text style={styles.tinyText}>Redemption Code</Text>
          <Text style={styles.code} selectable>
            {data.code}
          </Text>
        </View>
        {data.esimInstallLink ? (
          <Pressable onPress={() => Linking.openURL(data.esimInstallLink)}>
            <Text style={styles.link}>Install eSIM ↗</Text>
          </Pressable>
        ) : null}
        {data.instructions ? <Text style={styles.sub}>{data.instructions}</Text> : null}
      </View>
    );
  }
  if (data?.status === 'complete') {
    return (
      <View style={[styles.card, styles.successCard]}>
        <Text style={styles.successTitle}>
          {data.productName ?? 'Order'} delivered ✓ — {data.message ?? 'No code required.'}
        </Text>
      </View>
    );
  }
  if (['failed', 'expired', 'cancelled'].includes(data?.status)) {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorText}>{data.error ?? `Payment ${data.status}. Please try again.`}</Text>
      </View>
    );
  }
  const labels: Record<string, string> = {
    payment_detected: 'Payment detected · awaiting confirmation…',
    payment_confirmed: 'Payment confirmed · processing order…',
    pending: 'Processing your order…',
  };
  return (
    <View style={styles.card}>
      <Text style={styles.sub}>{labels[data?.status] ?? 'Waiting for payment confirmation…'}</Text>
    </View>
  );
}

/** Live-price tool results: a list of coins with logos and 24h change, or the market summary / conversion. */
function renderCryptoCard(toolName: string, data: any) {
  const coinRows = (coins: any[]): ListRow[] =>
    coins.map((c) => {
      const change = c.change24hPct;
      return {
        key: String(c.id ?? c.symbol),
        logo: { id: c.id ?? undefined, symbol: String(c.symbol) },
        title: String(c.symbol),
        sub: c.name,
        right: typeof c.price === 'number' ? formatPrice(c.price) : undefined,
        rightSub: typeof change === 'number' ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : undefined,
        rightSubColor: typeof change === 'number' ? (change >= 0 ? Colors.sage : Colors.redAlert) : undefined,
      };
    });
  const asOf = (d: any) => (d?.asOf ? `Live · ${new Date(d.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : undefined);

  if (toolName === 'get_crypto_prices' && Array.isArray(data?.coins)) {
    return <ListCard title={asOf(data) ?? 'Prices'} rows={coinRows(data.coins)} />;
  }
  if (toolName === 'get_top_movers' && Array.isArray(data?.movers)) {
    return <ListCard title={`Top ${data.direction ?? 'movers'} · ${data.timeframe ?? '24h'}`} rows={coinRows(data.movers)} />;
  }
  if (toolName === 'get_trending_crypto' && Array.isArray(data?.trending)) {
    return <ListCard title={`Trending · ${data.timePeriod ?? '24h'}`} rows={coinRows(data.trending)} />;
  }
  if (toolName === 'get_crypto_market_overview' && data?.global) {
    const g = data.global;
    const big = (n: number | null | undefined) => (n == null ? '—' : n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : `$${(n / 1e9).toFixed(1)}B`);
    return (
      <>
        <View style={styles.card}>
          <Text style={styles.label}>{asOf(data) ?? 'Crypto market'}</Text>
          {[
            ['Market cap', big(g.totalMarketCap)],
            ['24h volume', big(g.totalVolume24h)],
            ['BTC dominance', g.btcDominancePct != null ? `${g.btcDominancePct}%` : '—'],
            ['ETH dominance', g.ethDominancePct != null ? `${g.ethDominancePct}%` : '—'],
          ].map(([k, v]) => (
            <View key={k} style={styles.kvRow}>
              <Text style={styles.key}>{k}</Text>
              <Text style={styles.value}>{v}</Text>
            </View>
          ))}
        </View>
        {Array.isArray(data.topByMarketCap) && data.topByMarketCap.length > 0 ? (
          <ListCard title="Top by market cap" rows={coinRows(data.topByMarketCap)} />
        ) : null}
      </>
    );
  }
  if (toolName === 'convert_crypto' && data?.results && typeof data.results === 'object') {
    return (
      <ListCard
        title={`${data.amount} ${data.from}`}
        rows={Object.entries<any>(data.results).map(([cur, r]) => ({
          key: cur,
          title: cur.toUpperCase(),
          sub: r?.ratePerUnit != null ? `1 ${data.from} = ${r.ratePerUnit}` : undefined,
          right: r?.total != null ? Number(r.total).toLocaleString('en-US', { maximumFractionDigits: 6 }) : undefined,
        }))}
      />
    );
  }
  return null;
}

interface ListRow {
  key: string;
  /** A coin logo shown before the title. */
  logo?: { id?: number | string; symbol: string };
  title: string;
  sub?: string;
  right?: string;
  rightSub?: string;
  rightSubColor?: string;
  /** Makes the row tappable (used to open a provider from the chat). */
  onPress?: () => void;
}

function ListCard({ title, rows, emptyText }: { title: string; rows: ListRow[]; emptyText?: string }) {
  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden', gap: 0 }]}>
      <Text style={[styles.label, { padding: Spacing.lg, paddingBottom: Spacing.sm, marginBottom: 0 }]}>{title}</Text>
      {rows.length === 0 && emptyText ? <Text style={[styles.sub, { padding: Spacing.lg, paddingTop: 0 }]}>{emptyText}</Text> : null}
      {rows.map((r) => (
        <Pressable key={r.key} onPress={r.onPress} disabled={!r.onPress} style={styles.listRow}>
          {r.logo ? <CoinLogo id={r.logo.id} symbol={r.logo.symbol} size={32} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {r.title}
            </Text>
            {r.sub ? (
              <Text style={styles.sub} numberOfLines={1}>
                {r.sub}
              </Text>
            ) : null}
          </View>
          {r.right ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.amount}>{r.right}</Text>
              {r.rightSub ? <Text style={[styles.tinyText, r.rightSubColor ? { color: r.rightSubColor } : null]}>{r.rightSub}</Text> : null}
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

// ─── Shar and the open provider network ───────────────────────────────────────

const fmtN = (n: unknown) => Number(n ?? 0).toLocaleString('en-US');

function renderNetworkCard(toolName: string, data: any) {
  if (toolName === 'get_my_shar' && typeof data?.sharAvailable === 'number') return <SharCard data={data} />;
  if (toolName === 'search_network_providers' && Array.isArray(data?.providers)) return <ProvidersCard data={data} />;
  if (toolName === 'get_my_network_account' && data?.commission) return <NetworkAccountCard data={data} />;
  if (toolName === 'get_provider_details' && typeof data?.name === 'string' && Array.isArray(data?.inputs)) return <ProviderDetailCard data={data} />;
  if (toolName === 'get_my_activity' && Array.isArray(data?.entries)) return <ActivityCard data={data} />;
  return null;
}

function useOpenScreen() {
  const { closeChat } = useChatSheet();
  return (target: string | { pathname: string; params: Record<string, string> }) => {
    closeChat();
    router.navigate(target as never);
  };
}

function SharCard({ data }: { data: any }) {
  const open = useOpenScreen();
  const isCreator = useIsCreator();
  const claim = data.claimInProgress;
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Your Shar</Text>
        {data.rank?.name ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{data.rank.name}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.kvRow}>
        <Text style={styles.key}>Available</Text>
        <Text style={[styles.value, styles.strong]}>{fmtN(data.sharAvailable)} Shar</Text>
      </View>
      {Number(data.sharPending) > 0 ? (
        <View style={styles.kvRow}>
          <Text style={styles.key}>Pending</Text>
          <Text style={styles.value}>{fmtN(data.sharPending)} Shar</Text>
        </View>
      ) : null}
      <View style={styles.kvRow}>
        <Text style={styles.key}>Worth</Text>
        <Text style={styles.value}>≈ {data.worthSkrIfClaimedNow} SKR</Text>
      </View>
      <View style={styles.kvRow}>
        <Text style={styles.key}>This week</Text>
        <Text style={styles.value}>{fmtN(data.sharThisWeek)} Shar</Text>
      </View>
      <Text style={styles.sub}>
        {claim
          ? `Claim in progress: ${fmtN(claim.shar)} Shar → ${claim.skr} SKR (${claim.status}).`
          : data.canClaimNow
            ? 'You can claim your Shar as SKR now.'
            : `Claiming opens at ${fmtN(data.minimumClaimShar)} Shar.`}
      </Text>
      {data.referral?.code ? (
        <Text style={styles.sub}>
          Referral code <Text style={styles.strong}>{data.referral.code}</Text> · {fmtN(data.referral.friendsJoined)} {data.referral.friendsJoined === 1 ? 'friend' : 'friends'}
        </Text>
      ) : null}
      {isCreator ? (
        <Pressable onPress={() => open('/shar')} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Text style={styles.link}>Open Shar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProvidersCard({ data }: { data: any }) {
  const open = useOpenScreen();
  return (
    <View>
      <ListCard
        title="Open network"
        emptyText="No providers match that. Try different words."
        rows={data.providers.map((p: any) => ({
          key: String(p.id),
          title: `${p.featured ? '★ ' : ''}${p.name}`,
          sub: `${p.category} · ${fmtN(p.uses)} ${p.uses === 1 ? 'use' : 'uses'}${p.needsSetupFirst ? ' · setup first' : ''}`,
          right: p.pricePerCallUsdc === 'free' ? 'Free' : `$${p.pricePerCallUsdc}`,
          rightSub: p.pricePerCallUsdc === 'free' ? undefined : 'per call',
          onPress: () => open({ pathname: '/provider/[id]', params: { id: String(p.id) } }),
        }))}
      />
      <Pressable onPress={() => open('/network')} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
        <Text style={styles.link}>{data.count > data.providers.length ? `See all ${data.count} in the network` : 'Open the network'}</Text>
      </Pressable>
    </View>
  );
}

function NetworkAccountCard({ data }: { data: any }) {
  const open = useOpenScreen();
  const c = data.commission;
  const providers: any[] = Array.isArray(data.providers) ? data.providers : [];
  return (
    <View>
      <ListCard
        title="Your network account"
        rows={[
          { key: 'credits', title: 'Credits', sub: 'For paid provider calls', right: `$${data.creditsUsd}` },
          {
            key: 'commission',
            title: 'Commission',
            sub: c.withdrawalInProgress ? `Withdrawal in progress ($${c.withdrawalInProgress.usd})` : `Earned all time: $${c.earnedAllTimeUsd}`,
            right: `$${c.availableUsd}`,
            rightSub: c.canWithdrawNow ? 'can withdraw' : `from $${c.minimumWithdrawUsd}`,
          },
          ...providers.map((p) => ({
            key: String(p.id),
            title: p.name,
            sub: p.teamQuestion ? 'The team asked: ' + p.teamQuestion : p.declinedBecause ? 'Not accepted: ' + p.declinedBecause : `${p.status} · ${fmtN(p.uses)} ${p.uses === 1 ? 'use' : 'uses'}`,
            right: p.pricePerCallUsdc === 'free' ? 'Free' : `$${p.pricePerCallUsdc}`,
            rightSub: p.teamQuestion ? 'answer it' : p.declinedBecause ? 'fix & resend' : undefined,
            rightSubColor: p.teamQuestion || p.declinedBecause ? Colors.amber : undefined,
            onPress: () => open({ pathname: '/provider/[id]', params: { id: String(p.id) } }),
          })),
        ]}
      />
      <Pressable onPress={() => open('/network')} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
        <Text style={styles.link}>Open the network</Text>
      </Pressable>
    </View>
  );
}

/** One provider in full: what it asks for, and what to do before using it. */
function ProviderDetailCard({ data }: { data: any }) {
  const open = useOpenScreen();
  const inputs: any[] = Array.isArray(data.inputs) ? data.inputs : [];
  const steps: string[] = Array.isArray(data.stepsBeforeUse) ? data.stepsBeforeUse : [];
  const price = data.pricePerCallUsdc === 'free' ? 'Free' : '$' + data.pricePerCallUsdc + ' per call';
  return (
    <View>
      <ListCard
        title={data.name}
        rows={[
          { key: 'about', title: price, sub: data.category + ' · ' + data.state },
          ...inputs.map((f) => ({
            key: 'in-' + f.name,
            title: f.label,
            sub: [f.type, f.required ? 'required' : 'optional', f.options ? f.options.join('/') : null].filter(Boolean).join(' · '),
          })),
          ...steps.map((t, i) => ({ key: 'step-' + i, title: 'Step ' + (i + 1), sub: t })),
          ...(data.ownerTerms ? [{ key: 'terms', title: 'Owner\'s terms', sub: data.ownerTerms.youHaveAgreed === true ? 'You agreed' : data.ownerTerms.youHaveAgreed === false ? 'Agree on the provider\'s page before using it' : 'Yours' }] : []),
        ]}
      />
      <Pressable onPress={() => open({ pathname: '/provider/[id]', params: { id: String(data.id) } })} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
        <Text style={styles.link}>{data.canUseRightAway ? 'Open and try it' : 'Open this provider'}</Text>
      </Pressable>
    </View>
  );
}

/** The user's recent history, newest first. */
function ActivityCard({ data }: { data: any }) {
  const open = useOpenScreen();
  const isCreator = useIsCreator();
  const entries: any[] = Array.isArray(data.entries) ? data.entries : [];
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <View>
      <ListCard
        title="Your activity"
        emptyText="Nothing yet. Spend, earn or add credits and it shows up here."
        rows={entries.map((e, i) => ({
          key: String(i) + e.when,
          title: e.what,
          sub: [day(e.when), e.detail].filter(Boolean).join(' · '),
          right: e.amount,
          rightSub: e.state === 'done' ? undefined : e.state,
          rightSubColor: e.state === 'declined' ? Colors.tx2 : Colors.amber,
        }))}
      />
      {isCreator ? (
        <Pressable onPress={() => open('/activity')} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          <Text style={styles.link}>{data.hasMore ? 'See all activity' : 'Open Activity'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Invest providers (Backpack stocks, Nosana, GetEquity) ────────────────────

const usd2 = (n: unknown) => `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedPct = (n: unknown) => `${Number(n) >= 0 ? '+' : ''}${Number(n ?? 0).toFixed(2)}%`;
const pctColor = (n: unknown) => (Number(n) >= 0 ? Colors.sage : Colors.redAlert);

/** First array of objects in a GetEquity-style response ({ data: [...] }, { tokens: [...] }, a bare array...). */
function firstObjectArray(data: any): any[] | null {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return null;
  for (const key of ['data', 'tokens', 'results', 'items', 'orders', 'transactions', 'holdings', 'balances']) {
    const v = data[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const nested = firstObjectArray(v);
      if (nested) return nested;
    }
  }
  return null;
}

function renderInvestCard(toolName: string, data: any) {
  // Backpack stocks & ETFs
  if (toolName === 'search_stocks' && Array.isArray(data?.results)) {
    return (
      <ListCard
        title={`Stocks · market ${data.market ?? ''}`}
        emptyText="No match."
        rows={data.results.map((r: any) => ({
          key: String(r.ticker),
          title: r.ticker,
          sub: r.name,
          right: r.price != null ? usd2(r.price) : '—',
          rightSub: r.changePctToday != null ? signedPct(r.changePctToday) : undefined,
          rightSubColor: pctColor(r.changePctToday),
        }))}
      />
    );
  }
  if (toolName === 'get_stock' && data?.ticker) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{data.ticker}</Text>
          <Text style={styles.rowTitle}>{data.price != null ? usd2(data.price) : '—'}</Text>
        </View>
        <Text style={styles.sub}>{data.name}</Text>
        <Text style={[styles.sub, { color: pctColor(data.changePctToday) }]}>
          {data.changePctToday != null ? `${signedPct(data.changePctToday)} today` : ''}
          {data.changePct1Month != null ? `   ${signedPct(data.changePct1Month)} this month` : ''}
        </Text>
        {data.dayLow != null && data.dayHigh != null ? (
          <Text style={styles.sub}>Day range {usd2(data.dayLow)} – {usd2(data.dayHigh)}</Text>
        ) : null}
        <Text style={styles.sub}>Market {data.market}</Text>
      </View>
    );
  }
  if (toolName === 'get_stock_portfolio' && Array.isArray(data?.positions)) {
    return (
      <ListCard
        title={`Stock portfolio · ${usd2(data.totalUsd)}${data.creditUsd > 0 ? ` (incl. ${usd2(data.creditUsd)} credit)` : ''}`}
        emptyText="No positions yet."
        rows={data.positions.map((p: any) => ({
          key: String(p.ticker),
          title: p.ticker,
          sub: `${p.shares} shares · ${usd2(p.price)}`,
          right: usd2(p.valueUsd),
          rightSub: signedPct(p.changePctToday),
          rightSubColor: pctColor(p.changePctToday),
        }))}
      />
    );
  }

  // Nosana GPU cloud
  if (toolName === 'nosana_list_deployments' && Array.isArray(data?.deployments)) {
    return (
      <ListCard
        title="GPU deployments"
        emptyText="No deployments yet."
        rows={data.deployments.map((d: any) => ({
          key: String(d.id),
          title: d.name,
          sub: d.endpoint ?? `${d.replicas ?? 1} replica${(d.replicas ?? 1) !== 1 ? 's' : ''} · ${d.strategy ?? ''}`,
          right: d.status,
          rightSubColor: d.status === 'RUNNING' ? Colors.sage : undefined,
        }))}
      />
    );
  }
  if (
    ['nosana_get_deployment', 'nosana_create_deployment', 'nosana_start_deployment', 'nosana_stop_deployment', 'nosana_archive_deployment'].includes(toolName) &&
    data?.id
  ) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>{data.name}</Text>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{String(data.status).toLowerCase().replace(/_/g, ' ')}</Text>
          </View>
        </View>
        <Text style={styles.tinyMono} numberOfLines={1}>{data.id}</Text>
        {data.endpoint ? (
          <Text style={[styles.sub, { color: Colors.sage, textDecorationLine: 'underline' }]} onPress={() => Linking.openURL(data.endpoint)}>
            {data.endpoint}
          </Text>
        ) : null}
      </View>
    );
  }
  if (toolName === 'nosana_list_markets' && Array.isArray(data)) {
    return (
      <ListCard
        title="GPU markets"
        rows={data.slice(0, 12).map((m: any) => ({
          key: String(m.address),
          title: m.name,
          sub: `${m.gpu}${m.vram != null ? ` · ${m.vram}GB` : ''} · ${m.type}`,
          right: `${Number(m.price_nos_per_hour).toFixed(3)} NOS/hr`,
        }))}
      />
    );
  }
  if (toolName === 'nosana_get_credits' && data?.assignedCredits != null) {
    const available = Number(data.assignedCredits) - Number(data.reservedCredits) - Number(data.settledCredits);
    return (
      <View style={styles.card}>
        <Text style={styles.label}>Nosana credits</Text>
        <Text style={styles.title}>{available.toFixed(4)} NOS available</Text>
        <Text style={styles.sub}>
          Assigned {Number(data.assignedCredits).toFixed(2)} · Reserved {Number(data.reservedCredits).toFixed(2)} · Settled {Number(data.settledCredits).toFixed(2)}
        </Text>
      </View>
    );
  }

  // GetEquity private markets: its responses aren't typed on our side, so list whatever objects come back.
  if (toolName.startsWith('getequity_') && !data?.getEquityPayment) {
    const list = firstObjectArray(data);
    if (list && list.length > 0 && typeof list[0] === 'object') {
      const title = formatToolName(toolName.replace(/^getequity_/, ''));
      return (
        <ListCard
          title={`GetEquity · ${title}`}
          rows={list.slice(0, 10).map((r: any, i: number) => {
            const name = r.name ?? r.token_name ?? r.symbol ?? r.currency ?? r.type ?? r.reference ?? `Item ${i + 1}`;
            const amount = r.price ?? r.amount ?? r.balance ?? r.value ?? r.total;
            return {
              key: String(r.id ?? r._id ?? r.token_id ?? i),
              title: String(name),
              sub: [r.symbol, r.investment_type, r.status].filter(Boolean).join(' · ') || undefined,
              right: amount != null ? String(amount) : undefined,
            };
          })}
        />
      );
    }
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The right number of decimals for any USDC amount down to $0.000001. */
function fmtUsdc(n: number): string {
  if (n >= 0.01) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  return n.toFixed(6);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Flattens a tool's JSON output into a short, readable list of key/value rows. */
function summarize(output: unknown): [string, string][] {
  if (output == null) return [];
  if (Array.isArray(output)) {
    return output.slice(0, 5).map((item, i) => [String(i + 1), summarizeItem(item)]);
  }
  if (typeof output === 'object') {
    const entries = Object.entries(output as Record<string, unknown>).filter(
      ([k]) => !['success', 'action'].includes(k),
    );
    return entries.slice(0, 8).map(([k, v]) => [k, summarizeItem(v)]);
  }
  return [['result', String(output)]];
}

function summarizeItem(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return `${value.length} item${value.length !== 1 ? 's' : ''}`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const name = obj.name ?? obj.symbol ?? obj.description ?? obj.title;
    const amount = obj.amount ?? obj.amountUsdc ?? obj.currentValueUsd ?? obj.priceUsd;
    if (name && amount !== undefined) return `${name} — $${amount}`;
    if (name) return String(name);
    return JSON.stringify(obj).slice(0, 60);
  }
  return String(value);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    alignSelf: 'stretch',
    gap: 8,
    marginVertical: 4,
  },
  errorCard: { backgroundColor: 'rgba(224,82,82,0.08)', borderColor: 'rgba(224,82,82,0.25)' },
  successCard: { backgroundColor: 'rgba(143,174,130,0.08)', borderColor: Colors.borderSage },
  errorText: { ...Type.body, color: Colors.redAlert },
  successTitle: { ...Type.h3, color: Colors.sage },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  title: { ...Type.h3, color: Colors.tx0, flex: 1 },
  tag: { backgroundColor: Colors.bg2, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  tagText: { ...Type.small, color: Colors.tx1, textTransform: 'capitalize' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.md, paddingVertical: 4, paddingHorizontal: 10 },
  chipText: { ...Type.small, color: Colors.tx0 },
  label: { ...Type.label, color: Colors.tx1, marginBottom: 4 },
  sub: { ...Type.small, color: Colors.tx1 },
  strong: { fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  tinyText: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  tinyMono: { ...Type.small, fontSize: 11, fontFamily: Fonts.mono, color: Colors.tx2 },
  warn: { ...Type.small, color: Colors.amber },
  codeBox: { backgroundColor: Colors.bg0, borderRadius: Radii.md, padding: Spacing.md, gap: 4 },
  mono: { ...Type.small, fontFamily: Fonts.mono, color: Colors.tx0 },
  code: { fontFamily: Fonts.monoBold, fontSize: 16, letterSpacing: 2, color: Colors.sage },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  key: { ...Type.small, color: Colors.tx1, textTransform: 'capitalize' },
  value: { ...Type.small, color: Colors.tx0, flexShrink: 1, textAlign: 'right' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rowTitle: { ...Type.body, color: Colors.tx0 },
  amount: { ...Type.small, fontFamily: Fonts.mono, color: Colors.tx0 },
});
