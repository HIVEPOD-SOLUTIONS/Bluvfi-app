import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { AddCreditsSheet } from '@/components/shar/AddCreditsSheet';
import { EarningsCard, WithdrawSheet } from '@/components/shar/EarningsCard';
import { SharOrb } from '@/components/shar/SharOrb';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import {
  DEFAULT_BROWSE,
  PROVIDER_CATEGORIES,
  microToUsd,
  priceUsd,
  useCreator,
  useCredits,
  useMyProviders,
  useNetworkProviders,
  useShar,
  type MyProvider,
  type NetworkProvider,
  type ProviderBrowse,
  type ProviderSort,
} from '@/hooks/use-shar';

const fmt = (n: number) => n.toLocaleString('en-US');
const priceLabel = (p: string) => (Number(p) > 0 ? `${priceUsd(p)} / call` : 'Free');
const categoryLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

const STATUS: Record<MyProvider['status'], { label: string; color: string }> = {
  submitted: { label: 'In review', color: Colors.amber },
  verified: { label: 'Live', color: Colors.sage },
  rejected: { label: 'Not accepted', color: Colors.redAlert },
  paused: { label: 'Paused', color: Colors.tx2 },
};

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M12 4l-6 6 6 6" stroke={Colors.tx0} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'explore' | 'mine'>('explore');
  const [browse, setBrowse] = useState<ProviderBrowse>(DEFAULT_BROWSE);
  const [search, setSearch] = useState('');
  const shar = useShar();
  const explore = useNetworkProviders(browse);
  const mine = useMyProviders();
  const creatorState = useCreator();
  const credits = useCredits();
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  // The search box waits a moment after the last keystroke before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setBrowse((b) => (b.q === search.trim() ? b : { ...b, q: search.trim() })), 350);
    return () => clearTimeout(t);
  }, [search]);
  const filtered = browse.q !== '' || browse.category !== null || browse.free || browse.sort !== 'featured';
  const clearFilters = () => {
    setSearch('');
    setBrowse(DEFAULT_BROWSE);
  };
  const { refetch: refetchExplore } = explore;
  const { refetch: refetchMine } = mine;
  const { refetch: refetchCredits } = credits;
  const { refetch: refetchCreator } = creatorState;
  useFocusEffect(
    useCallback(() => {
      refetchExplore();
      refetchMine();
      refetchCredits();
      refetchCreator();
    }, [refetchExplore, refetchMine, refetchCredits, refetchCreator]),
  );

  // Adding a provider is for CREATORS, an opt-in sign-up: anyone else (or someone who must agree to new provider terms) is taken to the
  // sign-up first, which carries on to the form afterwards. Editing existing providers isn't gated. A failed lookup lets the form decide (the server checks too).
  const creator = creatorState.data?.creator ?? null;
  const needsSignup = !!creatorState.data && (creator === null || !creatorState.data.termsCurrent);
  const openForm = (remix: NetworkProvider | null) => {
    const params = remix ? { remix: remix.id } : {};
    if (needsSignup) return router.push({ pathname: '/creator', params: { next: 'provider', ...params } } as never);
    router.push({ pathname: '/provider/new', params } as never);
  };
  const openCreator = () => router.push('/creator' as never);
  const rules = shar.data?.rules;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: Spacing.xxxl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
            <BackIcon />
          </Pressable>
          <Text style={styles.title}>Open network</Text>
          <Pressable onPress={() => router.push({ pathname: '/faq', params: { section: 'network' } } as never)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Help with the network" style={styles.iconButton}>
            <Text style={styles.help}>?</Text>
          </Pressable>
        </View>

        <View style={styles.intro}>
          <SharOrb size={72} />
          <Text style={styles.introText}>
            {needsSignup
              ? 'Use any provider here. Run your own API or protocol? Sign up as a creator, which is optional, to list it and earn from every use.'
              : `Add a provider or protocol, or remix one. When it’s verified and people use it, you earn${rules ? ` ${rules.providerUseShar} Shar` : ' Shar'} for each use.`}
          </Text>
        </View>

        <View style={styles.segment}>
          {(['explore', 'mine'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.segmentItem, tab === t && styles.segmentOn]}>
              <Text style={[styles.segmentText, tab === t && { color: Colors.tx0 }]}>{t === 'explore' ? 'Explore' : 'My providers'}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'explore' && credits.data?.ready ? (
          <Pressable onPress={() => setCreditsOpen(true)} style={styles.creditsCard} accessibilityRole="button" accessibilityLabel="Add credits">
            <View style={{ flex: 1 }}>
              <Text style={styles.creditsLabel}>YOUR CREDITS</Text>
              <Text style={styles.creditsValue}>{microToUsd(credits.data.balanceMicro)}</Text>
              <Text style={styles.creditsSub}>Paid providers charge per call. Failed calls are never charged.</Text>
            </View>
            <View style={styles.creditsAdd}>
              <Text style={styles.creditsAddText}>Add</Text>
            </View>
          </Pressable>
        ) : null}
        {tab === 'explore' ? (
          <View style={{ gap: Spacing.sm }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search providers"
              placeholderTextColor={Colors.tx2}
              style={styles.search}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              maxLength={60}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {([['featured', 'Featured'], ['popular', 'Popular'], ['new', 'New']] as [ProviderSort, string][]).map(([key, label]) => (
                <Chip key={key} label={label} on={browse.sort === key} onPress={() => setBrowse((b) => ({ ...b, sort: key }))} />
              ))}
              <Chip label="Free" on={browse.free} onPress={() => setBrowse((b) => ({ ...b, free: !b.free }))} />
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip label="All" on={browse.category === null} onPress={() => setBrowse((b) => ({ ...b, category: null }))} />
              {PROVIDER_CATEGORIES.map((c) => (
                <Chip key={c.key} label={c.label} on={browse.category === c.key} onPress={() => setBrowse((b) => ({ ...b, category: b.category === c.key ? null : c.key }))} />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {tab === 'mine' ? <EarningsCard onWithdraw={() => setWithdrawOpen(true)} /> : null}

        {tab === 'explore' ? (
          explore.isLoading ? (
            <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxl }} />
          ) : explore.isError ? (
            <Notice title="Couldn’t load providers" body={(explore.error as Error).message} action="Try again" onAction={() => explore.refetch()} />
          ) : explore.data && explore.data.providers.length > 0 ? (
            explore.data.providers.map((p) => <ExploreCard key={p.id} p={p} onRemix={() => openForm(p)} />)
          ) : filtered ? (
            <Notice title="Nothing matches" body="Try different words, or clear the filters to see every provider." action="Clear filters" onAction={clearFilters} />
          ) : (
            <Notice
              title="No providers are live yet"
              body={explore.data?.ready === false ? 'The network is being switched on. You can add yours as soon as it is.' : 'Be the first. Add a provider and, once it’s verified, it shows up here.'}
              action={needsSignup ? 'Become a creator' : 'Add a provider'}
              onAction={() => openForm(null)}
            />
          )
        ) : mine.isLoading ? (
          <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxl }} />
        ) : mine.isError ? (
          <Notice title="Couldn’t load your providers" body={(mine.error as Error).message} action="Try again" onAction={() => mine.refetch()} />
        ) : mine.data && mine.data.providers.length > 0 ? (
          mine.data.providers.map((p) => (
            <MineCard
              key={p.id}
              p={p}
              onManage={() => router.push({ pathname: '/provider/edit/[id]', params: { id: p.id } } as never)}
            />
          ))
        ) : (
          needsSignup ? (
            <Notice title="Listing providers is optional" body="You don’t need to be a creator to use providers. Sign up (free, a minute) if you want to add your own, have the team verify it and earn from every use." action="Become a creator" onAction={() => openForm(null)} />
          ) : (
            <Notice title="You haven’t added a provider" body="Add one and it goes to the team for verification. Once it’s live, every use earns you Shar." action="Add a provider" onAction={() => openForm(null)} />
          )
        )}

        {tab === 'mine' && mine.data && mine.data.providers.length > 0 ? (
          <Button fullWidth onPress={() => openForm(null)}>
            {needsSignup ? 'Become a creator to add more' : 'Add a provider'}
          </Button>
        ) : null}
        {tab === 'mine' && creator ? (
          <Pressable onPress={openCreator} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: Spacing.sm }}>
            <Text style={styles.profileLink}>Creator profile · {creator.operatorType === 'company' ? creator.companyName : 'Individual'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <AddCreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />
      <WithdrawSheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </View>
  );
}

function Notice({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.muted}>{body}</Text>
      <View style={{ marginTop: Spacing.sm, alignSelf: 'flex-start' }}>
        <Button variant="outline" onPress={onAction}>
          {action}
        </Button>
      </View>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color: Colors.tx0 }]}>{label}</Text>
    </Pressable>
  );
}

const openProvider = (id: string) => router.push({ pathname: '/provider/[id]', params: { id } } as never);

function ExploreCard({ p, onRemix }: { p: NetworkProvider; onRemix: () => void }) {
  const free = !(Number(p.priceUsdc) > 0);
  return (
    <Pressable onPress={() => openProvider(p.id)} style={styles.card} accessibilityRole="button" accessibilityLabel={"Open " + p.name}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {p.name}
        </Text>
        <View style={styles.price}>
          <Text style={styles.priceText}>{priceLabel(p.priceUsdc)}</Text>
        </View>
      </View>
      <View style={styles.badges}>
        {p.featured ? (
          <View style={styles.featured}>
            <Text style={styles.featuredText}>★ Featured</Text>
          </View>
        ) : null}
        <Text style={styles.mono}>
          {categoryLabel(p.category)}
          {p.host ? ' · ' + p.host : ''}
        </Text>
      </View>
      <Text style={styles.muted} numberOfLines={4}>
        {p.summary}
      </Text>
      {p.remixOf ? <Text style={styles.remixTag}>Remix of {p.remixOf.name}</Text> : null}
      <Text style={styles.meta}>
        {fmt(p.uses)} {p.uses === 1 ? 'use' : 'uses'} · {fmt(p.remixes)} {p.remixes === 1 ? 'remix' : 'remixes'} · {p.mine ? 'yours' : p.owner}
      </Text>
      <View style={styles.actions}>
        <Button size="sm" onPress={() => openProvider(p.id)}>
          {free ? 'Open' : 'Open · ' + priceUsd(p.priceUsdc)}
        </Button>
        <Button size="sm" variant="outline" onPress={onRemix}>
          Remix
        </Button>
      </View>
    </Pressable>
  );
}

function MineCard({ p, onManage }: { p: MyProvider; onManage: () => void }) {
  const s = STATUS[p.status];
  let host = '';
  try {
    host = new URL(p.endpointUrl).hostname;
  } catch {
    host = p.endpointUrl;
  }
  return (
    <Pressable onPress={() => openProvider(p.id)} style={styles.card} accessibilityRole="button" accessibilityLabel={"Open " + p.name}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {p.name}
        </Text>
        <View style={[styles.status, { borderColor: s.color }]}>
          <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>
      <View style={styles.badges}>
        {p.featured ? (
          <View style={styles.featured}>
            <Text style={styles.featuredText}>★ Featured</Text>
          </View>
        ) : null}
        <Text style={styles.mono}>
          {categoryLabel(p.category)} · {host} · {priceLabel(p.priceUsdc)}
        </Text>
      </View>
      <Text style={styles.muted} numberOfLines={3}>
        {p.summary}
      </Text>
      {p.status === 'rejected' && p.reviewNote ? <Text style={styles.reason}>{p.reviewNote}</Text> : null}
      {p.status === 'submitted' && p.reviewNote ? (
        <Text style={styles.ask}>
          <Text style={{ fontFamily: Fonts.sansSemiBold }}>The team asked: </Text>
          {p.reviewNote}
        </Text>
      ) : null}
      {p.status === 'submitted' ? <Text style={styles.meta}>{p.reviewNote ? 'Open Manage to answer. It stays in the queue until you do.' : 'The team is checking it. You’ll see it go live here.'}</Text> : null}
      {p.status === 'paused' ? <Text style={styles.meta}>{p.pausedByOwner ? 'You paused it. Open Manage to resume it.' : 'The team paused it.'}</Text> : null}
      {p.status === 'verified' ? (
        <Text style={styles.meta}>
          {fmt(p.uses)} {p.uses === 1 ? 'use' : 'uses'} · <Text style={{ color: Colors.sage }}>{fmt(p.shar)} Shar earned</Text>
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button size="sm" variant="outline" onPress={onManage}>
          Manage
        </Button>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileLink: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: SharColors.glow },
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.h1, color: Colors.tx0 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  creditsCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.lg },
  creditsLabel: { ...Type.label, color: Colors.tx2 },
  creditsValue: { fontFamily: Fonts.monoBold, fontSize: 22, color: Colors.tx0, marginTop: 2 },
  help: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.tx1 },
  creditsSub: { ...Type.small, color: Colors.tx2, marginTop: 2 },
  creditsAdd: { backgroundColor: Colors.blue, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18 },
  creditsAddText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: '#FFFFFF' },
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: SharColors.tint, borderRadius: Radii.xxl, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.lg },
  introText: { ...Type.body, color: Colors.tx1, flex: 1 },
  segment: { flexDirection: 'row', backgroundColor: Colors.bg1, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, padding: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  segmentOn: { backgroundColor: Colors.bg3 },
  segmentText: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx1 },
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.sm },
  cardTitle: { ...Type.h2, color: Colors.tx0, flexShrink: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  muted: { ...Type.body, color: Colors.tx1 },
  mono: { ...Type.label, color: Colors.tx2 },
  meta: { ...Type.small, color: Colors.tx2 },
  price: { backgroundColor: Colors.bg2, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  priceText: { fontFamily: Fonts.monoBold, fontSize: 11, color: Colors.tx1 },
  remixTag: { ...Type.small, color: SharColors.glow },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  link: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage, textDecorationLine: 'underline', marginLeft: Spacing.sm },
  status: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  statusText: { fontFamily: Fonts.monoBold, fontSize: 11 },
  ask: { ...Type.small, color: Colors.amber },
  reason: { ...Type.small, color: Colors.redAlert },
  search: { backgroundColor: Colors.bg1, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, paddingVertical: 11, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Fonts.sansRegular, fontSize: 15 },
  chipRow: { gap: Spacing.sm, paddingRight: Spacing.xl },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: SharColors.tint, borderColor: SharColors.tintBorder },
  chipText: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  featured: { backgroundColor: SharColors.tint, borderWidth: 1, borderColor: SharColors.tintBorder, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  featuredText: { fontFamily: Fonts.monoBold, fontSize: 11, color: SharColors.glow },
});
