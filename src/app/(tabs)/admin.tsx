import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ListingReviewSheet } from '@/components/admin/ListingReviewSheet';
import { PayoutSheet } from '@/components/admin/PayoutSheet';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { microToUsd, useAdminMe, useAdminQueue, usePayoutAction, type QueueListing, type QueuePayout } from '@/hooks/use-shar';

const short = (s: string, n = 6) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
const age = (min: number) => (min < 60 ? `${Math.max(1, min)}m` : min < 1440 ? `${Math.floor(min / 60)}h` : `${Math.floor(min / 1440)}d`);
const skrText = (p: QueuePayout) => (p.skr ? `${Number(p.skr).toLocaleString('en-US', { maximumFractionDigits: 2 })} SKR` : p.usd ? `$${p.usd}` : '—');

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M12 4l-6 6 6 6" stroke={Colors.tx0} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The team's queue: providers to review, payouts to click, the treasury, and what was done. Admins only (the server checks every call). */
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const me = useAdminMe();
  const isAdmin = !!me.data?.admin;
  const queue = useAdminQueue(isAdmin);
  const reconcile = usePayoutAction();
  const [review, setReview] = useState<QueueListing | null>(null);
  const [pay, setPay] = useState<QueuePayout | null>(null);

  const { refetch } = queue;
  useFocusEffect(
    useCallback(() => {
      if (isAdmin) refetch();
    }, [isAdmin, refetch]),
  );

  const q = queue.data;
  const runReconcile = async (p: QueuePayout) => {
    try {
      const res = await reconcile.mutateAsync({ kind: p.kind, id: p.id, action: 'reconcile' });
      toast({ variant: res.outcome === 'paid' ? 'success' : 'error', title: res.outcome === 'paid' ? 'Paid' : res.outcome === 'released' ? 'Back in the queue' : 'Still waiting', subtitle: res.message });
    } catch (e) {
      toast({ variant: 'error', title: 'Couldn’t reconcile', subtitle: (e as Error)?.message });
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: Spacing.xxxl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
            <BackIcon />
          </Pressable>
          <Text style={styles.title}>Admin</Text>
          <View style={{ width: 36 }} />
        </View>

        {me.isLoading ? (
          <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxl }} />
        ) : !isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Not available</Text>
            <Text style={styles.muted}>This area is for the Bluvfi team.</Text>
          </View>
        ) : queue.isLoading ? (
          <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxl }} />
        ) : !q ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load the queue</Text>
            <Text style={styles.muted}>{(queue.error as Error | undefined)?.message ?? 'Try again.'}</Text>
            <View style={{ alignSelf: 'flex-start', marginTop: Spacing.sm }}>
              <Button variant="outline" onPress={() => queue.refetch()}>
                Try again
              </Button>
            </View>
          </View>
        ) : (
          <>
            {/* Treasury */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Treasury</Text>
              {q.treasury.configured ? (
                <>
                  <View style={styles.stats}>
                    <Stat label="SKR" value={Number(q.treasury.skr).toLocaleString('en-US', { maximumFractionDigits: 2 })} />
                    <Stat label="SOL" value={q.treasury.sol} />
                  </View>
                  <Pressable
                    onPress={async () => {
                      await Clipboard.setStringAsync(q.treasury.configured ? q.treasury.address : '');
                      toast({ variant: 'success', title: 'Treasury address copied' });
                    }}
                  >
                    <Text style={styles.mono}>{short(q.treasury.address, 8)} · tap to copy</Text>
                  </Pressable>
                  <Text style={styles.muted}>
                    Sent in the last 24h: {Number(q.limits.paidLast24hSkr).toLocaleString('en-US', { maximumFractionDigits: 2 })} of {q.limits.dailyCapSkr.toLocaleString('en-US')} SKR · single payout max {q.limits.maxPayoutSkr.toLocaleString('en-US')} SKR
                  </Text>
                </>
              ) : (
                <Text style={[styles.muted, { color: Colors.amber }]}>SKR payouts aren’t set up on the server yet: add SKR_TREASURY_PRIVATE_KEY and fund that wallet with SKR and a little SOL.</Text>
              )}
            </View>

            {/* Providers to review */}
            <Section title="Providers to review" count={q.listings.length} empty="Nothing waiting." />
            {q.listings.map((l) => (
              <Pressable key={l.id} onPress={() => setReview(l)} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {l.category} · {Number(l.priceUsdc) > 0 ? `$${l.priceUsdc}/call` : 'free'} · {safeHost(l.endpointUrl)}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}

            {/* Agent payments we couldn't confirm: only shown when something needs a person to check it on-chain */}
            {q.stuckX402 && q.stuckX402.length > 0 ? (
              <>
                <Section title="Agent payments to check" count={q.stuckX402.length} />
                {q.stuckX402.map((s) => (
                  <View key={s.id} style={styles.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {microToUsd(s.amountMicro)} · {s.listing ?? 'a provider'}
                      </Text>
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {s.payer ? short(s.payer) : 'unknown wallet'} · stuck for {age(Math.max(0, Math.round((Date.now() - new Date(s.since).getTime()) / 60_000)))}
                      </Text>
                    </View>
                  </View>
                ))}
                <Text style={styles.muted}>We asked the payment service to settle these and never heard back. Look the payer wallet up on-chain: if the USDC arrived, credit the owner by hand; if not, there is nothing to do. Don’t pay anything twice.</Text>
              </>
            ) : null}

            {/* Payouts */}
            <Section title="Payouts to send" count={q.payouts.waiting.length} empty="Nothing waiting." />
            {q.payouts.waiting.map((p) => (
              <Pressable key={`${p.kind}:${p.id}`} onPress={() => setPay(p)} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>
                    {p.kind === 'commission' ? 'Commission' : 'Shar claim'} · {skrText(p)}
                  </Text>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {short(p.wallet)} · {age(p.ageMinutes)} ago{p.note ? ` · ${p.note}` : ''}
                    {p.risk && p.risk.flags.length > 0 ? <Text style={{ color: Colors.amber }}>{` · ⚠ linked to ${p.risk.linkedAccounts}`}</Text> : null}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}

            {q.payouts.sending.length > 0 ? (
              <>
                <Section title="Sending" count={q.payouts.sending.length} />
                {q.payouts.sending.map((p) => (
                  <View key={`${p.kind}:${p.id}`} style={styles.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>
                        {p.kind === 'commission' ? 'Commission' : 'Shar claim'} · {skrText(p)}
                      </Text>
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {short(p.wallet)} · started {age(p.ageMinutes)} ago
                      </Text>
                    </View>
                    <Button size="sm" variant="outline" loading={reconcile.isPending} onPress={() => runReconcile(p)}>
                      Reconcile
                    </Button>
                  </View>
                ))}
                <Text style={styles.muted}>Reconcile checks the chain: it marks a landed payment as paid, and only puts it back in the queue once it can provably never land. It is safe to press any time.</Text>
              </>
            ) : null}

            {q.payouts.paid.length > 0 ? (
              <>
                <Section title="Recently paid" count={q.payouts.paid.length} />
                {q.payouts.paid.map((p) => (
                  <Pressable key={`${p.kind}:${p.id}`} onPress={() => p.tx && Linking.openURL(`https://solscan.io/tx/${p.tx}`).catch(() => {})} style={styles.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>
                        {skrText(p)} · {p.kind === 'commission' ? 'commission' : 'claim'}
                      </Text>
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {short(p.wallet)} · {p.tx ? short(p.tx, 6) : ''}
                      </Text>
                    </View>
                    <Text style={[styles.itemSub, { color: Colors.sage }]}>Paid</Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            {/* Audit */}
            <Section title="What the team did" count={q.audit.length} empty="Nothing yet." />
            {q.audit.map((a) => (
              <View key={a.id} style={styles.auditRow}>
                <Text style={styles.auditText}>
                  <Text style={{ color: Colors.tx0 }}>{a.action}</Text> · {a.targetType} {short(a.targetId, 4)}
                  {a.detail ? ` · ${a.detail.slice(0, 40)}` : ''}
                </Text>
                <Text style={styles.auditTime}>{a.at ? new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <ListingReviewSheet listing={review} onClose={() => setReview(null)} />
      <PayoutSheet payout={pay} onClose={() => setPay(null)} />
    </View>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function Section({ title, count, empty }: { title: string; count: number; empty?: string }) {
  return (
    <View style={{ marginTop: Spacing.sm }}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.count}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      </View>
      {count === 0 && empty ? <Text style={styles.muted}>{empty}</Text> : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.h1, color: Colors.tx0 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.sm },
  cardTitle: { ...Type.h2, color: Colors.tx0 },
  muted: { ...Type.small, color: Colors.tx2 },
  mono: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.tx1 },
  stats: { flexDirection: 'row', gap: Spacing.md },
  stat: { flex: 1, backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 2 },
  statLabel: { ...Type.label, color: Colors.tx2 },
  statValue: { fontFamily: Fonts.monoBold, fontSize: 18, color: Colors.tx0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  sectionTitle: { ...Type.h3, color: Colors.tx0 },
  count: { backgroundColor: Colors.bg2, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 8 },
  countText: { fontFamily: Fonts.monoBold, fontSize: 11, color: Colors.tx1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg1, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg },
  itemTitle: { ...Type.body, color: Colors.tx0, fontFamily: Fonts.sansSemiBold },
  itemSub: { ...Type.small, color: Colors.tx2, marginTop: 2 },
  chevron: { fontSize: 22, color: Colors.tx1 },
  auditRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 4 },
  auditText: { ...Type.small, color: Colors.tx2, flex: 1 },
  auditTime: { ...Type.small, color: Colors.tx2 },
});
