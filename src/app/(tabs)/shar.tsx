import { useCallback, useState } from 'react';
import { CreatorOnly } from '@/components/shar/CreatorOnly';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ClaimSheet } from '@/components/shar/ClaimSheet';
import { HowSharWorks } from '@/components/shar/HowSharWorks';
import { SharOrb } from '@/components/shar/SharOrb';
import { ConvertSkrSheet } from '@/components/shar/ConvertSkrSheet';
import { SpendSkrCard } from '@/components/shar/SpendSkrCard';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SHAR_TIER_BLURB, SharColors } from '@/constants/shar';
import { useShar, useSharLeaderboard, useUseReferralCode, type SharActivity, type SharSummary } from '@/hooks/use-shar';
import { referralLink, referralMessage } from '@/lib/referral';

const TIER_LADDER = [
  { key: 'spark', name: 'Spark' },
  { key: 'wisp', name: 'Wisp' },
  { key: 'guide', name: 'Guide' },
  { key: 'seeker', name: 'Seeker' },
] as const;

const fmt = (n: number) => n.toLocaleString('en-US');

/** "3d 4h" / "5h 12m" until an ISO time. */
function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!(ms > 0)) return 'soon';
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${mins % 60}m` : `${Math.max(1, mins)}m`;
}

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M12 4l-6 6 6 6" stroke={Colors.tx0} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M6 3l5 5-5 5" stroke={Colors.tx1} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function SharScreen() {
  return (
    <CreatorOnly>
      <SharScreenContent />
    </CreatorOnly>
  );
}

function SharScreenContent() {
  const insets = useSafeAreaInsets();
  const summary = useShar();
  const board = useSharLeaderboard();
  // The screen stays mounted behind other screens, so refresh whenever it comes back into view (a claim, a purchase, a new week).
  const { refetch: refetchSummary } = summary;
  const { refetch: refetchBoard } = board;
  useFocusEffect(
    useCallback(() => {
      refetchSummary();
      refetchBoard();
    }, [refetchSummary, refetchBoard]),
  );
  const [howOpen, setHowOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const data = summary.data;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: Spacing.xxxl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
            <BackIcon />
          </Pressable>
          <Text style={styles.title}>Shar</Text>
          <Pressable onPress={() => setHowOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="How Shar works" style={styles.iconButton}>
            <Text style={styles.help}>?</Text>
          </Pressable>
        </View>

        {summary.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.tx1} />
          </View>
        ) : !data ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load Shar</Text>
            <Text style={styles.muted}>{(summary.error as Error | undefined)?.message ?? 'Check your connection and try again.'}</Text>
            <View style={{ marginTop: Spacing.md }}>
              <Button variant="outline" onPress={() => summary.refetch()}>
                Try again
              </Button>
            </View>
          </View>
        ) : (
          <>
            <Hero data={data} />
            {!data.ready ? (
              <View style={styles.setup}>
                <Text style={styles.setupText}>Claims, companions and the provider network are being switched on. Your Shar from spending already counts.</Text>
              </View>
            ) : null}
            <Ladder data={data} />
            <ClaimRow data={data} onClaim={() => setClaimOpen(true)} />
            <SpendSkrCard onConvert={() => setConvertOpen(true)} />
            <Trial board={board.data} loading={board.isLoading} />
            <Companions data={data} />
            <NetworkCard data={data} />
            <Journey items={data.activity} minPurchase={data.rules.minPurchaseUsd} />
          </>
        )}
      </ScrollView>

      <ConvertSkrSheet open={convertOpen} onClose={() => setConvertOpen(false)} />
      <HowSharWorks open={howOpen} onClose={() => setHowOpen(false)} rules={data?.rules} />
      {data ? <ClaimSheet open={claimOpen} onClose={() => setClaimOpen(false)} summary={data} /> : null}
    </View>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Hero({ data }: { data: SharSummary }) {
  return (
    <View style={[styles.card, styles.hero]}>
      <SharOrb size={140} />
      <Text style={styles.eyebrow}>YOUR SHAR</Text>
      <Text style={styles.balance} adjustsFontSizeToFit numberOfLines={1}>
        {fmt(data.available)}
      </Text>
      <Text style={styles.skr}>≈ {data.skr.availableSkr} SKR</Text>
      <Text style={styles.rate}>
        {data.rules.perUsd} Shar per $1 spent · from ${data.rules.minPurchaseUsd}
      </Text>
      <View style={styles.panel}>
        <View style={styles.panelCell}>
          <Text style={styles.panelLabel}>Available</Text>
          <Text style={styles.panelValue}>{fmt(data.available)}</Text>
        </View>
        <View style={styles.panelDivider} />
        <View style={styles.panelCell}>
          <Text style={styles.panelLabel}>Pending</Text>
          <Text style={[styles.panelValue, data.pending > 0 && { color: SharColors.pending }]}>{fmt(data.pending)}</Text>
        </View>
        <View style={styles.panelDivider} />
        <View style={styles.panelCell}>
          <Text style={styles.panelLabel}>This week</Text>
          <Text style={styles.panelValue}>{fmt(data.week)}</Text>
        </View>
      </View>
    </View>
  );
}

function Ladder({ data }: { data: SharSummary }) {
  const idx = TIER_LADDER.findIndex((t) => t.key === data.tier.tier);
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>{data.tier.name}</Text>
        <Text style={styles.mono}>
          {data.tier.next ? `${fmt(Math.max(0, data.tier.next.at - data.lifetime))} to ${data.tier.next.name}` : 'The light is yours'}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(4, Math.round(data.tier.progress * 100))}%` }]} />
      </View>
      <View style={styles.ladder}>
        {TIER_LADDER.map((t, i) => (
          <View key={t.key} style={styles.rung}>
            <View style={[styles.rungDot, i <= idx && styles.rungDotOn]} />
            <Text style={[styles.rungLabel, i === idx && { color: Colors.tx0 }]}>{t.name}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.muted}>{SHAR_TIER_BLURB[data.tier.tier]}</Text>
    </View>
  );
}

function ClaimRow({ data, onClaim }: { data: SharSummary; onClaim: () => void }) {
  const open = data.claim.open;
  const enough = data.available >= data.claim.minShar;
  return (
    <View style={{ gap: Spacing.sm }}>
      <Button fullWidth disabled={!enough || !!open || !data.ready} onPress={onClaim}>
        {open ? 'Claim in review' : 'Claim as SKR'}
      </Button>
      <Text style={[styles.muted, { textAlign: 'center' }]}>
        {open
          ? `${fmt(open.shar)} Shar → ${open.skr} SKR is on its way to your wallet.`
          : enough
            ? `1 Shar = ${data.rules.skrPerShar} SKR, fixed when you claim.`
            : `You can claim from ${fmt(data.claim.minShar)} Shar.`}
      </Text>
    </View>
  );
}

function Trial({ board, loading }: { board: ReturnType<typeof useSharLeaderboard>['data']; loading: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Weekly trial</Text>
        {board ? <Text style={styles.mono}>Resets in {timeLeft(board.weekEndsAt)}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.lg }} />
      ) : !board || board.top.length === 0 ? (
        <Text style={styles.muted}>No one has lit the way this week yet. Make a purchase and be first.</Text>
      ) : (
        <View style={styles.list}>
          {board.top.map((row) => (
            <View key={row.rank} style={[styles.boardRow, row.you && styles.boardRowYou]}>
              <Text style={[styles.rank, row.rank <= 3 && { color: Colors.gold }]}>{row.rank}</Text>
              <Text style={[styles.boardName, row.you && { color: Colors.tx0 }]} numberOfLines={1}>
                {row.you ? 'You' : row.handle}
              </Text>
              <Text style={styles.boardShar}>{fmt(row.shar)}</Text>
            </View>
          ))}
          {board.me.rank === null || board.me.rank > board.top.length ? (
            <Text style={[styles.muted, { marginTop: Spacing.sm }]}>
              {board.me.shar > 0 ? `You’re at ${fmt(board.me.shar)} Shar this week.` : 'You haven’t earned Shar this week yet.'}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function Companions({ data }: { data: SharSummary }) {
  const toast = useToast();
  const useCode = useUseReferralCode();
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mine = data.referral.code;

  const copy = async () => {
    if (!mine) return;
    await Clipboard.setStringAsync(mine);
    toast({ variant: 'success', title: 'Code copied' });
  };
  const share = () => {
    if (!mine) return;
    Share.share({ message: referralMessage(mine) }).catch(() => {});
  };
  const copyLink = async () => {
    if (!mine) return;
    await Clipboard.setStringAsync(referralLink(mine));
    toast({ variant: 'success', title: 'Link copied' });
  };
  const apply = async () => {
    setError(null);
    try {
      await useCode.mutateAsync(code.trim().toUpperCase());
      toast({ variant: 'success', title: 'Code applied', subtitle: 'Your companion earns a boost from your spending.' });
      setEntering(false);
      setCode('');
    } catch (e) {
      setError((e as Error)?.message ?? 'That code didn’t work.');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Companion boost</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>+{data.rules.referralBonusPct}%</Text>
        </View>
      </View>
      <Text style={styles.muted}>
        Invite a friend. You earn {data.rules.referralBonusPct}% of the Shar they earn from spending, on top of your own.
      </Text>
      {mine ? (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.code} selectable>
              {mine}
            </Text>
            <View style={styles.codeActions}>
              <Pressable onPress={copy} hitSlop={8}>
                <Text style={styles.link}>Copy</Text>
              </Pressable>
              <Pressable onPress={copyLink} hitSlop={8}>
                <Text style={styles.link}>Copy link</Text>
              </Pressable>
              <Pressable onPress={share} hitSlop={8}>
                <Text style={styles.link}>Share</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.mono}>
            {data.referral.referred} {data.referral.referred === 1 ? 'companion' : 'companions'} · +{fmt(data.referral.bonus)} Shar
          </Text>
        </>
      ) : null}
      {entering ? (
        <View style={{ gap: Spacing.sm }}>
          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <CodeInput value={code} onChange={setCode} />
            </View>
            <Button size="sm" disabled={code.trim().length !== 8} loading={useCode.isPending} onPress={apply}>
              Apply
            </Button>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : (
        <Pressable onPress={() => setEntering(true)} hitSlop={8}>
          <Text style={styles.link}>Have a code?</Text>
        </Pressable>
      )}
    </View>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // A plain TextInput: this screen isn't inside a bottom sheet.
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
      autoCapitalize="characters"
      autoCorrect={false}
      placeholder="8-character code"
      placeholderTextColor={Colors.tx2}
      style={styles.input}
    />
  );
}

function NetworkCard({ data }: { data: SharSummary }) {
  return (
    <Pressable onPress={() => router.push('/network')} style={styles.card} accessibilityRole="button">
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Open provider network</Text>
        <ChevronRight />
      </View>
      <Text style={styles.muted}>
        Add a provider or protocol. Once the team verifies it, you earn {data.rules.providerUseShar} Shar each time someone uses it.
      </Text>
      {data.provider.owned > 0 ? (
        <Text style={styles.mono}>
          {data.provider.owned} listed · {fmt(data.provider.earned)} Shar earned
        </Text>
      ) : null}
    </Pressable>
  );
}

function Journey({ items, minPurchase }: { items: SharActivity[]; minPurchase: number }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Journey log</Text>
        <Pressable onPress={() => router.push({ pathname: '/activity', params: { source: 'shar' } } as never)} hitSlop={10} accessibilityRole="button" accessibilityLabel="See all activity">
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text style={styles.muted}>Your journey starts with a purchase of ${minPurchase} or more.</Text>
      ) : (
        <View style={styles.list}>
          {items.map((a, i) => {
            const pending = a.state === 'pending';
            const negative = a.shar < 0;
            return (
              <View key={a.id} style={[styles.logRow, i > 0 && styles.logDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logTitle} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={styles.logSub}>
                    {new Date(a.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {pending ? ' · Pending' : a.state === 'requested' ? ' · In review' : a.state === 'paid' ? ' · Paid' : a.state === 'rejected' ? ' · Declined' : ''}
                  </Text>
                </View>
                <Text style={[styles.logAmount, pending && { color: SharColors.pending }, negative && { color: Colors.tx1 }]}>
                  {a.shar > 0 ? '+' : a.shar < 0 ? '−' : ''}
                  {fmt(Math.abs(a.shar))}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.h1, color: Colors.tx0 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  help: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.tx1 },
  center: { paddingVertical: Spacing.xxxl, alignItems: 'center' },
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.md },
  cardTitle: { ...Type.h2, color: Colors.tx0 },
  muted: { ...Type.body, color: Colors.tx1 },
  mono: { ...Type.label, color: Colors.tx2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  hero: { alignItems: 'center', borderColor: SharColors.tintBorder, gap: Spacing.xs, paddingTop: Spacing.xl },
  eyebrow: { ...Type.label, color: Colors.tx2, marginTop: Spacing.xs },
  balance: { ...Type.display, fontFamily: Fonts.monoBold, color: Colors.tx0, maxWidth: '100%' },
  skr: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.sage },
  rate: { ...Type.small, color: Colors.tx2, marginBottom: Spacing.md },
  panel: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.lg },
  panelCell: { flex: 1, alignItems: 'center', gap: 2 },
  panelDivider: { width: 1, backgroundColor: Colors.border },
  panelLabel: { ...Type.small, color: Colors.tx1 },
  panelValue: { fontFamily: Fonts.monoBold, fontSize: 18, color: Colors.tx0 },
  setup: { backgroundColor: 'rgba(232,168,56,0.10)', borderRadius: Radii.lg, borderWidth: 1, borderColor: 'rgba(232,168,56,0.30)', padding: Spacing.md },
  setupText: { ...Type.small, color: Colors.amber },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.bg2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: SharColors.body },
  ladder: { flexDirection: 'row', justifyContent: 'space-between' },
  rung: { alignItems: 'center', gap: 4, flex: 1 },
  rungDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.bg3 },
  rungDotOn: { backgroundColor: SharColors.glow },
  rungLabel: { ...Type.label, color: Colors.tx2 },
  list: { marginTop: Spacing.xs },
  seeAll: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: SharColors.glow },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10, paddingHorizontal: Spacing.sm, borderRadius: Radii.md },
  boardRowYou: { backgroundColor: SharColors.tint, borderWidth: 1, borderColor: SharColors.tintBorder },
  rank: { width: 22, fontFamily: Fonts.monoBold, fontSize: 13, color: Colors.tx2, textAlign: 'center' },
  boardName: { flex: 1, ...Type.body, color: Colors.tx1 },
  boardShar: { fontFamily: Fonts.monoBold, fontSize: 14, color: Colors.tx0 },
  pill: { backgroundColor: SharColors.tint, borderRadius: 999, borderWidth: 1, borderColor: SharColors.tintBorder, paddingVertical: 2, paddingHorizontal: 10 },
  pillText: { fontFamily: Fonts.monoBold, fontSize: 12, color: SharColors.glow },
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  code: { fontFamily: Fonts.monoBold, fontSize: 20, letterSpacing: 3, color: Colors.tx0 },
  codeActions: { flexDirection: 'row', gap: Spacing.lg },
  link: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage, textDecorationLine: 'underline' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 10, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Fonts.mono, fontSize: 14, letterSpacing: 2 },
  error: { ...Type.small, color: Colors.redAlert },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  logDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  logTitle: { ...Type.body, color: Colors.tx0 },
  logSub: { ...Type.small, color: Colors.tx2, marginTop: 2 },
  logAmount: { fontFamily: Fonts.monoBold, fontSize: 15, color: Colors.sage },
});
