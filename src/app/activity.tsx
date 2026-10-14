import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreatorOnly } from '@/components/shar/CreatorOnly';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useActivity } from '@/hooks/use-shar';
import {
  ACTIVITY_SOURCES,
  formatAmount,
  groupByDay,
  isActivitySource,
  rowSubtitle,
  type ActivityItem,
  type ActivityKind,
  type ActivitySource,
  type Tone,
} from '@/lib/activity-format';

const TONE: Record<Tone, string> = { positive: Colors.sage, negative: Colors.tx0, muted: Colors.tx2, pending: SharColors.pending };

/** Everything that moved, newest first: Shar, credits and commission in one list. */
export default function ActivityScreen() {
  return (
    <CreatorOnly>
      <ActivityScreenContent />
    </CreatorOnly>
  );
}

function ActivityScreenContent() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string }>();
  const initial = Array.isArray(params.source) ? params.source[0] : params.source;
  const [source, setSource] = useState<ActivitySource>(isActivitySource(initial) ? initial : 'all');
  // Opened again with a different filter (a link while this screen is already showing): follow it.
  useEffect(() => {
    if (isActivitySource(initial)) setSource(initial);
  }, [initial]);
  const q = useActivity(source);
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const sections = useMemo(() => groupByDay(items), [items]);
  const notReady = q.data?.pages.some((p) => !p.ready) ?? false;

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xxxl * 2, paddingHorizontal: Spacing.xl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => refetch()} tintColor={Colors.tx1} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.lg, marginBottom: Spacing.md }}>
            <View style={styles.header}>
              <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
                <BackIcon />
              </Pressable>
              <Text style={styles.title}>Activity</Text>
              <Pressable onPress={() => router.push({ pathname: '/faq', params: { open: 'activity-what' } } as never)} hitSlop={12} accessibilityRole="button" accessibilityLabel="What shows up here" style={styles.iconButton}>
                <Text style={styles.help}>?</Text>
              </Pressable>
            </View>
            <View style={styles.chips}>
              {ACTIVITY_SOURCES.map((s) => (
                <Pressable key={s.key} onPress={() => setSource(s.key)} accessibilityRole="button" accessibilityState={{ selected: source === s.key }} style={[styles.chip, source === s.key && styles.chipOn]}>
                  <Text style={[styles.chipText, source === s.key && { color: Colors.tx0 }]}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
            {notReady ? (
              <View style={styles.setup}>
                <Text style={styles.setupText}>Some of your history is still being switched on, so it may be incomplete for now.</Text>
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
        renderItem={({ item, index, section }) => <Row item={item} first={index === 0} last={index === section.data.length - 1} />}
        SectionSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
        ListEmptyComponent={
          q.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={Colors.tx1} />
            </View>
          ) : q.isError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Couldn’t load your activity</Text>
              <Text style={styles.emptyBody}>{(q.error as Error | undefined)?.message ?? 'Check your connection and try again.'}</Text>
              <Button variant="outline" onPress={() => refetch()}>
                Try again
              </Button>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <ClockIcon color={Colors.tx2} size={26} />
              </View>
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptyBody}>
                {source === 'credits'
                  ? 'Credits you add and spend on providers will show up here.'
                  : source === 'commission'
                    ? 'When people use your paid providers, your commission shows up here.'
                    : source === 'shar'
                      ? 'Shar you earn, claim and spend will show up here.'
                      : 'Spend, earn or add credits and it will show up here.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={Colors.tx1} style={{ marginTop: Spacing.lg }} /> : null}
      />
    </View>
  );
}

function Row({ item, first, last }: { item: ActivityItem; first: boolean; last: boolean }) {
  const amount = formatAmount(item);
  return (
    <View style={[styles.row, first && styles.rowFirst, last && styles.rowLast, !last && styles.rowDivider]}>
      <View style={styles.rowIcon}>
        <KindIcon kind={item.kind} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {rowSubtitle(item)}
        </Text>
      </View>
      <Text style={[styles.rowAmount, { color: TONE[amount.tone] }]}>{amount.text}</Text>
    </View>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={Colors.tx0} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ClockIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M12 7v5l3 2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** One simple glyph per kind, so a long list can be scanned by shape as well as by words. */
function KindIcon({ kind }: { kind: ActivityKind }) {
  const c = Colors.tx1;
  const stroke = { stroke: c, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (kind) {
    case 'purchase':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M5 8h14l-1 11H6L5 8z" {...stroke} />
          <Path d="M9 8V6a3 3 0 016 0v2" {...stroke} />
        </Svg>
      );
    case 'spark':
    case 'prize':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={4} {...stroke} />
          <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" {...stroke} />
        </Svg>
      );
    case 'provider':
    case 'earned':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M12 3l2.4 5.6L20 9.5l-4.2 3.9L17 20l-5-3-5 3 1.2-6.6L4 9.5l5.6-.9L12 3z" {...stroke} />
        </Svg>
      );
    case 'claim':
    case 'withdrawal':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M12 4v11M7 10l5 5 5-5M5 20h14" {...stroke} />
        </Svg>
      );
    case 'topup':
    case 'refund':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M12 20V9M7 14l5-5 5 5M5 4h14" {...stroke} />
        </Svg>
      );
    default:
      return <ClockIcon color={c} />;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.h1, color: Colors.tx0 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  help: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.tx1 },
  chips: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg1, paddingVertical: 8, paddingHorizontal: Spacing.lg },
  chipOn: { backgroundColor: SharColors.tint, borderColor: SharColors.tintBorder },
  chipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.tx1 },
  setup: { backgroundColor: 'rgba(232,168,56,0.10)', borderRadius: Radii.lg, borderWidth: 1, borderColor: 'rgba(232,168,56,0.30)', padding: Spacing.md },
  setupText: { ...Type.small, color: Colors.amber },
  day: { ...Type.label, color: Colors.tx2, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg1, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: Radii.xl, borderBottomRightRadius: Radii.xl },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg2, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  rowSub: { ...Type.small, color: Colors.tx2, marginTop: 2 },
  rowAmount: { fontFamily: Fonts.monoBold, fontSize: 14 },
  center: { paddingVertical: Spacing.xxxl, alignItems: 'center' },
  empty: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  emptyTitle: { ...Type.h2, color: Colors.tx0 },
  emptyBody: { ...Type.body, color: Colors.tx1, textAlign: 'center' },
});
